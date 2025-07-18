import { describe, it, beforeEach, expect, vi } from 'vitest';

// ✅ Mock before imports
vi.mock('axios');

vi.mock('@google-cloud/vision', () => ({
  __esModule: true,
  default: {
    ImageAnnotatorClient: vi.fn(() => ({
      textDetection: vi.fn().mockResolvedValue([{ textAnnotations: [] }])
    }))
  }
}));

import { app } from '../../server';

import request from 'supertest';

describe('POST /webhook with image uploads - empty OCR case', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.OPENAI_API_KEY = 'fake-key';
  });

  it('returns 500 if OCR finds no text', async () => {
    const res = await request(app)
      .post('/webhook')
      .attach('filename', 'test/fixtures/images/sample-recipe-image.jpg', {
        contentType: 'image/jpeg'
      })
      .field('responseMode', 'json');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/No text detected in the provided image/);
  });
});
