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
const execFileAsync = promisify(execFile);

import { generateRecipeFilename, getBaseUrl, loadGoogleCredentialsFromBase64, resolveFromRoot } from './utils/utility-functions';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Load system prompt and schema from files
const tiblsPrompt = fs.readFileSync(resolveFromRoot('prompts', 'chatgpt-instructions.md'), 'utf8');
const tiblsSchema = JSON.parse(fs.readFileSync(resolveFromRoot('prompts', 'tibls-schema.json'), 'utf8'));

// Log these values for debugging
console.log('Tibls Prompt:', tiblsPrompt);
console.log('Tibls Schema:', tiblsSchema);  

app.use(bodyParser.json({ limit: '10mb' }));
const upload = multer();
app.use(express.static(resolveFromRoot('public')));

// This route handles the webhook POST requests
// It expects a JSON body with an `input` field for a URL; the filename and filetype are used for images/PDFs
// It uses OpenAI's API to process the input and generate a Tibls JSON object
// The generated JSON is then saved to a GitHub Gist and a viewer URL is returned
app.post('/webhook', upload.single('filename'), async (req: Request, res: Response) => {
  let input = req.body.input;
  const file = req.file;
  const filetype = req.body.filetype;

  if (!input && file && file.mimetype === 'application/pdf') {
    const tempPdfPath = path.join('/tmp', `upload-${Date.now()}.pdf`);
    fs.mkdirSync(path.dirname(tempPdfPath), { recursive: true });
    fs.writeFileSync(tempPdfPath, file.buffer);

    const pngPath = path.join('/tmp', `page1-${Date.now()}.png`);
    try {
      await execFileAsync('magick', [`${tempPdfPath}[0]`, pngPath]);
    } catch (err) {
      throw new Error(`ImageMagick failed: ${err}`);
    }

    const imageBuffer = fs.readFileSync(pngPath);
    const base64Image = imageBuffer.toString('base64');

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

  if (!input || typeof input !== 'string') {
    res.status(400).json({ error: 'Missing or invalid `input` field' });
    return;
  }

  const isUrl = /^https?:\/\//.test(input);

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
            parameters: tiblsSchema  // injected from prompts/tibls-schema.json
          }
        }
      ],
      tool_choice: { type: 'function', function: { name: 'tiblsRecipe' } },
      messages: [
        {
          role: 'system',
          content: tiblsPrompt  // injected from prompts/chatgpt-instructions.md
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
      console.error('Missing OpenAI API key');
      res.status(500).json({ error: 'Missing OpenAI API key' });
      return;
    }

    if (!process.env.GITHUB_TOKEN || !process.env.GIST_ID) {
      console.error('Missing GitHub credentials');
      res.status(500).json({ error: 'Missing GitHub token or Gist ID' });
      return;
    }

    if (process.env.GENERATE_TEST_DATA === 'true') {
      try {
        const debugDir = resolveFromRoot('test-data');
        fs.mkdirSync(debugDir, { recursive: true });

        const payloadPath = path.join(debugDir, `chatPayload-${Date.now()}.json`);
        fs.writeFileSync(payloadPath, JSON.stringify(chatPayload, null, 2), "utf8");

        console.log(`Chat payload written to ${payloadPath}`);
      } catch (err) {
        console.error("Failed to write chatPayload:", err);
      }
    }

    const openaiRes = await axios.post('https://api.openai.com/v1/chat/completions', chatPayload, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const toolCall = openaiRes.data.choices?.[0]?.message?.tool_calls?.[0];

    const argsString = toolCall?.function?.arguments;
    if (!argsString) throw new Error('No tool call arguments returned from OpenAI');

    const tiblsJson = JSON.parse(argsString);

    if (process.env.GENERATE_TEST_DATA === 'true') {
      try {
        const outputDir = resolveFromRoot('test-data');
        fs.mkdirSync(outputDir, { recursive: true }); // ensure directory exists

        const outPath = path.join(outputDir, `${generateRecipeFilename(tiblsJson, false)}-chatGPT-response.json`);
        fs.writeFileSync(outPath, JSON.stringify(openaiRes.data, null, 2), "utf8");

        console.log(`Test data written to ${outPath}`);
      } catch (err) {
        console.error("Failed to write test data:", err);
      }
    }

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
  } catch (err: any) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// This route serves a specific file from the Gist by filename
// It fetches the Gist content and returns the requested file's content
app.get("/gist-file/:filename", async (req: Request, res: Response) => {
  const filename = req.params.filename;
  const gistId = process.env.GIST_ID;

  try {
    const response = await axios.get(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json"
      }
    });

    const file = response.data.files[filename];
    if (!file) {
      // if you try to combine the following two lines, it will not work.
      //   return res.status(404).send("File not found");
      // causes a Typescrpt error in the app.get( line above
      // because it thinks it's returning a Response object, not a Promise object.
      res.status(404).send("File not found");
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.send(file.content);
  } catch (err) {
    console.error("Error fetching Gist file:", err);
    res.status(500).send("Failed to retrieve file");
  }
});

