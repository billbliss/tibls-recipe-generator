import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleImageRecipe } from '../imageRecipeService';
import * as ocrService from '../ocrService';
import * as chatgptService from '../chatgptService';

vi.mock('../ocrService', () => ({
  extractTextWithVision: vi.fn()
}));

vi.mock('../chatgptService', () => ({
  processRecipeWithChatGPT: vi.fn()
}));

describe('handleImageRecipe', () => {
  const baseUrl = 'http://localhost:3000';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('processes an image and returns Tibls JSON', async () => {
    const fakeText = 'This is OCR text';
    const fakeResult = { itemListElement: [{ name: 'Mock Recipe' }] };
    vi.mocked(ocrService.extractTextWithVision).mockResolvedValue(fakeText);
    vi.mocked(chatgptService.processRecipeWithChatGPT).mockResolvedValue(fakeResult);

    const buffer = Buffer.from('fake-image-data');
    const result = await handleImageRecipe(buffer, 'json' as any, baseUrl);

    expect(ocrService.extractTextWithVision).toHaveBeenCalledWith(buffer);
    expect(chatgptService.processRecipeWithChatGPT).toHaveBeenCalledWith(
      fakeText,
      'json',
      baseUrl,
      undefined,
      undefined
    );
    expect(result).toBe(fakeResult);
  });

  it('throws an error if no text detected', async () => {
    vi.mocked(ocrService.extractTextWithVision).mockResolvedValue('');

    const buffer = Buffer.from('fake-image-data');
    await expect(handleImageRecipe(buffer, 'json' as any, baseUrl)).rejects.toThrow(
      'No text detected in the provided image.'
    );
  });
});
