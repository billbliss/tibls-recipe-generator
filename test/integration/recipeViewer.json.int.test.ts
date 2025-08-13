import request from 'supertest';
import { describe, it, expect } from 'vitest';
let app: any;

beforeAll(async () => {
  // Use local JSON store for this viewer test
  process.env.RECIPE_STORE_TYPE = 'json';
  vi.resetModules(); // clear module cache so server re-reads env
  ({ app } = await import('../../server'));
});

describe('GET /recipe-collection/:recipeId viewer', () => {
  it('renders viewer HTML with valid recipe cards', async () => {
    const res = await request(app).get('/recipe-collection/fake-gist-id');

    expect(res.status).toBe(200);
    // HTML should include valid recipe details
    expect(res.text).toContain('Mock Recipe');
    expect(res.text).toContain('This is a fake recipe');
    expect(res.text).toContain('https://example.com/original.jpg');
    expect(res.text).toContain('Import');
    expect(res.text).toContain('Raw JSON');

    // It should NOT render invalid JSON or ignored files
    expect(res.text).not.toContain('Invalid.json');
    expect(res.text).not.toContain('ignore.txt');
  });
});
