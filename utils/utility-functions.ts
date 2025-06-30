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

// Cleans up old uploads by deleting files older than maxAgeMs
// This function is called from server.ts when the webhook is invoked
export function cleanupUploads(maxAgeMs: number, directoryPath: string): void {
  const now = Date.now();
  fs.readdirSync(directoryPath).forEach(file => {
    const fullPath = path.join(directoryPath, file);
    try {
      const stats = fs.statSync(fullPath);
      if (now - stats.mtimeMs > maxAgeMs) {
        fs.unlinkSync(fullPath);
      }
    } catch (err) {
      console.warn(`Failed to delete ${file}:`, err);
    }
  });
}