# Tibls Recipe Generator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Issues](https://img.shields.io/github/issues/billbliss/tibls-recipe-generator)](https://github.com/billbliss/tibls-recipe-generator/issues)

**Tibls Recipe Generator** is a webhook-based Node.js server that converts recipe inputs from URLs or PDFs into valid [Tibls JSON](https://tibls.app) format, suitable for loading into personal recipe apps or Gists.

It intelligently parses and transforms recipe data — including structured JSON-LD, scanned PDFs, and images — into a normalized, validated format conforming to the Tibls schema.

## ✨ Features

- 🧠 Intelligent `sectionHeader` grouping
- 📥 URL and PDF ingestion
- 🖼️ PDF image handling via ImageMagick
- 🔎 OCR via Google Cloud Vision API
- 🍽️ Calorie estimation based on ingredient analysis
- 📦 Docker deployment on [Render.com](https://render.com)
- ✅ Produces Tibls-compliant JSON

## 🛠️ Technologies

- Node.js 22
- TypeScript
- Express.js
- Google Cloud Vision API (OCR)
- ImageMagick (`convert`) for PDF-to-image conversion
- multer, and other supporting packages

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