// utils/constants.ts

// Max size for BASE64 images varies by browser and platform, but 1,000,000 bytes should be a safe limit
// BASE64 encoding increases size by about 33%, so we set a max size of 750,000 bytes
export const MAX_BASE64_SIZE = 750_000;

// Maximium image width of a converted image in pixels
export const MAX_IMAGE_WIDTH = 800;

// Image quality for a converted image
export const JPEG_IMAGE_QUALITY = 75;

// Regex used to screen for food/recipe related terms so non-recipe related URLs are detected and rejected
export const FOOD_KEYWORDS_REGEX =
  /(?:recipe|ingredients|cooking|baking|kitchen|dish|meal|nutrition|flavor|snack|dinner|lunch|breakfast|dessert|sauce|salad|soup|entree|healthy|vegan|gluten[-_]free|paleo|keto)/i;
