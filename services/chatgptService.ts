import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../utils/core-utils';
import { resolveFromRoot, generateRecipeFilename } from '../utils/file-utils';
import { applyPerServingCaloriesOverride, enforcePerServingCalories } from '../utils/recipe-utils';
import { ResponseMode } from '../types/types';
import { handleImageFormat } from './imageService';

import tiblsSchemaJson from '../prompts/tibls-schema.json';
const tiblsSchema = tiblsSchemaJson;
const tiblsPrompt = fs.readFileSync(resolveFromRoot('prompts', 'chatgpt-instructions.md'), 'utf8');

const { log, error } = createLogger('chatgptService-log.txt');

export async function processRecipeWithChatGPT(
  input: string,
  responseMode: ResponseMode,
  baseUrl: string,
  ogImageUrl?: string,
  imageFormat?: string
): Promise<any> {
  const chatPayload = {
    model: 'gpt-4o',
    temperature: 0.3,
    tools: [
      {
        type: 'function',
        function: {
          name: 'tiblsRecipe',
          description: 'Return a Tibls JSON object parsed from the input',
          parameters: tiblsSchema
        }
      }
    ],
    tool_choice: { type: 'function', function: { name: 'tiblsRecipe' } },
    messages: [
      { role: 'system', content: tiblsPrompt },
      { role: 'user', content: [{ type: 'text', text: input }] }
    ]
  };

  // Validate required keys
  if (!process.env.OPENAI_API_KEY) throw new Error('Missing OpenAI API key');
  if (responseMode === ResponseMode.VIEWER && (!process.env.GITHUB_TOKEN || !process.env.GIST_ID)) {
    throw new Error('Missing GitHub token or Gist ID for viewer mode');
  }

  // Optional debug payload save
  if (process.env.GENERATE_CHATGPT_DEBUG_DATA === 'true') {
    try {
      const debugDir = resolveFromRoot('debug', 'chatgpt');
      fs.mkdirSync(debugDir, { recursive: true });
      const payloadPath = path.join(debugDir, `chatPayload-${Date.now()}.json`);
      fs.writeFileSync(payloadPath, JSON.stringify(chatPayload, null, 2), 'utf8');
      log(`Chat payload written to ${payloadPath}`);
    } catch (err) {
      error('Failed to write chatPayload:', err);
    }
  }

  // Call OpenAI API
  const openaiRes = await axios.post('https://api.openai.com/v1/chat/completions', chatPayload, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  const toolCall = openaiRes.data.choices?.[0]?.message?.tool_calls?.[0];
  const argsString = toolCall?.function?.arguments;
  if (!argsString) throw new Error('No tool call arguments returned from OpenAI');

  const tiblsJson = JSON.parse(argsString);

  // Inject ogImageUrl if provided
  if (ogImageUrl && tiblsJson?.itemListElement?.[0] && !tiblsJson.itemListElement[0].ogImageUrl) {
    tiblsJson.itemListElement[0].ogImageUrl = ogImageUrl;
  }

  // ✅ Always ensure at least one element and normalize ogImageUrl
  if (!tiblsJson.itemListElement || tiblsJson.itemListElement.length === 0) {
    tiblsJson.itemListElement = [{ ogImageUrl: null }];
  } else if (tiblsJson.itemListElement[0].ogImageUrl === undefined) {
    tiblsJson.itemListElement[0].ogImageUrl = null;
  }

  // Calories override
  const recipe = tiblsJson?.itemListElement?.[0];
  if (recipe?.servings && typeof recipe.servings === 'number') {
    const ambiguous = /less\s+than|approximately|about|~|under/i.test(input);
    const match = input.match(/\b(\d{2,4})\s*(?:kcal|calories?)\s*(?:per\s+serving|each)\b/i);
    if (!ambiguous && match) {
      const perServingCalories = parseInt(match[1], 10);
      if (!isNaN(perServingCalories)) {
        applyPerServingCaloriesOverride(tiblsJson, perServingCalories, recipe.servings);
      }
    }
  }
  enforcePerServingCalories(tiblsJson);

  // Optional debug response save
  if (process.env.GENERATE_CHATGPT_DEBUG_DATA === 'true') {
    try {
      const outPath = path.join(
        resolveFromRoot('debug', 'chatgpt'),
        `${generateRecipeFilename(tiblsJson, false)}-chatGPT-response.json`
      );
      fs.writeFileSync(outPath, JSON.stringify(openaiRes.data, null, 2), 'utf8');
      log(`Test data written to ${outPath}`);
    } catch (err) {
      error('Failed to write test data:', err);
    }
  }

  // Format ogImageUrl if needed
  await handleImageFormat(tiblsJson, imageFormat || 'url');

  // Handle response modes
  if (responseMode === ResponseMode.JSON) {
    return tiblsJson;
  }

  if (responseMode === ResponseMode.VIEWER) {
    // In test mode, skip saving to GitHub
    if (process.env.NODE_ENV === 'test') {
      console.log('[TEST MODE] Skipping GitHub Gist save');
      return { status: 'queued', viewer: `${baseUrl}/gist/fake-gist` };
    }

    const filename = `${generateRecipeFilename(tiblsJson)}.json`;
    const gistId = process.env.GIST_ID;
    const gistPayload = {
      files: { [filename]: { content: JSON.stringify(tiblsJson, null, 2) } }
    };

    await axios.patch(`https://api.github.com/gists/${gistId}`, gistPayload, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Tibls-Webhook-Handler'
      }
    });

    const viewerUrl = `${baseUrl}/gist/${gistId}`;
    return { status: 'queued', viewer: viewerUrl };
  }

  throw new Error(`Unsupported responseMode: ${responseMode}`);
}
