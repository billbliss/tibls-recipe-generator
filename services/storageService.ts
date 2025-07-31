import axios from 'axios';
import { isValidTiblsJson } from '../utils/recipe-utils';
import { generateRecipeFilename } from '../utils/file-utils';
import { TiblsRecipeEnvelope } from '../types/types';

export interface RecipeRecord {
  name: string;
  description: string;
  date: string;
  rawJsonUrl: string;
  tiblsUrl: string;
  ogImageUrl: string;
  filename: string;
}

let dbIdOverride: string | null = null;

export function setCurrentDbId(newId: string) {
  dbIdOverride = newId;
}

export function getCurrentDbId(): string {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('Missing GitHub token for viewer mode');
  }

  if (dbIdOverride) return dbIdOverride;

  if (process.env.GIST_ID) return process.env.GIST_ID;

  throw new Error('Missing Gist ID for viewer mode');
}

export async function loadAllRecipes(dbId: string, baseUrl: string): Promise<RecipeRecord[]> {
  dbId = dbId || getCurrentDbId();

  const response = await axios.get(`https://api.github.com/gists/${dbId}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json'
    }
  });

  const files = response.data.files;

  return Object.keys(files)
    .filter((filename) => filename.endsWith('.json'))
    .map((filename) => {
      const file = files[filename];
      const rawJsonUrl = `${baseUrl}/gist-file/${filename}`;
      const tiblsUrl = `tibls://tibls.app/import?r=${rawJsonUrl}`;
      let parsed;
      try {
        parsed = JSON.parse(file.content);
        if (!isValidTiblsJson(parsed)) throw new Error('Invalid Tibls JSON');
      } catch {
        return null; // skip invalid JSON file
      }

      const recipe = parsed?.itemListElement?.[0] || {};
      const name = recipe.name || filename.replace(/\.json$/, '');
      const description = recipe.summary || '';
      const dateMatch = filename.match(/(\d{1,2}-[A-Za-z]+-\d{4})/);
      let date = 'Unknown';
      if (dateMatch) {
        date = dateMatch[1];
      } else {
        const timestamp = parsed?.created || parsed?.updated || recipe.created || recipe.updated;
        if (timestamp) {
          date = new Date(timestamp * 1000).toLocaleDateString('en-US', {
            timeZone: 'UTC',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
        }
      }
      const ogImageUrl = recipe.ogImageUrl || '';

      return { name, description, date, rawJsonUrl, tiblsUrl, ogImageUrl, filename };
    })
    .filter((recipe): recipe is RecipeRecord => Boolean(recipe));
}

export async function loadRecipe(dbId: string, filename: string): Promise<any | null> {
  dbId = dbId || getCurrentDbId();

  // Retreive the contents of a Gist
  const response = await axios.get(`https://api.github.com/gists/${dbId}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json'
    }
  });

  const file = response.data.files?.[filename];
  if (!file || !file.content) return null;

  if (!isValidTiblsJson(file.content)) {
    throw new Error(`Invalid Tibls JSON format: ${filename}`);
  }

  try {
    return JSON.parse(file.content);
  } catch {
    return null;
  }
}

export async function saveRecipe(
  dbId: string | null,
  tiblsJson: TiblsRecipeEnvelope,
  existingFileName?: string
): Promise<string> {
  dbId = dbId || getCurrentDbId();

  // In test mode, skip saving
  if (process.env.NODE_ENV === 'test') {
    console.log('[TEST MODE] Skipping GitHub Gist save');
    return 'fake-filename.json';
  }

  const filename = existingFileName || `${generateRecipeFilename(tiblsJson)}.json`;
  const recipePayload = {
    files: { [filename]: { content: JSON.stringify(tiblsJson, null, 2) } }
  };

  await axios.patch(`https://api.github.com/gists/${dbId}`, recipePayload, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Tibls-Webhook-Handler'
    }
  });

  return filename;
}
