import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { fetchGistRecipes } from '../gistService';

vi.mock('axios');

describe('fetchGistRecipes', () => {
  const baseUrl = 'http://localhost:3000';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('parses valid recipe JSON files correctly', async () => {
    const mockGistResponse = {
      data: {
        files: {
          'Recipe-01-Jan-2024.json': {
            content: JSON.stringify({
              itemListElement: [
                {
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

    (axios.get as any).mockResolvedValue(mockGistResponse);

    const recipes = await fetchGistRecipes('fake-gist-id', baseUrl);

    expect(recipes).toHaveLength(1);
    expect(recipes[0].name).toBe('Mock Recipe');
    expect(recipes[0].description).toBe('A test summary');
    expect(recipes[0].ogImageUrl).toBe('http://example.com/image.jpg');
    expect(recipes[0].date).toBe('01-Jan-2024'); // from filename
    expect(recipes[0].tiblsUrl).toContain('tibls://tibls.app/import');
    expect(recipes[0].rawJsonUrl).toBe(`${baseUrl}/gist-file/Recipe-01-Jan-2024.json`);
  });

  it('falls back to filename when recipe name is missing', async () => {
    const mockGistResponse = {
      data: {
        files: {
          'Fallback.json': {
            content: JSON.stringify({
              itemListElement: [
                {
                  summary: '',
                  created: 1704067200
                }
              ]
            })
          }
        }
      }
    };

    (axios.get as any).mockResolvedValue(mockGistResponse);

    const recipes = await fetchGistRecipes('fake-gist-id', baseUrl);
    expect(recipes[0].name).toBe('Fallback'); // derived from filename
    expect(recipes[0].description).toBe('');
    expect(recipes[0].date).toBe('Jan 1, 2024'); // derived from created timestamp
  });

  it('returns "Unknown" date when no date is found', async () => {
    const mockGistResponse = {
      data: {
        files: {
          'NoDate.json': {
            content: JSON.stringify({
              itemListElement: [
                {
                  name: 'No Date Recipe'
                }
              ]
            })
          }
        }
      }
    };

    (axios.get as any).mockResolvedValue(mockGistResponse);

    const recipes = await fetchGistRecipes('fake-gist-id', baseUrl);
    expect(recipes[0].date).toBe('Unknown');
  });

  it('handles invalid JSON gracefully', async () => {
    const mockGistResponse = {
      data: {
        files: {
          'Invalid.json': {
            content: '{not valid json'
          }
        }
      }
    };

    (axios.get as any).mockResolvedValue(mockGistResponse);

    const recipes = await fetchGistRecipes('fake-gist-id', baseUrl);
    expect(recipes).toHaveLength(0);
  });
});
