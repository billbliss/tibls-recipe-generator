// This file contains utility functions for handling recipe data in Tibls JSON format.

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
