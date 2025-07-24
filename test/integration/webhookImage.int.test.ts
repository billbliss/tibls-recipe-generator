import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../server';
import * as chatgptService from '../../services/chatgptService';

describe('POST /webhook with image input', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  it('returns Tibls JSON for an uploaded recipe image', async () => {
    vi.spyOn(chatgptService, 'processImageRecipe').mockResolvedValue({
      itemListElement: [
        {
          name: 'Integration Test Recipe',
          ingredients: [{ text: 'mock ingredient', sectionHeader: 'Mock Section' }],
          steps: [{ text: 'mock step', sectionHeader: 'Mock Steps' }]
        }
      ]
    });

    const res = await request(app)
      .post('/webhook')
      .attach('filename', 'test/fixtures/images/sample-recipe-image.jpg', {
        contentType: 'image/jpeg'
      })
      .field('responseMode', 'json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('itemListElement');
    expect(Array.isArray(res.body.itemListElement)).toBe(true);
    expect(res.body.itemListElement[0]).toHaveProperty('ingredients');
    expect(res.body.itemListElement[0]).toHaveProperty('steps');
  });

  it('returns Tibls JSON for multiple uploaded recipe images', async () => {
    vi.spyOn(chatgptService, 'processImageRecipe').mockResolvedValue({
      itemListElement: [
        {
          name: 'Integration Test Recipe',
          ingredients: [{ text: 'mock ingredient', sectionHeader: 'Mock Section' }],
          steps: [{ text: 'mock step', sectionHeader: 'Mock Steps' }]
        }
      ]
    });

    const res = await request(app)
      .post('/webhook')
      .attach('filename', 'test/fixtures/images/sample-recipe-image.jpg', {
        contentType: 'image/jpeg'
      })
      .attach('filename', 'test/fixtures/images/sample-recipe-image.jpg', {
        contentType: 'image/jpeg'
      })
      .field('responseMode', 'json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('itemListElement');
    expect(Array.isArray(res.body.itemListElement)).toBe(true);
    expect(res.body.itemListElement[0]).toHaveProperty('ingredients');
    expect(res.body.itemListElement[0]).toHaveProperty('steps');
  }, 10000);

  it('processes IMAGE input with ingredients in one column and instructions/picture in another', async () => {
    vi.spyOn(chatgptService, 'processImageRecipe').mockResolvedValue({
      itemListElement: [
        {
          name: 'Column Layout Recipe',
          ingredients: [
            { text: '2 cups flour', sectionHeader: 'Dough' },
            { text: '1 egg', sectionHeader: '' }
          ],
          steps: [
            { text: 'Mix flour with egg.', sectionHeader: 'Prep' },
            { text: 'Bake for 20 minutes.', sectionHeader: 'Bake' }
          ]
        }
      ]
    });

    const res = await request(app)
      .post('/webhook')
      .attach('filename', 'test/fixtures/images/recipe-with-ingredients-column.jpg', {
        contentType: 'image/jpeg'
      })
      .field('responseMode', 'json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('itemListElement');
    expect(Array.isArray(res.body.itemListElement)).toBe(true);
    expect(res.body.itemListElement[0].name).toBe('Column Layout Recipe');
    expect(res.body.itemListElement[0].ingredients.length).toBeGreaterThan(0);
    expect(res.body.itemListElement[0].steps.length).toBeGreaterThan(0);
  });

  it('returns Tibls JSON for text plus an uploaded recipe image', async () => {
    vi.spyOn(chatgptService, 'processRecipeWithChatGPT').mockResolvedValue({
      itemListElement: [
        {
          name: 'Mock Text+Image Recipe',
          ingredients: [{ text: 'mock text+image ingredient', sectionHeader: 'Mock Section' }],
          steps: [{ text: 'mock text+image step', sectionHeader: 'Mock Steps' }]
        }
      ]
    });

    const res = await request(app)
      .post('/webhook')
      .field('input', 'Extra recipe text: This recipe serves 2 and uses some ingredients.')
      .attach('filename', 'test/fixtures/images/sample-recipe-image.jpg', {
        contentType: 'image/jpeg'
      })
      .field('responseMode', 'json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('itemListElement');
    expect(Array.isArray(res.body.itemListElement)).toBe(true);
    expect(res.body.itemListElement[0]).toHaveProperty('ingredients');
    expect(res.body.itemListElement[0]).toHaveProperty('steps');
  });
});
