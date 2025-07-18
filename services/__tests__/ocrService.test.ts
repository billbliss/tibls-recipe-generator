import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTextDetection = vi.fn().mockResolvedValue([
  {
    textAnnotations: [{ description: 'Mock OCR text' }]
  }
]);

vi.mock('@google-cloud/vision', () => ({
  __esModule: true,
  default: {
    ImageAnnotatorClient: vi.fn(() => ({
      textDetection: mockTextDetection
    }))
  }
}));

import { extractTextWithVision } from '../ocrService';

describe('extractTextWithVision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns extracted text when Vision API returns fullTextAnnotation', async () => {
    const buffer = Buffer.from('fake-image-data');
    const result = await extractTextWithVision(buffer);

    expect(mockTextDetection).toHaveBeenCalled();
    expect(result).toBe('Mock OCR text');
  });

  it('returns error when Vision API returns no text', async () => {
    mockTextDetection.mockResolvedValue([{ textAnnotations: [] }]);

    const buffer = Buffer.from('fake-image-data');
    await expect(extractTextWithVision(buffer)).rejects.toThrow(
      /No text detected in the provided image/
    );
  });

  it('throws an error when Vision API fails', async () => {
    mockTextDetection.mockRejectedValue(new Error('Vision API error'));

    const buffer = Buffer.from('fake-image-data');
    await expect(extractTextWithVision(buffer)).rejects.toThrow(/Google Vision OCR error/);
  });
});
