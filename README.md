# Tibls Recipe Generator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Issues](https://img.shields.io/github/issues/billbliss/tibls-recipe-generator)](https://github.com/billbliss/tibls-recipe-generator/issues)

**Tibls Recipe Generator** is a webhook-based Node.js server that converts recipe inputs from URLs or PDFs into valid [Tibls](https://tibls.app) format, suitable for loading into Tibls.

Using ChatGPT, it intelligently parses and transforms recipe data — including structured JSON+LD, scanned PDFs or photos of printed recipes — into a normalized, validated format conforming to the Tibls schema.

It also implements a viewer UI that displays the contents of all the converted recipes or lets you load a new one.

## ✨ Features

- Extracts, interprets, and converts recipes in a variety of source formats using ChatGPT
- 📥 URL and PDF ingestion
- 🖼️ PDF image handling via Ghostscript and ImageMagick
- 🔎 OCR via Google Cloud Vision API
- Augments JSON+LD Schema.org Recipe information on a web page to fill in missing values
- 🍽️ Calorie estimation based on ingredient analysis
- Generates Tibls "flip timers" for recipe steps when appropriate
- 🧠 Intelligent `sectionHeader` grouping
- 📦 Docker deployment on [Render.com](https://render.com)
- ✅ Produces Tibls-compliant JSON

## 🛠️ Technologies

- OpenAI's GPT-4o multimodal capability, which allows seamless handling of both text and images (future-proofing for richer recipe inputs)
- Node.js version 22
- TypeScript
- Express.js
- ImageMagick (`convert`) and Ghostscript for PDF-to-image conversion
- Google Cloud Vision API for OCR
- multer and other supporting packages

## 🚀 Deployment

This service is deployed via Docker to Render. Build and runtime expectations:

- Docker-based with `npm start` (`node dist/server.js`)
- Runs on port `10000`
- Requires Ghostscript and ImageMagick v6
- Assets in `prompts/` and `public/` must be accessible at runtime

## 🧪 Development

```bash
# Install dependencies
npm install

# Compile TypeScript to dist/
npm run build

# Start the server
npm start
```

### Linting

To check code style and catch potential issues:

```bash
npm run lint
```

You can also add:

```bash
npm run lint -- --fix
```
To autocorrect common issues like spacing or missing semicolons.

## 🔧 Environment Variables

Set runtime behavior and external integrations using these variables. Some are required for OCR or API access.

Use .env or hardcoded configs to set secrets, logging, or Gist target details if needed.

Here's a sample .env file with sensitive information redacted:

```bash
# Port for local development; Render uses 10000 by default
PORT=3000

# OpenAI API key for recipe analysis
OPENAI_API_KEY=sk-proj-xxxxxx

# GitHub token and Gist details for saving results
GITHUB_TOKEN=xxxxxx
GIST_PATH=https://gist.github.com/USERNAME/
GIST_ID=xxxxx

# Optional: generate random test data for dev use
GENERATE_TEST_DATA=false

# Required for PDF OCR: base64 version of Google Cloud Vision credentials
# To create: base64 credentials.json > credentials.base64
GOOGLE_CLOUD_CREDENTIALS_BASE64_FILE=../config/credentials.base64
```

Also see the .env.example file in the repo.

## Client Scriptable Scripts

One way to use this app is by loading the app by its URL, e.g. https://tibls-recipe-generator-ptm9.onrender.com/ in Safari and paste a URL or load a file there.

However, you can also use it while looking at a recipe web page or image/pdf of a printed recipe on your iPhone or iPad using the share button. To do that, you have to go to a little extra setup work.

1. Install the [Scriptable](https://scriptable.app) app (it's free).
2. Copy the following files from `scriptable/` to `iCloud Drive/Scriptable` in Finder:
   - `Init GitHub Credentials.js`
   - `Tibls Recipe Loader.js`
   - `PullFromRepo.js` (optional)
3. If you already have a GitHub access token that allows access to repositories, find it and copy it to the clipboard; alternatively, create a new one at `github.com/settings/tokens`. Edit the `Init GitHub Credentials.js` file in Scriptable (that is, once it's on your device, using the Scriptable editor) and paste the token value inside the double quotes:
    ```javascript
    const githubToken = "PASTE-TOKEN-HERE"; // Generate at github.com/settings/tokens
    ```
4. Run the script. This stores the token securely in your Keychain. You only have to run this script once; the githubToken is used by all the scripts.
5. When you are looking at a recipe web page or an photo/PDF of a printed recipe, tap the Share icon; towards the bottom of the share sheet is a "Run Scripts" option; tap that and you'll see your Scriptables script. Tap "Tibls Recipe Loader" and after a little while, the list of recipes will appear with the new recipe there; tap the Import link to load it into Tibls.