/**
 * NOTE: This is archived legacy code for reference.
 * It is no longer used in production and not included in builds or tests.
 *
 * It was used to have Google Vision do OCR on uploaded images - current version
 * uses ChatGPT for that directly.
 */

import { extractTextWithVision } from './ocrService';
import { processRecipeWithChatGPT } from './chatgptService';
import { ResponseMode } from '../types/types';

/**
 * Handles an uploaded image of a recipe.
 * Runs Google Vision OCR on the image buffer,
 * then feeds the extracted text into ChatGPT processing.
 */
export async function handleImageRecipe(
  imageBuffer: Buffer,
  responseMode: ResponseMode,
  baseUrl: string,
  imageFormat?: string
) {
  // Extract text from image using Vision API
  const extractedText = await extractTextWithVision(imageBuffer);

  if (!extractedText.trim()) {
    throw new Error('No text detected in the provided image.');
  }

  // Pass the extracted text to ChatGPT to generate Tibls JSON
  const result = await processRecipeWithChatGPT(
    extractedText,
    responseMode,
    baseUrl,
    undefined, // no ogImageUrl from images
    imageFormat
  );

  return result;
}
