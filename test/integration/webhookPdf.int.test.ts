import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../server';
import * as chatgptService from '../../services/chatgptService';

describe('POST /webhook with PDF input', () => {
  it('returns Tibls JSON for an uploaded recipe PDF', async () => {
    vi.spyOn(chatgptService, 'processRecipeWithChatGPT').mockResolvedValue({
      itemListElement: [
        {
          name: 'Mock PDF Recipe',
          ingredients: [{ text: '1 cup pdf ingredient', sectionHeader: 'Mock Section' }],
          steps: [{ text: 'Mock pdf step 1', sectionHeader: 'Mock Steps' }]
        }
      ]
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
});
