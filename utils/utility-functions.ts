// File: utils/utility-functions.ts - Utility functions for Tibls Recipe Generator

import fs from 'fs';
import path from 'path';
import { Request } from 'express';

// Returns the base URL of the request, used for generating absolute URLs
// This is useful for generating links to uploaded files or viewer pages
// Example: if the request is made to http://localhost:3000/webhook, this function will return "http://localhost:3000"
// This function is used in the webhook handler to generate the URL for the uploaded file or viewer
export function getBaseUrl(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

// Generates a filename for a recipe based on its name and the current date
export function generateRecipeFilename(tiblsJson: any, appendTimestamp: boolean = true): string {
  const fallbackName = "Untitled-Recipe";
  let baseName = fallbackName;

  // Try to get the recipe name and slugify it
  const recipe = tiblsJson?.itemListElement?.[0];
  if (recipe?.name) {
    baseName = recipe.name
      .trim()
      .replace(/\s+/g, "-")             // Replace spaces with dashes
      .replace(/[^a-zA-Z0-9\-]/g, "")   // Remove special characters
      .replace(/\-+/g, "-");            // Collapse multiple dashes
  }

  let dateSuffix = "";
  if (appendTimestamp) {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, "0");
    const month = now.toLocaleString("en-US", { month: "long" });
    const year = now.getFullYear();
    const dateStr = `${day}-${month}-${year}`;
    dateSuffix = `-${dateStr}`;
  }
  return `${baseName}${dateSuffix}`;
}

/**
 * Loads Google Cloud credentials from a base64-encoded source.
 * - In production: reads from process.env.GOOGLE_CLOUD_CREDENTIALS_BASE64
 * - In development: falls back to config/tibls-pdf-ocr-7d90a9009aac.base64
 * Writes the decoded JSON to /tmp/gvision-creds.json and sets GOOGLE_APPLICATION_CREDENTIALS.
 */
export function loadGoogleCredentialsFromBase64() {
  let b64 = process.env.GOOGLE_CLOUD_CREDENTIALS_BASE64;

  if (!b64 && process.env.NODE_ENV !== 'production') {
    if (!process.env.GOOGLE_CLOUD_CREDENTIALS_BASE64_FILE) {
      throw new Error('GOOGLE_CLOUD_CREDENTIALS_BASE64_FILE is not set in development mode');
    }
    const fallbackPath = path.join(__dirname, String(process.env.GOOGLE_CLOUD_CREDENTIALS_BASE64_FILE));
    if (fs.existsSync(fallbackPath)) {
      b64 = fs.readFileSync(fallbackPath, 'utf8');
    }
  }

  if (!b64) {
    throw new Error('Missing GOOGLE_CLOUD_CREDENTIALS_BASE64 and no fallback JSON file GOOGLE_CLOUD_CREDENTIALS_BASE64_FILE found.');
  }

  const json = Buffer.from(b64, 'base64').toString('utf-8');
  const credPath = '/tmp/gvision-creds.json';
  fs.writeFileSync(credPath, json);

  process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
}

// Resolves a path relative to the root of the project
// This is useful for loading configuration files or assets that are located in the root directory
// Example: resolveFromRoot('config', 'settings.json') will resolve to '/path/to/project/config/settings.json'
export function resolveFromRoot(...segments: string[]): string {
  const fullPath = path.join(process.cwd(), ...segments);
  console.log("🔍 resolveFromRoot ->", fullPath);
  return fullPath;
}