// This route serves the viewer UI for a specific Gist
// It fetches the Gist content, extracts recipe files, and generates an HTML page to display them
// The viewer allows users to import recipes directly into the Tibls app
app.get(["/", "/gist/:gistId"], async (req: Request, res: Response) => {
  const gistId = req.params.gistId || process.env.GIST_ID;

  try {
    const response = await axios.get(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    });

    const files = response.data.files;

    const recipes = Object.keys(files)
      .filter((filename) => filename.endsWith(".json"))
      .map((filename) => {
        const file = files[filename];
        const url = file.raw_url;
        const baseUrl = getBaseUrl(req);
        const rawJsonUrl = `${baseUrl}/gist-file/${filename}`;
        const tiblsUrl = `tibls://tibls.app/import?r=${encodeURIComponent(rawJsonUrl)}`;

        let parsed;
        try {
          parsed = JSON.parse(file.content);
        } catch {
          parsed = {};
        }

        const recipe = parsed?.itemListElement?.[0] || {};
        const name = recipe.name || filename.replace(/\.json$/, "");
        const description = recipe.summary || "";
        const dateMatch = filename.match(/(\d{1,2}-[A-Za-z]+-\d{4})/);
        let date = "Unknown";
        if (dateMatch) {
          date = dateMatch[1];
        } else {
          const timestamp = parsed?.created || parsed?.updated;
          if (timestamp) {
            date = new Date(timestamp * 1000).toLocaleDateString("en-US", { dateStyle: "medium" });
          }
        }

        return { name, description, date, rawJsonUrl, tiblsUrl };
      });

    const template = fs.readFileSync(resolveFromRoot('public', 'viewer.html'), 'utf8');
    const html = template.replace("{{TABLE_ROWS}}", `
      <div class="recipe-list">
        ${recipes
          .filter(r => r.name || r.description || r.tiblsUrl || r.rawJsonUrl)
          .map(r => `
            <div class="recipe-card">
              <div class="recipe-field"><span class="label">Recipe Name</span>${r.name}</div>
              ${r.description ? `<div class="recipe-field"><span class="label">Summary</span>${r.description}</div>` : ""}
              <div class="recipe-field"><span class="label">Date</span>${r.date || "Unknown"}</div>
              <div class="recipe-field"><span class="label">Import Link</span>
                <a href="${r.tiblsUrl}">Import</a><br>
                <a href="${r.rawJsonUrl}">Raw JSON</a>
              </div>
            </div>
          `).join("")}
      </div>
    `);

    res.send(html);
  } catch (err: any) {
    console.error("Error fetching Gist:", err);
    res.status(500).send("Error loading recipe viewer.");
  }
});

// Starts the Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});