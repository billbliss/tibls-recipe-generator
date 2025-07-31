export enum ResponseMode {
  JSON = 'json',
  VIEWER = 'viewer'
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

export enum WebhookInput {
  PDF,
  IMAGE,
  URL,
  TEXT,
  INVALID
}

// A way to indicate intent to ChatGPT regarding what to focus on - ingredients, overall recipe, etc.
export enum RecipeFocusMode {
  RECIPE = 'recipe',
  INGREDIENTS = 'ingredients'
}
