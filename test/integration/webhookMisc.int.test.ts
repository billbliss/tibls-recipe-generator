import request from 'supertest';
import { app } from '../../server';
import axios from 'axios';
import { describe, it, beforeEach, expect, vi } from 'vitest';

vi.mock('axios');

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
});
