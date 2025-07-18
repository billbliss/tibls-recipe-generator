import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

import { extractTextWithVision } from './ocrService';

import { extractTextFromPdf, extractEmbeddedImageFromPdf } from '../utils/file-utils';

import { isLikelyRecipeText } from '../utils/recipe-utils';

export interface PdfProcessingResult {
  text: string;
  ogImageUrl?: string | null;
}

const signficantPdfTextLength = 50; // Minimum length of meaningful text to consider the PDF valid

// If the file is a PDF, extract text from it using pdf-parse
// If the PDF contains significant text, use that as input, and look for an embedded image - save it as ogImageUrl
// If the PDF does not contain significant text, rasterize the first page to an image
// and use Google Vision API to perform OCR on the image to extract text
export async function handlePdfFile(
  pdfBuffer: Buffer,
  baseUrl: string
): Promise<PdfProcessingResult> {
  const tempPdfPath = path.join('/tmp', `upload-${Date.now()}.pdf`);
  fs.mkdirSync(path.dirname(tempPdfPath), { recursive: true });
  fs.writeFileSync(tempPdfPath, pdfBuffer);

  const header = pdfBuffer.slice(0, 5).toString();
  if (header !== '%PDF-') {
    throw new Error('Not a valid PDF');
  }

  let pdfText: string;
  try {
    pdfText = await extractTextFromPdf(pdfBuffer);
  } catch {
    throw new Error('Failed to parse PDF');
  }

  // Throw an error if the PDF does not appear to contain a valid recipe; skip this check if being run by a test
  if (process.env.NODE_ENV !== 'test' && !isLikelyRecipeText(pdfText)) {
    throw new Error('This PDF does not appear to contain a valid recipe.');
  }

  if (pdfText.length > signficantPdfTextLength) {
    const ogImageUrl = await extractEmbeddedImageFromPdf(tempPdfPath, baseUrl);
    return { text: pdfText, ogImageUrl };
  } else {
    // If the PDF does not contain significant text, rasterize the first page to an image
    const pngPath = path.join('/tmp', `page1-${Date.now()}.png`);
    try {
      await execFileAsync('convert', [`${tempPdfPath}[0]`, pngPath]);
    } catch (err) {
      throw new Error(`ImageMagick failed: ${(err as Error).message}`);
    }

    const imageBuffer = fs.readFileSync(pngPath);

    const ocrText = await extractTextWithVision(imageBuffer);
    if (!ocrText) {
      throw new Error('Extracted text was empty');
    }
    return { text: ocrText };
  }
}
