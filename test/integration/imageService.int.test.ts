import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { handleImageFormat } from '../../services/imageService';
import { TiblsJson } from '../../types/types';

describe('handleImageFormat integration', () => {
  const fixturePath = path.resolve('test/fixtures/images/sample-temp.png');
  const tempImageDir = path.resolve('public/img/recipe-images');
  const tempImagePath = path.join(tempImageDir, 'temp.png');

  let tiblsJson: TiblsJson;

  beforeEach(async () => {
    // Ensure the runtime temp directory exists
    await fs.mkdir(tempImageDir, { recursive: true });
    // Copy the committed fixture into the runtime temp location
    await fs.copyFile(fixturePath, tempImagePath);

    tiblsJson = {
      '@type': 'application/tibls+json',
      itemListElement: [
        {
          '@type': 'https://tibls.app/types/recipe',
          id: 'integration-test',
          name: 'Integration Test Recipe',
          ogImageUrl: '/img/recipe-images/temp.png'
        } as any
      ]
    };
  });

  afterEach(async () => {
    // Clean up any leftover temp files just in case
    try {
      await fs.unlink(tempImagePath);
    } catch {
      // ignore if already deleted
    }
  });

  it('encodes a real temp image to base64 and deletes the temp file', async () => {
    // Ensure the temp file exists before test
    const existsBefore = await fileExists(tempImagePath);
    expect(existsBefore).toBe(true);

    await handleImageFormat(tiblsJson, 'tempImageBase64');

    const updatedOgImageUrl = tiblsJson.itemListElement[0].ogImageUrl;

    // Expect it to be a base64 data URL
    expect(updatedOgImageUrl).toMatch(/^data:image\/png;base64,/);

    // Temp file should have been deleted
    const existsAfter = await fileExists(tempImagePath);
    expect(existsAfter).toBe(false);
  });
});

// Helper to check existence
async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
