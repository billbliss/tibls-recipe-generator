import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
dotenv.config();

import bodyParser from 'body-parser';
import multer from 'multer';

import { createLogger } from './utils/core-utils';
const { log, error, close } = createLogger('server-log.txt');

import { getBaseUrl, isUrl, fetchImageAsBase64DataUrl } from './utils/core-utils';

import { resolveFromRoot, saveImageToPublicDir } from './utils/file-utils';

// Services used by the routes exposed in this module
import { handlePdfFile } from './services/pdfService';
import { handleUrl } from './services/urlService';
import { processRecipeWithChatGPT, processImageRecipe } from './services/chatgptService';
import { renderViewerHtml } from './services/viewerUiService';
import { WebhookInput, ResponseMode } from './types/types';
import { TiblsRecipe } from './types/recipeStoreTypes';

// Import storage layer
import { createRecipeStore } from './services/recipeStore';
const recipeStore = createRecipeStore();

// Ensure underlying store is initialized exactly once
const storeReady: Promise<void> = (async () => {
  try {
    if (typeof (recipeStore as any).initialize === 'function') {
      await (recipeStore as any).initialize();
    }
  } catch (e) {
    error('Failed to initialize recipe store', e);
  }
})();

export const app = express(); // Exported for integration tests
const port = process.env.PORT || 3000;

app.use(bodyParser.json({ limit: '10mb' }));
const upload = multer();

// Serve static files from the public directory
// This includes the viewer HTML, CSS, and JavaScript files
// The static files are served from the public directory at the root URL
// The public directory contains the viewer UI and other static assets
// The static files are served with a cache control header for images to improve performance
// Images in the img/recipe/images directory are cached for 1 year
app.use(
  express.static(resolveFromRoot('public'), {
    setHeaders: (res, filePath) => {
      if (filePath.includes('/img/recipe/images/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
      }
    }
  })
);

// Image upload route for ogImageUpload
app.post(
  '/upload-image',
  upload.single('ogImageUpload'),
  async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    try {
      const relativePath = saveImageToPublicDir(file.buffer, file.originalname);
      const publicUrl = `${getBaseUrl(req)}${relativePath}`;
      res.json({ url: publicUrl });
    } catch (err) {
      console.error('Failed to save uploaded image:', err);
      res.status(500).json({ error: 'Failed to save uploaded image' });
    }
  }
);

