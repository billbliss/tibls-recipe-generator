import request from 'supertest';
import { app } from '../../server';
import axios from 'axios';
import * as imageService from '../../services/imageService';
import { describe, it, beforeEach, expect, vi } from 'vitest';

// Mock OpenAI + handleImageFormat
vi.mock('axios');
vi.mock('../../services/imageService', () => ({
  handleImageFormat: vi.fn().mockResolvedValue(undefined)
}));

describe('POST /webhook triggers ChatGPT processing', () => {
  const fakeToolArgs = {
    itemListElement: [
      {
        name: 'Integration Test Recipe',
        servings: 4,
        ingredients: [],
        steps: []
      }
    ]
  };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.OPENAI_API_KEY = 'fake-key';
    process.env.GITHUB_TOKEN = 'fake-gh-token';
    process.env.GIST_ID = 'fake-gist';
  });

  it('processes TEXT input fully and returns Tibls JSON', async () => {
    // Mock OpenAI chat completion
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

    const res = await request(app)
      .post('/webhook')
      .field('input', 'This is a plain text recipe with 200 kcal per serving')
      .field('responseMode', 'json');

    expect(res.status).toBe(200);
    expect(res.body.itemListElement[0].name).toBe('Integration Test Recipe');
    expect(imageService.handleImageFormat).toHaveBeenCalled();
  });

  it('returns queued viewer URL for ResponseMode.VIEWER', async () => {
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

    (axios.patch as any).mockResolvedValue({ data: {} });

    const res = await request(app)
      .post('/webhook')
      .field('input', 'Viewer mode integration test')
      .field('responseMode', 'viewer');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('queued');
    expect(res.body.viewer).toContain('/gist/fake-gist');
  });

  it('returns 500 if OpenAI returns no tool call arguments', async () => {
    (axios.post as any).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              tool_calls: [] // no args
            }
          }
        ]
      }
    });

    const res = await request(app).post('/webhook').field('input', 'Invalid response test');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/No tool call arguments/);
  });
});
