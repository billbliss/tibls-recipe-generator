import { describe, it, beforeEach, expect, vi, beforeAll } from 'vitest';
import axios from 'axios';
import request from 'supertest';

vi.mock('axios');

vi.mock('@google-cloud/vision', () => ({
  __esModule: true,
  default: {
    ImageAnnotatorClient: vi.fn(() => ({
      textDetection: vi.fn().mockResolvedValue([
        {
          textAnnotations: [{ description: 'OCR extracted recipe text' }]
        }
      ])
    }))
  }
}));

let app: any;

beforeAll(async () => {
  const mod = await import('../../server');
  app = mod.app;
});

describe('POST /webhook with image uploads - success case', () => {
  const fakeToolArgs = {
    itemListElement: [{ name: 'Mock Image Recipe', servings: 2, ingredients: [], steps: [] }]
  };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.OPENAI_API_KEY = 'fake-key';

    (axios.post as any).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    arguments: JSON.stringify(fakeToolArgs)
                  }
                }
              ]
            }
          }
        ]
      }
    });
  });

  it('processes an uploaded image and returns Tibls JSON', async () => {
    const res = await request(app)
      .post('/webhook')
      .attach('filename', 'test/fixtures/images/sample-recipe-image.jpg', {
        contentType: 'image/jpeg'
      })
      .field('responseMode', 'json');

    expect(res.status).toBe(200);
    expect(res.body.itemListElement[0].name).toBe('Mock Image Recipe');
  });
});
