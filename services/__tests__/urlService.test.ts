import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleUrl } from '../urlService';
import * as coreUtils from '../../utils/core-utils';

// Mock fetchWithRetry so it doesn’t hit the network
vi.mock('../../utils/core-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/core-utils')>();
  return {
    ...actual,
    fetchWithRetry: vi.fn(),
    createLogger: () => ({ log: vi.fn() })
  };
});

describe('handleUrl', () => {
  const recipeUrl = 'http://example.com/recipe';
  const title = '<title>Test Recipe</title>';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns JSON-LD recipe prompt when JSON-LD Recipe is present', async () => {
    const jsonLdRecipe = {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Test Recipe',
      recipeIngredient: ['1 cup flour', '2 eggs'],
      recipeInstructions: ['Mix', 'Bake']
    };

    const html = `
      <html>
        <head>
          ${title}
          <script type="application/ld+json">
            ${JSON.stringify(jsonLdRecipe)}
          </script>
        </head>
        <body>Recipe body</body>
      </html>
    `;

    vi.mocked(coreUtils.fetchWithRetry).mockResolvedValue({ data: html });

    const result = await handleUrl(recipeUrl);

    expect(result).toContain('valid Schema.org JSON-LD recipe data');
    expect(result).toContain(recipeUrl);
    expect(result).toContain('Test Recipe');
    expect(result).toContain('"recipeIngredient":');
    expect(result).toContain('Fallback HTML <head>');
  });

  it('falls back to HTML head metadata when no JSON-LD recipe found', async () => {
    const html = `
      <html>
        <head>
          ${title}
          <script type="application/ld+json">
            { "@context": "https://schema.org", "@type": "Person", "name": "Not a recipe" }
          </script>
        </head>
        <body>No recipe here</body>
      </html>
    `;

    vi.mocked(coreUtils.fetchWithRetry).mockResolvedValue({ data: html });

    const result = await handleUrl(recipeUrl);

    expect(result).toContain('HTML metadata for http://example.com/recipe');
    expect(result).toContain(recipeUrl);
    expect(result).toContain('<title>Test Recipe</title>');
  });

  it('throws an error if the page is not a likely recipe page', async () => {
    const html = `
      <html>
        <head><title>Random page</title></head>
        <body>No recipe keywords</body>
      </html>
    `;

    vi.mocked(coreUtils.fetchWithRetry).mockResolvedValue({ data: html });

    await expect(handleUrl(recipeUrl)).rejects.toThrow(
      'This page does not appear to contain a recipe'
    );
  });
});
