export enum ResponseMode {
  JSON = 'json',
  VIEWER = 'viewer'
}

export interface TiblsJson {
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

export enum WebhookInput {
  PDF,
  IMAGE,
  URL,
  TEXT,
  INVALID
}
