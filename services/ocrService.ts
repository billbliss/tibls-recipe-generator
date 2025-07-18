import vision from '@google-cloud/vision';
import { loadGoogleCredentialsFromBase64 } from '../utils/core-utils';

export async function extractTextWithVision(image: Buffer | string): Promise<string> {
  // Load credentials from base64 to ensure GOOGLE_APPLICATION_CREDENTIALS is set
  loadGoogleCredentialsFromBase64();

  const visionClient = new vision.ImageAnnotatorClient({
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
  });

  try {
    const [result] = await visionClient.textDetection({
      image: { content: image instanceof Buffer ? image.toString('base64') : image }
    });

    const detections = result.textAnnotations;
    if (!detections || detections.length === 0) {
      throw new Error('No text detected in the provided image.');
    }

    const extractedText = detections[0]?.description?.trim() || '';
    if (!extractedText) {
      throw new Error('Extracted text was empty');
    }

    return extractedText;
  } catch (err) {
    throw new Error(`Google Vision OCR error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
