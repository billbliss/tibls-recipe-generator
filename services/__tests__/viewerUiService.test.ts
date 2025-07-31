import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { renderViewerHtml } from '../viewerUiService';
import { RecipeRecord } from '../storageService';

vi.mock('fs');

describe('renderViewerHtml', () => {
  const fakeTemplate = '<html><body>{{TABLE_ROWS}}</body></html>';

  beforeEach(() => {
    vi.resetAllMocks();
    (fs.readFileSync as any).mockReturnValue(fakeTemplate);
  });

  it('renders a recipe card with all fields populated', () => {
    const recipes: RecipeRecord[] = [
      {
        name: 'Test Recipe',
        description: 'A simple test recipe',
        date: 'Jan 1, 2024',
        tiblsUrl: 'tibls://import',
        rawJsonUrl: 'http://example.com/test.json',
        ogImageUrl: 'http://example.com/image.jpg',
        filename: 'test-recipe.json'
      }
    ];

    const html = renderViewerHtml(recipes);

    expect(html).toContain('<html><body>');
    expect(html).toContain('Test Recipe');
    expect(html).toContain('A simple test recipe');
    expect(html).toContain('Jan 1, 2024');
    expect(html).toContain('tibls://import');
    expect(html).toContain('http://example.com/test.json');
    expect(html).toContain('<img class="thumbnail" src="http://example.com/image.jpg"');
    expect(html).toContain('</body></html>');
  });

  it('renders without image or summary if not provided', () => {
    const recipes: RecipeRecord[] = [
      {
        name: 'Recipe No Image',
        description: '',
        date: '',
        tiblsUrl: 'tibls://noimage',
        rawJsonUrl: 'http://example.com/noimage.json',
        ogImageUrl: '',
        filename: 'noimage-recipe.json'
      }
    ];

    const html = renderViewerHtml(recipes);

    expect(html).toContain('Recipe No Image');
    expect(html).toContain('Unknown'); // date fallback
    expect(html).toContain('tibls://noimage');
    expect(html).toContain('<img class="thumbnail default-img" src="/img/default-image.jpg"');
    expect(html).not.toContain('<img class="thumbnail" src="http://example.com/image.jpg"');
    expect(html).not.toContain('Summary');
  });

  it('renders nothing when no recipes are provided', () => {
    const html = renderViewerHtml([]);
    expect(html).not.toContain('recipe-card');
  });
});
