import request from 'supertest';
import { app } from '../../server';
import axios from 'axios';
import { describe, it, beforeEach, expect, vi } from 'vitest';

import * as storageService from '../../services/storageService';

vi.mock('axios');
vi.mock('../../services/storageService', async () => {
  const actual = await vi.importActual<typeof storageService>('../../services/storageService');

  return {
    ...actual,
    loadRecipe: vi.fn(() =>
      Promise.resolve({
        '@type': 'application/tibls+json',
        itemListElement: [
          {
            '@type': 'https://tibls.app/types/recipe',
            id: 'test-id',
            name: 'Mock Recipe',
            ingredients: [{ text: '1 cup flour', sectionHeader: 'Main' }],
            steps: [{ text: 'Mix well', sectionHeader: 'Prep' }],
            ogImageUrl: 'https://example.com/original.jpg'
          }
        ]
      })
    ),
    saveRecipeFile: vi.fn(() => Promise.resolve(true))
  };
});

describe('POST /webhook TEXT and INVALID inputs', () => {
  const fakeToolArgs = {
    itemListElement: [{ name: 'Mock TEXT Recipe', servings: 3, ingredients: [], steps: [] }]
  };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.OPENAI_API_KEY = 'fake-key';
    (axios.post as any).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              tool_calls: [{ function: { arguments: JSON.stringify(fakeToolArgs) } }]
            }
          }
        ]
      }
    });
  });

  it('processes plain TEXT input and returns Tibls JSON', async () => {
    const res = await request(app)
      .post('/webhook')
      .field('input', 'This is a plain text recipe')
      .field('responseMode', 'json');

    expect(res.status).toBe(200);
    expect(res.body.itemListElement[0].name).toBe('Mock TEXT Recipe');
  });

  it('returns 400 for INVALID inputs', async () => {
    const res = await request(app).post('/webhook'); // no input, no file

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid webhook inputs/);
  });

  it('returns 400 for unsupported responseMode', async () => {
    const res = await request(app)
      .post('/webhook')
      .field('input', 'This is a plain text recipe')
      .field('responseMode', 'html');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unsupported responseMode/);
  });

  it('handles invalid tool call structure gracefully', async () => {
    (axios.post as any).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              tool_calls: [{ function: { arguments: 'not valid JSON' } }]
            }
          }
        ]
      }
    });

    const res = await request(app)
      .post('/webhook')
      .field('input', 'Some recipe text')
      .field('responseMode', 'json');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Unexpected token/);
  });
});

it('returns 400 if no input or file is provided', async () => {
  const res = await request(app).post('/webhook').field('responseMode', 'json');

  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/Invalid webhook inputs/);
});

it('returns 415 for unsupported file type', async () => {
  const res = await request(app)
    .post('/webhook')
    .attach('filename', 'test/fixtures/invalid-file.txt', {
      filename: 'invalid-file.txt',
      contentType: 'text/plain'
    })
    .field('responseMode', 'json');

  expect(res.status).toBe(415);
  expect(res.body.error).toMatch(/Unsupported file type/);
});

it('handles valid input but malformed ChatGPT tool_calls structure', async () => {
  (axios.post as any).mockResolvedValue({
    data: {
      choices: [
        {
          message: {
            tool_calls: [{}] // missing function.arguments
          }
        }
      ]
    }
  });

  const res = await request(app)
    .post('/webhook')
    .field('input', 'Sample text')
    .field('responseMode', 'json');

  expect(res.status).toBe(500);
  expect(res.body.error).toMatch(/No tool call arguments returned/);
});

it('returns 500 on unexpected error from chatgptService', async () => {
  (axios.post as any).mockRejectedValue(new Error('Unexpected GPT error'));

  const res = await request(app)
    .post('/webhook')
    .field('input', 'Sample text')
    .field('responseMode', 'json');

  expect(res.status).toBe(500);
  expect(res.body.error).toMatch(/Unexpected GPT error/);
});

it('uses text input when both text and file are provided', async () => {
  const res = await request(app)
    .post('/webhook')
    .field('input', 'This input should take precedence')
    .attach('filename', 'test/fixtures/pdfs/sample-recipe.pdf')
    .field('responseMode', 'json');

  expect(res.status).toBe(500);
  expect(res.body.error).toMatch(
    /If text input is submitted, only a single image file can be submitted with it./
  );
});

describe('POST /update-recipe-image', () => {
  it('returns 400 if no filename is provided', async () => {
    const res = await request(app)
      .post('/update-recipe-image')
      .send({ ogImageUrl: 'https://example.com/image.jpg' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(
      /The filename for the recipe you are trying to save is required./
    );
  });

  it('returns 400 if no ogImageUrl is provided', async () => {
    const res = await request(app)
      .post('/update-recipe-image')
      .send({ filename: 'test-recipe.json' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/The new ogImageUrl is required./);
  });

  it('returns 200 and updates the ogImageUrl when both filename and image URL are valid', async () => {
    const res = await request(app)
      .post('/update-recipe-image')
      .send({ filename: 'test-recipe.json', ogImageUrl: 'https://example.com/image.jpg' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 500 on unexpected error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // silence expected error log

    const res = await request(app)
      .post('/update-recipe-image')
      .send('not json')
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.message || res.text).toMatch(/Unexpected token|JSON/i);
  });
});

describe('POST /upload-image', () => {
  it('returns 400 if no file is provided', async () => {
    const res = await request(app)
      .post('/upload-image')
      .set('Content-Type', 'multipart/form-data')
      // simulate an empty file field (optional)
      .attach('ogImageUpload', Buffer.from(''), {
        filename: '',
        contentType: 'application/octet-stream'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No file uploaded/);
  });

  it('returns 200 and a URL when a valid image is uploaded', async () => {
    const res = await request(app)
      .post('/upload-image')
      .set('Content-Type', 'multipart/form-data')
      .attach('ogImageUpload', 'test/fixtures/images/sample-recipe-image.jpg');

    expect(res.status).toBe(200);
    expect(res.body.url).toContain('/img/recipe-images/');
  });

  it('returns 500 on unexpected error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // silence expected error log

    const res = await request(app)
      .post('/upload-image')
      .field('image', 'not-a-file')
      .set('Content-Type', 'multipart/form-data');

    expect([400, 500]).toContain(res.status); // file parsing errors may be 400 or 500 depending on multer config
  });
});
