import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processRecipeWithChatGPT, processImageRecipe } from '../chatgptService';
import * as imageService from '../imageService';
import axios from 'axios';

// Mock axios and handleImageFormat
vi.mock('axios');
vi.mock('../imageService', () => ({
  handleImageFormat: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('sharp', () => {
  return {
    default: () => ({
      rotate: () => ({
        toBuffer: async () => Buffer.from('mock-image-buffer')
      })
    })
  };
});

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
      'url',
      []
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
      'url',
      []
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
      'url',
      []
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

    await expect(
      processRecipeWithChatGPT('Bad data', 'json' as any, baseUrl, undefined, undefined, [])
    ).rejects.toThrow('No tool call arguments returned from OpenAI');
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

    await expect(
      processRecipeWithChatGPT('some text', 'bogus' as any, baseUrl, undefined, undefined, [])
    ).rejects.toThrow('Unsupported responseMode');
  });
});

/**
 * processImageRecipe makes TWO sequential GPT calls for IMAGE input:
 *  1. INGREDIENTS_ONLY pass -> plain text list of ingredients
 *  2. RECIPE pass -> full Tibls JSON using the extracted ingredients
 *
 * To test this correctly:
 *  - axios.post must be mocked TWICE using chained .mockResolvedValueOnce calls
 *  - Each test needs vi.resetAllMocks() in beforeEach() to avoid bleedover between tests
 *
 * This ensures that:
 *  - First mock simulates GPT returning only ingredient text
 *  - Second mock simulates GPT returning valid Tibls JSON
 *
 * Any mismatch or forgotten reset can cause later tests to see stale mock data.
 */
describe('processImageRecipe', () => {
  const baseUrl = 'http://localhost:3000';
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('performs two GPT calls (INGREDIENTS_ONLY then RECIPE) and returns Tibls JSON', async () => {
    // Mock first GPT call (INGREDIENTS_ONLY) to return a plain ingredient list
    (axios.post as any)
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: '1 cup flour\n2 eggs'
              }
            }
          ]
        }
      })
      // Mock second GPT call (RECIPE) to return Tibls JSON
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      arguments: JSON.stringify({
                        itemListElement: [
                          {
                            name: 'Two-Pass Image Recipe',
                            ingredients: [
                              { text: '1 cup flour', sectionHeader: 'Dough' },
                              { text: '2 eggs', sectionHeader: '' }
                            ],
                            steps: [
                              { text: 'Mix flour and eggs.', sectionHeader: 'Prep' },
                              { text: 'Bake for 20 minutes.', sectionHeader: 'Bake' }
                            ]
                          }
                        ]
                      })
                    }
                  }
                ]
              }
            }
          ]
        }
      });

    const imageBuffers = [Buffer.from('fake-image-data')];

    const result = await processImageRecipe(
      '',
      'json' as any,
      baseUrl,
      undefined,
      'image',
      imageBuffers
    );

    expect(result.itemListElement[0].name).toBe('Two-Pass Image Recipe');
    expect(result.itemListElement[0].ingredients.length).toBe(2);
    expect(result.itemListElement[0].steps.length).toBe(2);
  });

  it('continues to second GPT call even if first pass (INGREDIENTS_ONLY) returns empty', async () => {
    // First GPT call returns empty
    (axios.post as any)
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: ''
              }
            }
          ]
        }
      })
      // Second GPT call still returns valid Tibls JSON
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      arguments: JSON.stringify({
                        itemListElement: [
                          {
                            name: 'Fallback Recipe',
                            ingredients: [
                              { text: '1 cup fallback flour', sectionHeader: 'Fallback' }
                            ],
                            steps: [{ text: 'Fallback step.', sectionHeader: 'Fallback' }]
                          }
                        ]
                      })
                    }
                  }
                ]
              }
            }
          ]
        }
      });

    await expect(
      processImageRecipe('', 'json' as any, baseUrl, undefined, 'image', [
        Buffer.from('fake-image-data')
      ])
    ).rejects.toThrow('No ingredients returned from OpenAI');
  });

  it('throws an error if second GPT call returns malformed JSON', async () => {
    // First GPT call returns ingredients
    (axios.post as any)
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: '1 cup flour\n2 eggs'
              }
            }
          ]
        }
      })
      // Second GPT call returns invalid JSON
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      arguments: 'not-valid-json'
                    }
                  }
                ]
              }
            }
          ]
        }
      });

    await expect(
      processImageRecipe('', 'json' as any, baseUrl, undefined, 'image', [
        Buffer.from('fake-image-data')
      ])
    ).rejects.toThrow();
  });

  it('concatenates OCR text from multiple image buffers before GPT calls', async () => {
    // First GPT call returns combined plain ingredients
    (axios.post as any)
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: 'from-image-1\nfrom-image-2'
              }
            }
          ]
        }
      })
      // Second GPT call returns valid Tibls JSON
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      arguments: JSON.stringify({
                        itemListElement: [
                          {
                            name: 'Multi-Image Recipe',
                            ingredients: [
                              { text: 'from-image-1', sectionHeader: 'Img1' },
                              { text: 'from-image-2', sectionHeader: 'Img2' }
                            ],
                            steps: [{ text: 'Combined steps.', sectionHeader: 'Steps' }]
                          }
                        ]
                      })
                    }
                  }
                ]
              }
            }
          ]
        }
      });

    const imageBuffers = [Buffer.from('fake-image-1'), Buffer.from('fake-image-2')];

    const result = await processImageRecipe(
      '',
      'json' as any,
      baseUrl,
      undefined,
      'image',
      imageBuffers
    );

    expect(result.itemListElement[0].name).toBe('Multi-Image Recipe');
    expect(result.itemListElement[0].ingredients.length).toBe(2);
  });
});
