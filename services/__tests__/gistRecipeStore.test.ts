import { GistRecipeStore } from '../gistRecipeStore';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');

describe('loadAllRecipes', () => {
  const baseUrl = 'http://localhost:3000';
  let store: GistRecipeStore;

  beforeEach(() => {
    vi.resetAllMocks();
    store = new GistRecipeStore('fake-gist-id');
  });

  it('parses valid recipe JSON files correctly', async () => {
    const mockRecipeResponse = {
      data: {
        files: {
          'Recipe-01-Jan-2024.json': {
            content: JSON.stringify({
              '@type': 'application/tibls+json',
              itemListElement: [
                {
                  '@type': 'https://tibls.app/types/recipe',
                  name: 'Mock Recipe',
                  summary: 'A test summary',
                  ogImageUrl: 'http://example.com/image.jpg',
                  created: 1704067200 // 1 Jan 2024
                }
              ]
            })
          },
          'ignore.txt': {
            content: 'not a json recipe'
          }
        }
      }
    };

    (axios.get as any).mockResolvedValue(mockRecipeResponse);

    const recipes = await store.loadAllRecipes(baseUrl);

    expect(recipes).toHaveLength(1);
    expect(recipes[0].name).toBe('Mock Recipe');
    expect(recipes[0].description).toBe('A test summary');
    expect(recipes[0].ogImageUrl).toBe('http://example.com/image.jpg');
    expect(recipes[0].date).toBe('01-Jan-2024'); // from filename
    expect(recipes[0].tiblsUrl).toContain('tibls://tibls.app/import');
    expect(recipes[0].rawJsonUrl).toBe(`${baseUrl}/recipe-file/Recipe-01-Jan-2024.json`);
  });

  it('handles invalid JSON gracefully', async () => {
    const mockRecipeResponse = {
      data: {
        files: {
          'Invalid.json': {
            content: '{not valid json'
          }
        }
      }
    };

    (axios.get as any).mockResolvedValue(mockRecipeResponse);

    const recipes = await store.loadAllRecipes(baseUrl);
    expect(recipes).toHaveLength(0);
  });
});

describe('loadRecipe', () => {
  let store: GistRecipeStore;

  beforeEach(() => {
    vi.resetAllMocks();
    store = new GistRecipeStore('fake-gist-id');
  });

  it('parses a valid single recipe JSON', async () => {
    const mockRecipeResponse = {
      data: {
        files: {
          'ValidRecipe.json': {
            content: `{
              "@type": "application/tibls+json",
              "itemListElement": [
                {
                  "@type": "https://tibls.app/types/recipe",
                  "name": "Test Recipe",
                  "ingredients": [{ "text": "1 cup flour", "sectionHeader": "Dough" }],
                  "steps": [{ "text": "Mix ingredients.", "sectionHeader": "Prep" }]
                }
              ]
            }`
          }
        }
      }
    };

    (axios.get as any).mockResolvedValue(mockRecipeResponse);

    const recipe = await store.loadRecipe('ValidRecipe.json');

    expect(recipe?.itemListElement[0].name).toBe('Test Recipe');
    expect(recipe?.itemListElement[0].ingredients).toHaveLength(1);
    expect(recipe?.itemListElement[0].steps).toHaveLength(1);
  });

  it('throws an error for missing file in gist', async () => {
    const mockRecipeResponse = {
      data: {
        files: {
          'OtherFile.json': { content: '{}' }
        }
      }
    };

    (axios.get as any).mockResolvedValue(mockRecipeResponse);

    const recipe = await store.loadRecipe('MissingRecipe.json');
    expect(recipe).toBeNull();
  });

  it('throws an error for invalid JSON', async () => {
    const mockRecipeResponse = {
      data: {
        files: {
          'Bad.json': {
            content: '{invalid json'
          }
        }
      }
    };

    (axios.get as any).mockResolvedValue(mockRecipeResponse);

    await expect(store.loadRecipe('Bad.json')).rejects.toThrow(/^Invalid Tibls JSON format/);
  });

  it('throws an error if itemListElement is missing', async () => {
    const mockRecipeResponse = {
      data: {
        files: {
          'Empty.json': {
            content: JSON.stringify({})
          }
        }
      }
    };

    (axios.get as any).mockResolvedValue(mockRecipeResponse);

    await expect(store.loadRecipe('Empty.json')).rejects.toThrow(/^Invalid Tibls JSON format/);
  });
});
