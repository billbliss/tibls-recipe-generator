import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../server';
import { TiblsRecipe } from '../../types/recipeStoreTypes';
import * as chatgptService from '../../services/chatgptService';

const mockRecipe: TiblsRecipe = {
  '@type': 'https://tibls.app/types/recipe',
  id: 'mock-recipe-id',
  name: 'Mock PDF Recipe',
  ingredients: [{ text: '1 cup pdf ingredient', sectionHeader: 'Mock Section' }],
  steps: [{ text: 'Mock pdf step 1', sectionHeader: 'Mock Steps' }]
};

describe('POST /webhook with PDF input', () => {
  it('returns Tibls JSON for an uploaded recipe PDF', async () => {
    vi.spyOn(chatgptService, 'processRecipeWithChatGPT').mockResolvedValue({
      '@type': 'application/tibls+json',
      itemListElement: [mockRecipe]
    });

    const res = await request(app)
      .post('/webhook')
      .attach('filename', 'test/fixtures/pdfs/sample-recipe.pdf', {
        contentType: 'application/pdf'
      })
      .field('responseMode', 'json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('itemListElement');
    expect(Array.isArray(res.body.itemListElement)).toBe(true);
    expect(res.body.itemListElement[0]).toHaveProperty('ingredients');
    expect(res.body.itemListElement[0]).toHaveProperty('steps');
  });

  it('returns 400 if no file is uploaded', async () => {
    const res = await request(app).post('/webhook').field('responseMode', 'json');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 415 for unsupported file types', async () => {
    const res = await request(app)
      .post('/webhook')
      .attach('filename', 'test/fixtures/invalid-file.txt', {
        contentType: 'text/plain'
      })
      .field('responseMode', 'json');
    expect(res.status).toBe(415);
  });

  it('handles errors from ChatGPT service', async () => {
    vi.spyOn(chatgptService, 'processRecipeWithChatGPT').mockRejectedValue(
      new Error('Mock failure')
    );

    const res = await request(app)
      .post('/webhook')
      .attach('filename', 'test/fixtures/pdfs/sample-recipe.pdf', {
        contentType: 'application/pdf'
      })
      .field('responseMode', 'json');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});
