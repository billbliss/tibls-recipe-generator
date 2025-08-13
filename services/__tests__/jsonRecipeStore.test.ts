import fs from 'fs';
import { describe, it, expect } from 'vitest';
import { JsonRecipeStore } from '../jsonRecipeStore';
import type { TiblsRecipeEnvelope } from '../../types/recipeStoreTypes';

const TEMP_FILE = process.env.DEFAULT_JSON_FILE_TEST || '';

const sampleRecipe: TiblsRecipeEnvelope = {
  '@type': 'application/tibls+json',
  itemListElement: [
    {
      '@type': 'https://tibls.app/types/recipe',
      id: 'test-id',
      name: 'Sample Recipe',
      ingredients: [{ text: '1 cup flour', sectionHeader: 'Dry' }],
      steps: [{ text: 'Mix the flour', sectionHeader: 'Mixing' }]
    }
  ]
};

describe('jsonRecipeStore', () => {
  it('loads the full recipe collection', async () => {
    const store = new JsonRecipeStore(TEMP_FILE);
    const collection = await store.loadRecipeCollection();
    expect(collection).toHaveProperty('ValidRecipe-01-Jan-2024.json');
    expect(collection['ValidRecipe-01-Jan-2024.json'].itemListElement[0].name).toBe('Mock Recipe');
  });

  it('loads a single recipe', async () => {
    const store = new JsonRecipeStore(TEMP_FILE);
    const recipe = await store.loadRecipe('ValidRecipe-01-Jan-2024.json');
    expect(recipe.itemListElement[0].id).toBe('test-id');
  });

  it('throws if loading an invalid recipe', async () => {
    const store = new JsonRecipeStore(TEMP_FILE);
    const data = JSON.parse(fs.readFileSync(TEMP_FILE, 'utf-8'));
    data['Invalid.json'] = { not: 'valid' };
    await expect(store.loadRecipe('Invalid.json')).rejects.toThrow();
  });

  it('saves a new recipe with generated filename', async () => {
    const store = new JsonRecipeStore(TEMP_FILE);
    const newRecipe: TiblsRecipeEnvelope = JSON.parse(JSON.stringify(sampleRecipe));
    newRecipe.itemListElement[0].id = 'test-id';
    newRecipe.itemListElement[0].name = 'New Recipe';

    const filename = await store.saveRecipe(newRecipe);
    const updated = await store.loadRecipeCollection();

    expect(filename).toMatch(/^ValidRecipe-\d{2}-[A-Za-z]+-\d{4}\.json$/);
    expect(updated[filename].itemListElement[0].id).toBe('test-id');
  });

  it('loads recipe records with baseUrl', async () => {
    const store = new JsonRecipeStore(TEMP_FILE);
    const records = await store.loadAllRecipes('http://localhost:3000');
    expect(records).toHaveLength(1); // Two recipes in the test file are invalid and will be discarded
    expect(records[0].filename).toBe('ValidRecipe-01-Jan-2024.json');
  });

  it('returns the correct store ID', () => {
    const store = new JsonRecipeStore(TEMP_FILE);
    expect(store.getRecipeCollectionId()).toBe(TEMP_FILE);
  });
});