// This route handles the webhook POST requests
// It expects a JSON body with the following fields:
// - `input`: a URL or text input for the recipe
// - `filename`: an optional filename for an uploaded image or PDF
// - `responseMode`: controls the response behavior (VIEWER or JSON)
// It expects a JSON body with an `input` field for a URL; the filename and filetype are used for images/PDFs
// It uses OpenAI's API to process the input and generate a Tibls JSON object.
// responseMode controls the response behavior:
// - VIEWER: returns a URL to the viewer page for the generated recipe
// - JSON: returns the raw Tibls JSON object
app.post('/webhook', upload.array('filename'), async (req: Request, res: Response) => {
  await storeReady;
  let input = req.body.input;
  const files: Express.Multer.File[] = Array.isArray(req.files) ? req.files : [];
  const firstFile = files.length > 0 ? files[0] : undefined;
  const responseMode: ResponseMode = (req.body.responseMode as ResponseMode) || ResponseMode.VIEWER;
  let webhookInput: WebhookInput = WebhookInput.INVALID;

  // Early rejection of unsupported file types (if a file is uploaded)
  if (firstFile && !['application/pdf', 'image/png', 'image/jpeg'].includes(firstFile.mimetype)) {
    res.status(415).json({ error: `Unsupported file type: ${firstFile.mimetype}` });
    return;
  }

  // Validate responseMode
  if (![ResponseMode.VIEWER, ResponseMode.JSON].includes(responseMode)) {
    res.status(400).json({ error: `Unsupported responseMode: ${responseMode}` });
    return;
  }
  // Determine what's being input to the webhook
  if (!input && firstFile && firstFile.mimetype === 'application/pdf') {
    webhookInput = WebhookInput.PDF;
  } else if (!input && firstFile && firstFile.mimetype.startsWith('image/')) {
    webhookInput = WebhookInput.IMAGE;
  } else if (input && typeof input === 'string' && isUrl(input)) {
    webhookInput = WebhookInput.URL;
  } else if (input && typeof input === 'string') {
    webhookInput = WebhookInput.TEXT;
  }

  switch (webhookInput) {
    case WebhookInput.PDF:
      const baseUrl = getBaseUrl(req);
      if (!firstFile?.buffer) {
        throw new Error('No PDF buffer found for uploaded file');
      }
      try {
        const pdfResult = await handlePdfFile(firstFile.buffer, baseUrl);
        // If needed, assign extracted text or ogImageUrl back to req.body
        input = pdfResult.text;
        if (pdfResult.ogImageUrl) {
          req.body.ogImageUrl = pdfResult.ogImageUrl;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown PDF processing error';
        error('Failed to process PDF:', err);
        res.status(500).json({ error: message });
        return;
      }
      break;
    case WebhookInput.IMAGE:
      if (files.length === 0) {
        throw new Error('No image buffers found for uploaded files');
      }
      break;
    case WebhookInput.URL:
      const recipeUrl = input.trim();
      try {
        input = await handleUrl(recipeUrl);
      } catch (err) {
        if (process.env.NODE_ENV === 'test') {
          res.status(500).json({ error: (err as Error).message });
          return;
        }
        error('Failed to fetch HTML for URL:', err);
        const errMessage = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: `Failed to fetch page HTML from URL: ${errMessage}` });
        return;
      }
      break;
    case WebhookInput.TEXT:
      // Reject if input is provided but accompanied by any file that's not a single image
      if (
        typeof input === 'string' &&
        input.trim() !== '' &&
        files.length > 0 &&
        !(files.length === 1 && files[0].mimetype.startsWith('image/'))
      ) {
        res.status(500).json({
          error: 'If text input is submitted, only a single image file can be submitted with it.'
        });
        return;
      }
      // No additional processing needed; input is set (by definition) and ogImageUrl stays as provided (or undefined)
      break;
    case WebhookInput.INVALID:
      res.status(400).json({ error: 'Invalid webhook inputs.' });
      return;
  }

  // Validate input after switch - the functions in ./services, which implement the handle* functions,
  // are allowed to modify input, so this check must come after these functions have executed.
  // Return an error if there's no text or image input.
  if ((!input || typeof input !== 'string') && !firstFile?.buffer) {
    res.status(400).json({ error: 'Missing or invalid `input` field or image file' });
    return;
  }

  // after determining input & responseMode
  const baseUrl = getBaseUrl(req);

  try {
    let tiblsJson: any;
    if (webhookInput === WebhookInput.IMAGE) {
      const imageBuffers = files.map((f) => f.buffer);
      tiblsJson = await processImageRecipe(input, imageBuffers);
    } else {
      tiblsJson = await processRecipeWithChatGPT(input, req.body.ogImageUrl);
    }
    if (responseMode === ResponseMode.VIEWER) {
      const filename = await recipeStore.saveRecipe(tiblsJson);
      res.json({ status: 'queued', viewer: `${baseUrl}/recipe-collection/${filename}` });
    } else if (responseMode === ResponseMode.JSON) {
      res.json(tiblsJson);
    }
  } catch (err: any) {
    error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// This route serves a specific recipe from the collection by filename
// It fetches the collection content and returns the requested recipe
app.get('/recipe-file/:filename(*)', async (req: Request, res: Response) => {
  const filename = req.params.filename;

  try {
    await storeReady;
    const fileContent = await recipeStore.loadRecipe(filename);
    if (!fileContent) {
      res.status(404).send('File not found');
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.send(fileContent);
  } catch (err: any) {
    error('Error fetching recipe content:', err);
    if (process.env.NODE_ENV === 'test') {
      res.status(500).json({ error: err?.message || String(err), stack: err?.stack });
    } else {
      res.status(500).send('Failed to retrieve file');
    }
  }
});

app.get(['/', '/recipe-collection/:recipeId'], async (req, res) => {
  const baseUrl = getBaseUrl(req);

  try {
    await storeReady;
    const recipes = await recipeStore.loadAllRecipes(baseUrl);
    const html = renderViewerHtml(recipes);
    res.send(html);
  } catch (err) {
    error('Error fetching recipes:', err);
    res.status(500).send('Error loading recipe collection.');
  }
});

// Saves edited Tibls JSON to storage
app.post('/update-recipe-image', async (req: Request, res: Response) => {
  const filename = req.body.filename;
  if (!filename) {
    res.status(400).json({
      success: false,
      error: 'The filename for the recipe you are trying to save is required.'
    });
    return;
  }

  const updatedOgImageUrl = req.body.ogImageUrl;
  if (!updatedOgImageUrl) {
    res.status(400).json({
      success: false,
      error: 'The new ogImageUrl is required.'
    });
    return;
  }

  try {
    await storeReady;
    // Fetch the original recipe JSON from storage using loadRecipe
    const originalJson = await recipeStore.loadRecipe(filename);
    if (!originalJson) {
      res.status(404).json({
        success: false,
        error: `Original recipe file "${filename}" not found in recipe collection.`
      });
      return;
    }

    const updatedJson = {
      ...originalJson,
      itemListElement: originalJson.itemListElement.map((item: TiblsRecipe, index: number) =>
        index === 0 ? { ...item, ogImageUrl: req.body.ogImageUrl } : item
      )
    };

    const updatedFilename = await recipeStore.saveRecipe(updatedJson, filename);
    res.json({ success: true, filename: `${updatedFilename}` });
  } catch (err: any) {
    if (err.message?.includes('Invalid Tibls JSON format')) {
      res.status(422).send({ error: err.message });
    } else {
      res.status(500).send({ error: 'Internal server error' });
    }
  }
});

// This route converts an image URL to a base64 data URL
// It fetches the image from the provided URL, converts it to base64, and returns it in a JSON response
app.get(
  '/image/base64',
  async function (req: express.Request, res: express.Response): Promise<void> {
    const imageUrl = req.query.url as string;

    if (!imageUrl) {
      res.status(400).json({ error: 'Missing "url" query parameter.' });
      return;
    }

    try {
      const dataUrl = await fetchImageAsBase64DataUrl(imageUrl);
      res.json({ base64: dataUrl });
    } catch (err: any) {
      console.error('Error fetching image:', err);
      res.status(502).json({ error: err.message || 'Failed to fetch or convert the image.' });
    }
  }
);

// Starts the Express server
if (process.env.NODE_ENV !== 'test') {
  // Ensure test scripts don't start another instance
  app.listen(port, () => {
    log(`Server is running on port ${port}`);
  });
}

// More graceful shutdown handling
process.on('SIGTERM', () => {
  if (process.env.NODE_ENV !== 'test') {
    log('Received SIGTERM, shutting down...');
    close(); // Close the logger stream
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  log('Received SIGINT (Ctrl+C), shutting down...');
  close(); // flush and close the log file
  process.exit(0);
});
