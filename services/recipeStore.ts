// services/recipeStore.ts
import {
  StoreType,
  RecipeStore,
  RecipeRecord,
  TiblsRecipeEnvelope
} from '../types/recipeStoreTypes';
import { GistRecipeStore } from './gistRecipeStore';
import { JsonRecipeStore } from './jsonRecipeStore'; // hypothetical
import { R2RecipeStore } from './r2RecipeStore'; // hypothetical

import { isValidTiblsJson } from '../utils/recipe-utils';

export function createRecipeStore(): RecipeStore {
  const storeType = process.env.RECIPE_STORE_TYPE as StoreType;

  switch (storeType) {
    case StoreType.Gist:
      return new GistRecipeStore(); // optionally pass DEFAULT_GIST_ID override what gist to load
    case StoreType.Json:
      return new JsonRecipeStore(); // pass file path if needed
    case StoreType.R2: // Cloudflare's S3-compatible storage service
      const recipeStore = new R2RecipeStore();
      recipeStore.initialize();
      return recipeStore;
    default:
      throw new Error(`Unsupported RECIPE_STORE_TYPE: ${storeType}`);
  }
}

export function mapRecipeCollectionToRecipeRecords(
  recipes: Record<string, TiblsRecipeEnvelope>,
  baseUrl: string
): RecipeRecord[] {
  return Object.entries(recipes)
    .filter(([filename]) => filename.endsWith('.json'))
    .map(([filename, tiblsRecipe]) => {
      const rawJsonUrl = `${baseUrl}/recipe-file/${filename}`;
      const tiblsUrl = `tibls://tibls.app/import?r=${rawJsonUrl}`;
      try {
        if (!isValidTiblsJson(tiblsRecipe)) throw new Error('Invalid Tibls JSON');
      } catch {
        return null; // skip invalid JSON file
      }

      const recipe = tiblsRecipe?.itemListElement?.[0] || {};
      const name = recipe.name || filename.replace(/\.json$/, '');
      const description = recipe.summary || '';
      const dateMatch = filename.match(/(\d{1,2}-[A-Za-z]+-\d{4})/);
      let date = 'Unknown';
      if (dateMatch) {
        date = dateMatch[1];
      } else {
        const timestamp =
          tiblsRecipe?.created || tiblsRecipe?.updated || recipe.created || recipe.updated;
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
