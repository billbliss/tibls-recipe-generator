// Defines the interface and related types for the RecipeStore interface, an abstraction for recipe/collection storage
// This allows the app to store recipes using different storage back ends.

// types/recipeStore.ts
export enum StoreType {
  Gist = 'gist',
  Json = 'json',
  R2 = 'r2'
}

export interface RecipeRecord {
  name: string;
  description: string;
  date: string;
  rawJsonUrl: string;
  tiblsUrl: string;
  ogImageUrl: string;
  filename: string;
}

export interface RecipeStore {
  loadAllRecipes(baseUrl: string): Promise<RecipeRecord[]>;
  loadRecipe(filename: string): Promise<TiblsRecipeEnvelope | null>;
  saveRecipe(tiblsJson: TiblsRecipeEnvelope, existingFileName?: string): Promise<string>;
  loadRecipeCollection?(): Promise<Record<string, TiblsRecipeEnvelope>>;

  // Most classes won't need this but if you need an async call to complete class initialization, this is it
  initialize?(): Promise<void>;

  // Optional getter/setter methods on the store ID
  getRecipeCollectionId?(): string;
  setRecipeCollectionId?(storeId: string): string;
}

export interface TiblsRecipeEnvelope {
  '@type': 'application/tibls+json';
  itemListElement: Array<{
    '@type': 'https://tibls.app/types/recipe';
    id: string;
    name: string;
    urlSource?: string;
    ogImageUrl?: string;
    ingredients: Array<{
      text: string;
      sectionHeader: string;
    }>;
    steps: Array<{
      text: string;
      sectionHeader: string;
      time?: number;
      flipTime?: number;
    }>;
    prepTime?: number;
    cookTime?: number;
    totalTime?: number;
    servings?: number;
    calories?: number;
    notes?: Array<{ text: string }>;
    [key: string]: any;
  }>;
  [key: string]: any;
}

export type TiblsRecipe = TiblsRecipeEnvelope['itemListElement'][number];
