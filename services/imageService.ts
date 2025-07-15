import fs from 'fs';
import path from 'path';
import { resolveFromRoot, encodeLocalImageToBase64 } from '../utils/file-utils';
import { fetchImageAsBase64DataUrl } from '../utils/core-utils';
import { TiblsJson } from '../types/types';

/**
 * Modifies tiblsJson.itemListElement[0].ogImageUrl according to requested format.
 * Supports: 'url' (no change), 'base64', 'tempImageBase64'
 */
export async function handleImageFormat(tiblsJson: TiblsJson, format: string): Promise<void> {
  const recipe = tiblsJson.itemListElement?.[0];
  if (!recipe?.ogImageUrl) return;

  const ogUrl = recipe.ogImageUrl;

  switch (format) {
    case 'base64': {
      // For remote URLs, need refererOrigin for CDNs that block hotlinking
      const urlSource = recipe.urlSource;
      let refererOrigin: string | undefined;
      try {
        refererOrigin = urlSource ? new URL(urlSource).origin : undefined;
      } catch {}
      recipe.ogImageUrl = await fetchImageAsBase64DataUrl(ogUrl, refererOrigin);
      break;
    }

    case 'tempImageBase64': {
      const isTempImage = ogUrl.includes('/img/recipe-images/');
      if (!isTempImage) break;

      try {
        // Absolute path to local temp file
        const tempPath = path.join(resolveFromRoot('public'), ogUrl.replace(/^.*\/img\//, 'img/'));
        const base64ImageUrl = await encodeLocalImageToBase64(tempPath);

        if (base64ImageUrl.length > 0) {
          recipe.ogImageUrl = base64ImageUrl;

          // Delete after encoding
          fs.unlink(tempPath, (err) => {
            if (err) console.warn('Failed to delete temp image:', err);
          });
        }
      } catch (err) {
        console.warn('Failed to encode local temp image:', err);
      }
      break;
    }

    case 'url':
    default:
      // Do nothing
      break;
  }
}
