import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { handleImageFormat } from '../imageService';
import * as fileUtils from '../../utils/file-utils';
import * as coreUtils from '../../utils/core-utils';
import { TiblsJson } from '../../types/types';

// ✅ Mock fs.promises.unlink
vi.mock('fs', () => ({
  default: {
    promises: {
      unlink: vi.fn().mockResolvedValue(undefined)
    }
  }
}));

// ✅ Mock our helper utilities
vi.mock('../../utils/file-utils', () => ({
  resolveFromRoot: vi.fn((p: string) => `/mock-root/${p}`),
  encodeLocalImageToBase64: vi.fn()
}));

vi.mock('../../utils/core-utils', () => ({
  fetchImageAsBase64DataUrl: vi.fn()
}));

describe('handleImageFormat', () => {
  let tiblsJson: TiblsJson;

  beforeEach(() => {
    tiblsJson = {
      '@type': 'application/tibls+json',
      itemListElement: [
        {
          '@type': 'https://tibls.app/types/recipe',
          id: '1234',
          name: 'Test Recipe',
          ogImageUrl: 'https://example.com/image.jpg'
        } as any
      ]
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing if recipe has no ogImageUrl', async () => {
    tiblsJson.itemListElement[0].ogImageUrl = undefined;
    await handleImageFormat(tiblsJson, 'base64');
    expect(tiblsJson.itemListElement[0].ogImageUrl).toBeUndefined();
  });

  it('fetches remote image as base64 when format is base64', async () => {
    const mockBase64 = 'data:image/jpeg;base64,ABC123';
    vi.mocked(coreUtils.fetchImageAsBase64DataUrl).mockResolvedValue(mockBase64);

    await handleImageFormat(tiblsJson, 'base64');

    expect(coreUtils.fetchImageAsBase64DataUrl).toHaveBeenCalledWith(
      'https://example.com/image.jpg',
      undefined // no urlSource defined
    );
    expect(tiblsJson.itemListElement[0].ogImageUrl).toBe(mockBase64);
  });

  it('encodes local temp image when format is tempImageBase64', async () => {
    // Simulate a temp image path
    tiblsJson.itemListElement[0].ogImageUrl = '/img/recipe-images/temp.jpg';

    const mockEncoded = 'data:image/png;base64,XYZ123';
    vi.mocked(fileUtils.encodeLocalImageToBase64).mockResolvedValue(mockEncoded);

    await handleImageFormat(tiblsJson, 'tempImageBase64');

    const expectedTempPath = path.join('/mock-root/public', 'img/recipe-images/temp.jpg');

    expect(fileUtils.encodeLocalImageToBase64).toHaveBeenCalledWith(expectedTempPath);
    expect(fs.promises.unlink).toHaveBeenCalledWith(expectedTempPath);
    expect(tiblsJson.itemListElement[0].ogImageUrl).toBe(mockEncoded);
  });

  it('does nothing if tempImageBase64 is requested but image is not a temp image', async () => {
    tiblsJson.itemListElement[0].ogImageUrl = 'https://example.com/normal.jpg';

    await handleImageFormat(tiblsJson, 'tempImageBase64');

    expect(fileUtils.encodeLocalImageToBase64).not.toHaveBeenCalled();
    expect(fs.promises.unlink).not.toHaveBeenCalled();
  });

  it('leaves ogImageUrl unchanged for url/default format', async () => {
    const originalUrl = tiblsJson.itemListElement[0].ogImageUrl;

    await handleImageFormat(tiblsJson, 'url');

    expect(tiblsJson.itemListElement[0].ogImageUrl).toBe(originalUrl);
    expect(coreUtils.fetchImageAsBase64DataUrl).not.toHaveBeenCalled();
    expect(fileUtils.encodeLocalImageToBase64).not.toHaveBeenCalled();
  });
});
