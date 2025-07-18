import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processRecipeWithChatGPT } from '../chatgptService';
import * as imageService from '../imageService';
import axios from 'axios';

// Mock axios and handleImageFormat
vi.mock('axios');
vi.mock('../imageService', () => ({
  handleImageFormat: vi.fn().mockResolvedValue(undefined)
}));

describe('processRecipeWithChatGPT', () => {
  const baseUrl = 'http://localhost:3000';
  const fakeToolArgs = {
    itemListElement: [
      {
        name: 'Test Recipe',
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

  it('returns parsed Tibls JSON for ResponseMode.JSON', async () => {
    // Mock OpenAI response
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

    const result = await processRecipeWithChatGPT(
      'Some valid recipe text with 300 kcal per serving',
      'json' as any,
      baseUrl,
      undefined,
      'url'
    );

    expect(result.itemListElement[0].name).toBe('Test Recipe');
    expect(result.itemListElement[0].servings).toBe(4);
    expect(imageService.handleImageFormat).toHaveBeenCalled();
  });

  it('injects ogImageUrl if provided', async () => {
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

    const result = await processRecipeWithChatGPT(
      'Some recipe',
      'json' as any,
      baseUrl,
      'http://example.com/image.jpg',
      'url'
    );

    expect(result.itemListElement[0].ogImageUrl).toBe('http://example.com/image.jpg');
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

    // Mock axios.patch for Gist
    (axios.patch as any).mockResolvedValue({ data: {} });

    const result = await processRecipeWithChatGPT(
      'Viewer mode recipe text',
      'viewer' as any,
      baseUrl,
      undefined,
      'url'
    );

    expect(result.status).toBe('queued');
    expect(result.viewer).toContain('/gist/fake-gist');
  });

  it('throws an error if OpenAI returns no tool call arguments', async () => {
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

    await expect(processRecipeWithChatGPT('Bad data', 'json' as any, baseUrl)).rejects.toThrow(
      'No tool call arguments returned from OpenAI'
    );
  });

  it('throws error for unsupported responseMode', async () => {
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

    await expect(processRecipeWithChatGPT('some text', 'bogus' as any, baseUrl)).rejects.toThrow(
      'Unsupported responseMode'
    );
  });
});
