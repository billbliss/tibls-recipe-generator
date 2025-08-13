import axios from 'axios';
import { isValidTiblsJson } from '../utils/recipe-utils';
import { generateRecipeFilename } from '../utils/file-utils';
import { RecipeStore, RecipeRecord, TiblsRecipeEnvelope } from '../types/recipeStoreTypes';
import { mapRecipeCollectionToRecipeRecords } from './recipeStore';

export class GistRecipeStore implements RecipeStore {
  private readonly gistId: string;

  constructor(overrideGistId?: string) {
    this.gistId = this.resolveGistId(overrideGistId);
  }

  private resolveGistId(override?: string): string {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('Missing GitHub token');
    }

    if (override) return override;
    if (process.env.DEFAULT_GIST_ID) return process.env.DEFAULT_GIST_ID;

    throw new Error('Missing Gist ID');
  }

  getRecipeCollectionId(): string {
    return this.gistId;
  }

  async loadAllRecipes(baseUrl: string): Promise<RecipeRecord[]> {
    const gistId = this.gistId;

    const response = await axios.get(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json'
      }
    });

    const files = response.data.files;
    const parsed = this.parseGistFilesToRecipeCollection(files);
    return mapRecipeCollectionToRecipeRecords(parsed, baseUrl);
  }

  async loadRecipe(filename: string): Promise<TiblsRecipeEnvelope | null> {
    // Retreive the contents of a Gist
    const response = await axios.get(`https://api.github.com/gists/${this.gistId}`, {
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

  async saveRecipe(tiblsJson: TiblsRecipeEnvelope, existingFileName?: string): Promise<string> {
    // In test mode, skip saving
    if (process.env.NODE_ENV === 'test') {
      console.log('[TEST MODE] Skipping saving recipe');
      return 'ValidRecipe-01-Jan-2024.json';
    }

    const filename = existingFileName || `${generateRecipeFilename(tiblsJson, true)}.json`;
    const recipePayload = {
      files: { [filename]: { content: JSON.stringify(tiblsJson, null, 2) } }
    };

    await axios.patch(`https://api.github.com/gists/${this.gistId}`, recipePayload, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Tibls-Webhook-Handler'
      }
    });

    return filename;
  }

  private parseGistFilesToRecipeCollection(
    files: Record<string, { content: string }>
  ): Record<string, TiblsRecipeEnvelope> {
    const result: Record<string, TiblsRecipeEnvelope> = {};

    for (const [filename, file] of Object.entries(files)) {
      if ((file as any).truncated) {
        console.log(`Skipping truncated recipe: ${filename}.`);
        continue;
      }
      if (!file?.content) continue;

      try {
        const parsed = JSON.parse(file.content);
        result[filename] = parsed;
      } catch {
        console.warn(`Skipping invalid JSON in file ${filename}`);
      }
    }

    return result;
  }
}
