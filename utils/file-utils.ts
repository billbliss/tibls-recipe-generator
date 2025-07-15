import fs from 'fs';
import path from 'path';
import { Request } from 'express';
import pdfParse from 'pdf-parse';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import { getBaseUrl } from './core-utils';
import { JPEG_IMAGE_QUALITY, MAX_BASE64_SIZE, MAX_IMAGE_WIDTH } from './constants';

const execFileAsync = promisify(execFile);

// Resolves a path relative to the root of the project
// This is useful for loading configuration files or assets that are located in the root directory
// Example: resolveFromRoot('config', 'settings.json') will resolve to '/path/to/project/config/settings.json'
export function resolveFromRoot(...segments: string[]): string {
  const fullPath = path.join(process.cwd(), ...segments);
  return fullPath;
}

// Generates a filename for a recipe based on its name and the current date
export function generateRecipeFilename(tiblsJson: any, appendTimestamp: boolean = true): string {
  const fallbackName = 'Untitled-Recipe';
  let baseName = fallbackName;

  // Try to get the recipe name and slugify it
  const recipe = tiblsJson?.itemListElement?.[0];
  if (recipe?.name) {
    baseName = recipe.name
      .trim()
      .replace(/\s+/g, '-') // Replace spaces with dashes
      .replace(/[^a-zA-Z0-9\-]/g, '') // Remove special characters
      .replace(/\-+/g, '-'); // Collapse multiple dashes
  }

  let dateSuffix = '';
  if (appendTimestamp) {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = now.toLocaleString('en-US', { month: 'long' });
    const year = now.getFullYear();
    const dateStr = `${day}-${month}-${year}`;
    dateSuffix = `-${dateStr}`;
  }
  return `${baseName}${dateSuffix}`;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text.replace(/\s+/g, ' ').trim();
}

export async function extractEmbeddedImageFromPdf(
  tempPdfPath: string,
  req: Request
): Promise<string | null> {
  const baseName = `img-${Date.now()}`;
  const outputDir = resolveFromRoot('public', 'img', 'recipe-images');
  const outputBasePath = path.join(outputDir, baseName);

  try {
    await execFileAsync('pdfimages', ['-png', tempPdfPath, outputBasePath]);
    const imageFiles = fs
      .readdirSync(outputDir)
      .filter((f) => f.startsWith(baseName) && f.endsWith('.png'));

    if (imageFiles.length > 0) {
      const imageFileName = imageFiles[0];
      return `${getBaseUrl(req)}/img/recipe-images/${imageFileName}`;
    }
  } catch (err) {
    console.warn('⚠️ Failed to extract image from PDF:', err);
  }

  return null;
}

export function saveImageToPublicDir(buffer: Buffer, originalName: string): string {
  const ext = path.extname(originalName || '.png');
  const filename = `user-${Date.now()}${ext}`;
  const outputDir = resolveFromRoot('public', 'img', 'recipe-images');
  const fullPath = path.join(outputDir, filename);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(fullPath, buffer);

  return `/img/recipe-images/${filename}`;
}

/**
 * Reads a local image from disk and returns a base64 data URL.
 * Infers the MIME type (contentType) from the file extension.
 * If the buffer to be converted is too big, downscale using sharp and encode as JPEG.
 */
export async function encodeLocalImageToBase64(filePath: string): Promise<string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === '.webp'
      ? 'image/webp'
      : ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : 'application/octet-stream';

  const buffer = fs.readFileSync(filePath);

  if (buffer.length < MAX_BASE64_SIZE) {
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } else {
    // Downscale large images using sharp and convert to JPEG for smaller base64 sizes
    const resizedBuffer = await sharp(buffer)
      .resize({ width: MAX_IMAGE_WIDTH })
      .jpeg({ quality: JPEG_IMAGE_QUALITY })
      .toBuffer();

    // Always encode resized as JPEG for universal support
    return `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`;
  }
}
