import request from 'supertest';
import axios from 'axios';
import { app } from '../../server';
import * as coreUtils from '../../utils/core-utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('axios');

// Mock fetchWithRetry so we don’t hit a real network
vi.mock('../../utils/core-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/core-utils')>();
  return {
    ...actual,
    fetchWithRetry: vi.fn(),
    createLogger: () => ({ log: vi.fn() })
  };
});

describe('POST /webhook with URL inputs', () => {
  const recipeUrl = 'http://example.com/recipe';

  beforeEach(() => {
    vi.clearAllMocks();
    (axios.post as any).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    arguments: JSON.stringify({
                      itemListElement: [
                        {
                          name: 'Mock URL Recipe',
                          servings: 4,
                          ingredients: [],
                          steps: []
                        }
                      ]
                    })
                  }
                }
              ]
            }
          }
        ]
      }
    });
    (axios.patch as any).mockResolvedValue({ data: {} });
  });

  it('returns JSON-LD recipe prompt when JSON-LD Recipe is present', async () => {
    const jsonLdRecipe = {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Integration Test Recipe',
      recipeIngredient: ['1 cup flour', '2 eggs'],
      recipeInstructions: ['Mix', 'Bake']
    };

    const html = `
      <html>
        <head>
          <title>Integration Test Recipe</title>
          <script type="application/ld+json">
            ${JSON.stringify(jsonLdRecipe)}
          </script>
        </head>
        <body>Recipe body</body>
      </html>
    `;

    (coreUtils.fetchWithRetry as any).mockResolvedValue({ data: html });

    const res = await request(app)
      .post('/webhook')
      .field('input', recipeUrl)
      .field('responseMode', 'json');

    expect(res.status).toBe(200);
    expect(res.body.itemListElement[0].name).toBe('Mock URL Recipe');
  });

  it('falls back to HTML metadata when no JSON-LD recipe is found', async () => {
    const html = `
      <html>
        <head>
          <title>Fallback Page</title>
          <script type="application/ld+json">
            { "@context": "https://schema.org", "@type": "Person", "name": "Not a recipe" }
          </script>
        </head>
        <body>No recipe here</body>
      </html>
    `;

    (coreUtils.fetchWithRetry as any).mockResolvedValue({ data: html });

    const res = await request(app)
      .post('/webhook')
      .field('input', recipeUrl)
      .field('responseMode', 'json');

    expect(res.status).toBe(200);
    expect(res.body.itemListElement[0].name).toBe('Mock URL Recipe');
  });

  it('returns 500 for non-recipe pages', async () => {
    const html = `
      <html>
        <head><title>Random page</title></head>
        <body>No recipe keywords</body>
      </html>
    `;

    (coreUtils.fetchWithRetry as any).mockResolvedValue({ data: html });

    const res = await request(app).post('/webhook').field('input', recipeUrl);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/does not appear to contain a recipe/);
  });
});
