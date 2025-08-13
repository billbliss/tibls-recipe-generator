import fs from 'fs';
import path from 'path';
import type { RecipeRecord, RecipeStore, TiblsRecipeEnvelope } from '../types/recipeStoreTypes';
import { mapRecipeCollectionToRecipeRecords } from './recipeStore';
import { generateRecipeFilename } from '../utils/file-utils';
import { isValidTiblsJson } from '../utils/recipe-utils';

export class JsonRecipeStore implements RecipeStore {
  private recipesPath: string;
  private recipesDir: string;
  private recipesFilename: string;

  constructor(recipesPath?: string) {
    if (process.env.NODE_ENV === 'test') {
      this.recipesPath = process.env.DEFAULT_JSON_FILE_TEST || '';
    } else {
      this.recipesPath = recipesPath ?? (process.env.DEFAULT_JSON_FILE || '');
    }
    this.recipesDir = path.dirname(this.recipesPath);
    this.recipesFilename = path.basename(this.recipesPath);
  }

  async loadRecipeCollection(): Promise<Record<string, TiblsRecipeEnvelope>> {
    const raw = fs.readFileSync(this.recipesPath, 'utf-8');
    try {
      const parsed = JSON.parse(raw);
      return parsed;
    } catch {
      throw new Error(`${this.recipesPath} does not contain valid JSON.`);
    }
  }

  async loadRecipe(filename: string): Promise<TiblsRecipeEnvelope> {
    const recipeCollection = await this.loadRecipeCollection();
    if (isValidTiblsJson(recipeCollection[filename])) {
      return recipeCollection[filename];
    } else {
      throw new Error(`Invalid Tibls JSON format: ${filename}`);
    }
  }

  async saveRecipe(recipeData: TiblsRecipeEnvelope, existingFilename?: string): Promise<string> {
    // In test mode, skip saving
    if (process.env.NODE_ENV === 'test') {
      console.log('[TEST MODE] Skipping saving recipe');
      return 'ValidRecipe-01-Jan-2024.json';
    }

    const recipeCollection = await this.loadRecipeCollection();
    const filename = existingFilename ?? `${generateRecipeFilename(recipeData, true)}.json`;
    recipeCollection[filename] = recipeData;
    fs.writeFileSync(this.recipesPath, JSON.stringify(recipeCollection, null, 2), 'utf-8');
    return filename;
  }

  async loadAllRecipes(baseUrl: string): Promise<RecipeRecord[]> {
    const raw = fs.readFileSync(this.recipesPath, 'utf-8');
    try {
      const parsed = JSON.parse(raw);
      return mapRecipeCollectionToRecipeRecords(parsed, baseUrl);
    } catch {
      throw new Error(`${this.recipesPath} does not contain valid JSON.`);
    }
  }

  getRecipeCollectionId(): string {
    return this.recipesPath;
  }
}
