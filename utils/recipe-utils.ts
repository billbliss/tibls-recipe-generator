// This file contains utility functions for handling recipe data in Tibls JSON format.

import { FOOD_KEYWORDS_REGEX } from './constants';

// Applies a per-serving calories override to the recipe if the estimated total calories differ significantly
// from the model-estimated value.
// It updates the recipe's calories and adds a note explaining the override.
export function applyPerServingCaloriesOverride(
  tiblsJson: any,
  perServingCalories: number,
  servings: number
): void {
  const recipe = tiblsJson?.itemListElement?.[0];
  if (!recipe || typeof perServingCalories !== 'number' || typeof servings !== 'number') return;

  const estimatedNote = recipe.notes?.find(
    (n: any) => typeof n.text === 'string' && n.text.includes('Estimated total calories')
  );

  const perServingTotal = Math.round(perServingCalories * servings);
  const isCloseEnough = Math.abs(perServingTotal - recipe.calories) < 50;

  if (estimatedNote && !isCloseEnough) {
    recipe.calories = perServingTotal;
    recipe.notes.push({
      text: `Calories per serving stated as ${perServingCalories}; multiplied by ${servings} servings = ${perServingTotal} total kcal. Overrode model-estimated value.`
    });
  }
}

// Enforces that the recipe's calories are per serving by dividing total calories by servings
// and updating the recipe if necessary.
// It adds a note explaining the conversion if the recipe's calories were not already per serving.
export function enforcePerServingCalories(tiblsJson: any): void {
  const recipe = tiblsJson?.itemListElement?.[0];
  if (!recipe || typeof recipe.calories !== 'number' || typeof recipe.servings !== 'number') return;

  const perServing = Math.round(recipe.calories / recipe.servings);
  if (perServing !== recipe.calories) {
    recipe.notes = recipe.notes || [];
    recipe.notes.push({
      text: `Converted total calories (${recipe.calories}) to per-serving (${perServing}) based on ${recipe.servings} servings.`
    });
    recipe.calories = perServing;
  }
}

// Heuristic for determining if a given web page contains a recipe - used to prevent non-recipe pages
// from further processing.
export function isLikelyRecipePage(jsonLd: any, title: string, headHtml: string): boolean {
  const isRecipeJsonLd = !!jsonLd;
  const hasFoodKeyword = FOOD_KEYWORDS_REGEX.test(title);
  // Very weak fallback: look for food words in the <head>
  const headFoodSignals = FOOD_KEYWORDS_REGEX.test(headHtml);

  return isRecipeJsonLd || hasFoodKeyword || headFoodSignals;
}

// Heuristic for determining if a given text is likely to be a recipe.
export function isLikelyRecipeText(text: string): boolean {
  if (typeof text !== 'string') return false;
  const wordCount = text.trim().split(/\s+/).length;
  const hasEnoughWords = wordCount >= 50;
  const hasFoodKeyword = FOOD_KEYWORDS_REGEX.test(text);
  return hasEnoughWords && hasFoodKeyword;
}
