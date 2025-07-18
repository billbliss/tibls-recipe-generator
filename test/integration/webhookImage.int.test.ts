import * as chatgptService from '../../services/chatgptService';

vi.spyOn(chatgptService, 'processRecipeWithChatGPT').mockResolvedValue({
  itemListElement: [
    {
      name: 'Mock Image Recipe',
      ingredients: [{ text: '1 cup mock ingredient', sectionHeader: 'Mock Section' }],
      steps: [{ text: 'Mock step 1', sectionHeader: 'Mock Steps' }]
    }
  ]
});
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../server';

describe('POST /webhook with image input', () => {
  it('returns Tibls JSON for an uploaded recipe image', async () => {
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
});
