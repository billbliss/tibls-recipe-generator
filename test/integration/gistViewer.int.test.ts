import request from 'supertest';
import { app } from '../../server';
import axios from 'axios';
import { describe, it, beforeEach, vi, expect } from 'vitest';

vi.mock('axios');

describe('GET /gist/:gistId viewer', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    const mockGistFiles = {
      'ValidRecipe-01-Jan-2024.json': {
        content: JSON.stringify({
          '@type': 'application/tibls+json',
          itemListElement: [
            {
              '@type': 'https://tibls.app/types/recipe',
              name: 'Valid Recipe',
              summary: 'A test summary',
              ogImageUrl: 'http://example.com/image.jpg',
              created: 1704067200
            }
          ]
        })
      },
      'Invalid.json': {
        content: '{not valid json'
      },
      'ignore.txt': {
        content: 'should be ignored'
      }
    };

    (axios.get as any).mockResolvedValue({ data: { files: mockGistFiles } });
  });

  it('renders viewer HTML with valid recipe cards', async () => {
    const res = await request(app).get('/gist/fake-gist-id');

    expect(res.status).toBe(200);
    // HTML should include valid recipe details
    expect(res.text).toContain('Valid Recipe');
    expect(res.text).toContain('A test summary');
    expect(res.text).toContain('http://example.com/image.jpg');
    expect(res.text).toContain('Import');
    expect(res.text).toContain('Raw JSON');

    // It should NOT render invalid JSON or ignored files
    expect(res.text).not.toContain('Invalid.json');
    expect(res.text).not.toContain('ignore.txt');
  });
});
