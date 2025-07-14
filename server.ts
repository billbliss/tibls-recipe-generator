import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import vision from '@google-cloud/vision';
import { execFile } from 'child_process';
import { promisify } from 'util';

import * as cheerio from 'cheerio';
const execFileAsync = promisify(execFile);

import { createLogger } from './utils/core-utils';
const { log, error, close } = createLogger('server-log.txt');

import {
  getBaseUrl,
  loadGoogleCredentialsFromBase64,
  isUrl,
  fetchWithRetry,
  fetchImageAsBase64DataUrl
} from './utils/core-utils';

import {
  resolveFromRoot,
  generateRecipeFilename,
  extractTextFromPdf,
  extractEmbeddedImageFromPdf,
  saveImageToPublicDir
} from './utils/file-utils';

import { applyPerServingCaloriesOverride, enforcePerServingCalories } from './utils/recipe-utils';

const signficantPdfTextLength = 50; // Minimum length of meaningful text to consider the PDF valid
import { ResponseMode } from './types/types';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Load system prompt and schema from source files
const tiblsPrompt = fs.readFileSync(resolveFromRoot('prompts', 'chatgpt-instructions.md'), 'utf8');
const tiblsSchema = JSON.parse(
  fs.readFileSync(resolveFromRoot('prompts', 'tibls-schema.json'), 'utf8')
);

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
// - `imageFormat`: optional, values are ['url', 'base64'} - specifies the image format for ogImageUrl
//    default value comes from process.env.DEFAULT_IMAGE_FORMAT; if that's not present, it defaults to 'url'.
// It expects a JSON body with an `input` field for a URL; the filename and filetype are used for images/PDFs
// It uses OpenAI's API to process the input and generate a Tibls JSON object.
// responseMode controls the response behavior:
// - VIEWER: returns a URL to the viewer page for the generated recipe
// - JSON: returns the raw Tibls JSON object
app.post('/webhook', upload.single('filename'), async (req: Request, res: Response) => {
  let input = req.body.input;
  const file = req.file;
  const responseMode: ResponseMode = (req.body.responseMode as ResponseMode) || ResponseMode.VIEWER;
  const imageFormat = req.body.imageFormat || process.env.DEFAULT_IMAGE_FORMAT || 'url';

  // If there's no value in the `input` field, check if a PDF file was uploaded
  // If the file is a PDF, extract text from it using pdf-parse
  // If the PDF contains significant text, use that as input, and look for an embedded image - save it as ogImageUrl
  // If the PDF does not contain significant text, rasterize the first page to an image
  // and use Google Vision API to perform OCR on the image to extract text
  if (!input && file && file.mimetype === 'application/pdf') {
    const tempPdfPath = path.join('/tmp', `upload-${Date.now()}.pdf`);
    fs.mkdirSync(path.dirname(tempPdfPath), { recursive: true });
    fs.writeFileSync(tempPdfPath, file.buffer);

    const pdfText = await extractTextFromPdf(file.buffer);
    if (pdfText.length > signficantPdfTextLength) {
      input = pdfText;
      // Extract ogImageUrl from PDF if available
      const ogImageUrl = await extractEmbeddedImageFromPdf(tempPdfPath, req);
      if (ogImageUrl) {
        req.body.ogImageUrl = ogImageUrl;
      }
    } else {
      // If the PDF does not contain significant text, rasterize the first page to an image
      const pngPath = path.join('/tmp', `page1-${Date.now()}.png`);
      try {
        await execFileAsync('convert', [`${tempPdfPath}[0]`, pngPath]);
      } catch (err) {
        throw new Error(`ImageMagick failed: ${err}`);
      }

      const imageBuffer = fs.readFileSync(pngPath);

      // Initialize Vision client
      loadGoogleCredentialsFromBase64();
      const visionClient = new vision.ImageAnnotatorClient({
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
      });

      try {
        const [result] = await visionClient.textDetection({
          image: { content: imageBuffer }
        });

        const detections = result.textAnnotations;
        if (!detections || detections.length === 0) {
          throw new Error('No text detected in image');
        }

        input = detections[0]?.description?.trim() || '';
        if (!input) {
          throw new Error('Extracted text was empty');
        }
      } catch (err) {
        console.error('Vision OCR failed:', err);
        res.status(500).json({ error: 'Failed to extract text using OCR' });
        return;
      }
    }
  }

  if (!input || typeof input !== 'string') {
    res.status(400).json({ error: 'Missing or invalid `input` field' });
    return;
  }

  if (isUrl(input)) {
    const recipeUrl = input.trim();
    try {
      const rawHtml = (
        await fetchWithRetry(recipeUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (TiblsRecipeLoaderBot; +https://tibls.app)',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        })
      ).data;
      const $ = cheerio.load(rawHtml);

      // Extract and filter <head> HTML for minimal relevant content
      // Preserve ld+json scripts that contain recipe data
      // Remove other styles, scripts, layout elements, and ads
      let head = $('head').clone();
      let extractedJsonLd: any = null;

      head.find('script[type="application/ld+json"]').each((_, el) => {
        const scriptContent = $(el).text().trim();
        try {
          const json = JSON.parse(scriptContent);
          const items = Array.isArray(json) ? json : json['@graph'] ? json['@graph'] : [json];

          const recipeItem = items.find((item: Record<string, any>) => {
            const type = item['@type'];
            const isRecipe =
              type === 'Recipe' ||
              (Array.isArray(type) && type.includes('Recipe')) ||
              item.recipeIngredient ||
              item.recipeInstructions;
            return isRecipe;
          });

          if (recipeItem && !extractedJsonLd) {
            extractedJsonLd = recipeItem;
          }

          if (!recipeItem) {
            $(el).remove();
          }
        } catch {
          // Not worth logging every invalid JSON-LD with catch(err) here
          $(el).remove(); // Remove if not valid JSON
        }
      });

      head
        .find(
          ['style', 'link[rel="stylesheet"]', 'link[rel*="icon"]', 'link[rel*="pre"]'].join(',')
        )
        .remove();

      const headHtml = head.html() || '';

      if (extractedJsonLd) {
        input = `This page contains valid Schema.org JSON-LD recipe data. Use it as the authoritative source for ingredients. Do not modify them.

        URL: ${recipeUrl}

        Extracted JSON-LD:
        ${JSON.stringify(extractedJsonLd, null, 2)}

        ---

        Fallback HTML <head> metadata (only for summary, missing field(s), or context use):
        ${headHtml}`;
      } else {
        log('📎 Fallback mode: No valid JSON-LD recipe found. Prompting model to parse HTML.');
        input = `HTML metadata for ${recipeUrl}:
        ${headHtml}

        ---

        Please fetch and parse the full recipe from the above URL.`;
      }
    } catch (err) {
      error('Failed to fetch HTML for URL:', err);
      res.status(500).json({ error: 'Failed to fetch page HTML from URL' });
      return;
    }
  }

  try {
    const chatPayload = {
      model: 'gpt-4o',
      temperature: 0.3,
      tools: [
        {
          type: 'function',
          function: {
            name: 'tiblsRecipe',
            description: 'Return a Tibls JSON object parsed from the input',
            parameters: tiblsSchema // injected from prompts/tibls-schema.json
          }
        }
      ],
      tool_choice: { type: 'function', function: { name: 'tiblsRecipe' } },
      messages: [
        {
          role: 'system',
          content: tiblsPrompt // injected from prompts/chatgpt-instructions.md
        },
        {
          role: 'user',
          // Use the unified `input` variable, which is either:
          // - direct user input (URL or text), or
          // - OCR-extracted text from an uploaded PDF
          content: [{ type: 'text', text: input }]
        }
      ]
    };

    if (!process.env.OPENAI_API_KEY) {
      error('Missing OpenAI API key');
      res.status(500).json({ error: 'Missing OpenAI API key' });
      return;
    }

    if (
      responseMode === ResponseMode.VIEWER &&
      (!process.env.GITHUB_TOKEN || !process.env.GIST_ID)
    ) {
      error('Missing GitHub credentials for viewer mode');
      res.status(500).json({ error: 'Missing GitHub token or Gist ID for viewer mode' });
      return;
    }

    if (process.env.GENERATE_TEST_DATA === 'true') {
      try {
        const debugDir = resolveFromRoot('test-data');
        fs.mkdirSync(debugDir, { recursive: true });

        const payloadPath = path.join(debugDir, `chatPayload-${Date.now()}.json`);
        fs.writeFileSync(payloadPath, JSON.stringify(chatPayload, null, 2), 'utf8');
        log(`Chat payload written to ${payloadPath}`);
      } catch (err) {
        error('Failed to write chatPayload:', err);
      }
    }

    // Call OpenAI API with the chat payload
    const openaiRes = await axios.post('https://api.openai.com/v1/chat/completions', chatPayload, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // Extract the Tibls JSON object from the OpenAI response
    const toolCall = openaiRes.data.choices?.[0]?.message?.tool_calls?.[0];

    // the arguments property of the tool_call contains the Tibls JSON object
    const argsString = toolCall?.function?.arguments;
    if (!argsString) throw new Error('No tool call arguments returned from OpenAI');

    const tiblsJson = JSON.parse(argsString);

    // Inject ogImageUrl if provided and not already present
    const ogImageUrl = req.body.ogImageUrl;
    if (ogImageUrl && tiblsJson?.itemListElement?.[0] && !tiblsJson.itemListElement[0].ogImageUrl) {
      tiblsJson.itemListElement[0].ogImageUrl = ogImageUrl;
    }

    // Optionally override estimated calories based on a visible per-serving value
    // Improved: Filter out ambiguous calorie phrases and use a better regex.
    const recipe = tiblsJson?.itemListElement?.[0];
    if (recipe?.servings && typeof recipe.servings === 'number') {
      const ambiguous = /less\s+than|approximately|about|~|under/i.test(input);
      const match = input.match(/\b(\d{2,4})\s*(?:kcal|calories?)\s*(?:per\s+serving|each)\b/i);
      if (!ambiguous && match) {
        const perServingCalories = parseInt(match[1], 10);
        if (!isNaN(perServingCalories)) {
          applyPerServingCaloriesOverride(tiblsJson, perServingCalories, recipe.servings);
        }
      }
    }
    // Enforce per-serving calories conversion if servings is available
    enforcePerServingCalories(tiblsJson);

    // An easy way to generate test data for debugging
    if (process.env.GENERATE_TEST_DATA === 'true') {
      try {
        const outputDir = resolveFromRoot('test-data');
        fs.mkdirSync(outputDir, { recursive: true }); // ensure directory exists

        const outPath = path.join(
          outputDir,
          `${generateRecipeFilename(tiblsJson, false)}-chatGPT-response.json`
        );
        fs.writeFileSync(outPath, JSON.stringify(openaiRes.data, null, 2), 'utf8');
        log(`Test data written to ${outPath}`);
      } catch (err) {
        error('Failed to write test data:', err);
      }
    }

    // If the imageFormat is 'base64', convert the ogImageUrl to a base64 data URL
    // That is, treat ogImageUrl as by-value, not by-reference
    if (imageFormat === 'base64') {
      const urlSource = tiblsJson.itemListElement[0]?.urlSource;
      let refererOrigin: string | undefined;

      try {
        // If urlSource is provided, use it to set the Referer header
        // Without this, some sites may block the request
        refererOrigin = urlSource ? new URL(urlSource).origin : undefined;
      } catch {}
      const base64ImageUrl = await fetchImageAsBase64DataUrl(
        tiblsJson.itemListElement[0].ogImageUrl,
        refererOrigin
      );
      tiblsJson.itemListElement[0].ogImageUrl = base64ImageUrl;
    }

    switch (responseMode) {
      case ResponseMode.JSON:
        // Return the Tibls JSON object directly
        res.json(tiblsJson);
        break;

      case ResponseMode.VIEWER: {
        // Generate a filename for the Tibls JSON object
        // and create a Gist with the content
        // Return the URL to the Gist viewer page
        const filename = `${generateRecipeFilename(tiblsJson)}.json`;
        const gistId = process.env.GIST_ID;
        const gistPayload = {
          files: {
            [filename]: {
              content: JSON.stringify(tiblsJson, null, 2)
            }
          }
        };

        await axios.patch(`https://api.github.com/gists/${gistId}`, gistPayload, {
          headers: {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Tibls-Webhook-Handler'
          }
        });

        const viewerUrl = `${getBaseUrl(req)}/gist/${gistId}`;
        res.json({ status: 'queued', viewer: viewerUrl });
        break;
      }

      default:
        res.status(400).json({ error: `Unsupported responseMode: ${responseMode}` });
        break;
    }
  } catch (err: any) {
    error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// This route serves a specific file from the Gist by filename
// It fetches the Gist content and returns the requested file's content
app.get('/gist-file/:filename', async (req: Request, res: Response) => {
  const filename = req.params.filename;
  const gistId = process.env.GIST_ID;

  try {
    const response = await axios.get(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json'
      }
    });

    const file = response.data.files[filename];
    if (!file) {
      // if you try to combine the following two lines, it will not work.
      //   return res.status(404).send("File not found");
      // causes a Typescrpt error in the app.get( line above
      // because it thinks it's returning a Response object, not a Promise object.
      res.status(404).send('File not found');
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.send(file.content);
  } catch (err) {
    error('Error fetching Gist file:', err);
    res.status(500).send('Failed to retrieve file');
  }
});

// This route serves the viewer UI for a specific Gist
// It fetches the Gist content, extracts recipe files, and generates an HTML page to display them
// The viewer allows users to import recipes directly into the Tibls app or display the raw JSON
app.get(['/', '/gist/:gistId'], async (req: Request, res: Response) => {
  const gistId = req.params.gistId || process.env.GIST_ID;

  try {
    const response = await axios.get(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json'
      }
    });

    const files = response.data.files;

    const recipes = Object.keys(files)
      .filter((filename) => filename.endsWith('.json'))
      .map((filename) => {
        const file = files[filename];
        const baseUrl = getBaseUrl(req);
        const rawJsonUrl = `${baseUrl}/gist-file/${filename}`;
        const tiblsUrl = `tibls://tibls.app/import?r=${rawJsonUrl}`;
        let parsed;
        try {
          parsed = JSON.parse(file.content);
        } catch {
          parsed = {};
        }

        const recipe = parsed?.itemListElement?.[0] || {};
        const name = recipe.name || filename.replace(/\.json$/, '');
        const description = recipe.summary || '';
        const dateMatch = filename.match(/(\d{1,2}-[A-Za-z]+-\d{4})/);
        let date = 'Unknown';
        if (dateMatch) {
          date = dateMatch[1];
        } else {
          const timestamp = parsed?.created || parsed?.updated;
          if (timestamp) {
            date = new Date(timestamp * 1000).toLocaleDateString('en-US', { dateStyle: 'medium' });
          }
        }
        const ogImageUrl = recipe.ogImageUrl || '';

        return { name, description, date, rawJsonUrl, tiblsUrl, ogImageUrl };
      });

    // Generate the {{TABLE_ROWS}} HTML content dynamically
    // This is used to populate the viewer page with recipe cards
    // The template is read from public/viewer.html and the rows are replaced with the generated HTML
    // Each recipe card includes the name, description, date, and links to import or view raw JSON
    // The template uses a simple string replacement to insert the rows into the HTML
    // This allows for easy customization of the viewer page without changing the server code
    // The viewer page is designed to be simple and responsive, displaying the recipes in a grid
    const template = fs.readFileSync(resolveFromRoot('public', 'viewer.html'), 'utf8');
    const html = template.replace(
      '{{TABLE_ROWS}}',
      `
      <div class="recipe-list">
        ${recipes
          .filter((r) => r.name || r.description || r.tiblsUrl || r.rawJsonUrl || r.ogImageUrl)
          .map(
            (r) => `
            <div class="recipe-card">
              <div class="recipe-field">${r.ogImageUrl ? `<img class="thumbnail" src="${r.ogImageUrl}" alt="${r.name} image" />` : ''}</div>
              <div class="recipe-field"><span class="label">Recipe Name</span>${r.name}</div>
              ${r.description ? `<div class="recipe-field"><span class="label">Summary</span>${r.description}</div>` : ''}
              <div class="recipe-field"><span class="label">Date</span>${r.date || 'Unknown'}</div>
              <div class="recipe-field"><span class="label">Import Link</span>
                <a href="${r.tiblsUrl}">Import</a><br>
                <a href="${r.rawJsonUrl}">Raw JSON</a>
              </div>
            </div>
          `
          )
          .join('')}
      </div>
    `
    );

    res.send(html);
  } catch (err: any) {
    error('Error fetching Gist:', err);
    res.status(500).send('Error loading recipe viewer.');
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
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// More graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  close(); // Close the logger stream
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT (Ctrl+C), shutting down...');
  close(); // flush and close the log file
  process.exit(0);
});
