export enum ResponseMode {
  JSON = 'json',
  VIEWER = 'viewer'
}

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
