import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../utils/core-utils';
import { resolveFromRoot, generateRecipeFilename } from '../utils/file-utils';
import { applyPerServingCaloriesOverride, enforcePerServingCalories } from '../utils/recipe-utils';
import { ResponseMode, RecipeFocusMode } from '../types/types';
import { handleImageFormat } from './imageService';
import sharp from 'sharp';

import tiblsSchemaJson from '../prompts/tibls-schema.json';
const tiblsSchema = tiblsSchemaJson;
const tiblsPrompt = fs.readFileSync(resolveFromRoot('prompts', 'chatgpt-instructions.md'), 'utf8');

const { log, error } = createLogger('chatgptService-log.txt');

export async function processImageRecipe(
  textInput: string,
  responseMode: ResponseMode,
  baseUrl: string,
  ogImageUrl?: string,
  imageFormat?: string,
  images: Buffer[] = []
): Promise<any> {
  // Auto-rotate based on EXIF and return a buffer (want to ensure images are sent to ChatGPT right-side-up)
  const normalizedImages = await Promise.all(
    images.map(async (img) => {
      return await sharp(img.buffer).rotate().toBuffer();
    })
  );

  // Pass 1: extract ingredients only
  const rawIngredients = await processRecipeWithChatGPT(
    textInput,
    ResponseMode.INGREDIENTS_ONLY,
    baseUrl,
    ogImageUrl,
    imageFormat,
    normalizedImages,
    RecipeFocusMode.INGREDIENTS
  );

  // log(`Extracted raw ingredients from first pass:\n${rawIngredients}`);

  // Embed the extracted ingredients into the second pass prompt
  const injectedPrompt = `Here is the exact ingredient list extracted verbatim from the recipe images:
    ${rawIngredients}
    Do NOT alter, add, or remove any ingredients. Use this exact list when creating the Tibls JSON.
    Now here is the full recipe text for context:
    ${textInput}`;

  // Pass 2: build the final Tibls JSON using the injected ingredients
  const finalResult = await processRecipeWithChatGPT(
    injectedPrompt,
    responseMode,
    baseUrl,
    ogImageUrl,
    undefined,
    normalizedImages,
    RecipeFocusMode.RECIPE
  );

  // ✅ Only return the final JSON, not the first-pass text
  return finalResult;
}

export async function processRecipeWithChatGPT(
  textInput: string,
  responseMode: ResponseMode,
  baseUrl: string,
  ogImageUrl?: string,
  imageFormat?: string,
  imageInputs?: Buffer[],
  focusMode?: RecipeFocusMode
): Promise<any> {
  // Construct the array of content to be submitted to the ChatGPT API
  const normalizedFocus = focusMode ?? RecipeFocusMode.RECIPE;
  const content: any[] = [];

  // Include text input if there is any
  if (textInput && typeof textInput === 'string') {
    content.push({ type: 'text', text: textInput });
  }
  // Include images if there are any
  if (imageInputs && imageInputs.length > 0) {
    for (const buf of imageInputs) {
      const base64Image = buf.toString('base64');
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${base64Image}` }
      });
    }
  }

  let dynamicPrompt = '';

  if (normalizedFocus === RecipeFocusMode.INGREDIENTS) {
    dynamicPrompt = `You are looking ONLY for a list of recipe ingredients.
      Return EXACTLY the ingredients you see, each on its own line, in the same wording and order as written.
      - Do NOT include instructions, narrative text, serving sizes, headings, or explanations.
      - Do NOT summarize or reformat.
      - If no ingredients are visible, return an empty string.
      - Do NOT include any other text before or after the list.`;
  } else {
    // existing behavior
    if (imageInputs?.length && textInput) {
      dynamicPrompt = `Attached are ${imageInputs.length} image(s) of the same recipe along with text. Merge all visible and textual information into one single recipe.`;
    } else if (imageInputs?.length) {
      dynamicPrompt = `Attached are ${imageInputs.length} image(s) of the same recipe. Extract and combine all visible information into one single recipe.`;
    } else {
      dynamicPrompt = `Extract a single recipe from the provided text.`;
    }
  }

  const messages: any[] = [];

  // Only include tiblsPrompt for full RECIPE mode
  if (normalizedFocus === RecipeFocusMode.RECIPE) {
    messages.push({ role: 'system', content: tiblsPrompt });
  }

  messages.push({ role: 'user', content: dynamicPrompt });
  messages.push({ role: 'user', content: content });

  const chatPayload: any = {
    model: 'gpt-4o',
    temperature: 0.3,
    messages
  };

  // Only include function tools for full RECIPE mode
  if (responseMode !== ResponseMode.INGREDIENTS_ONLY) {
    chatPayload.tools = [
      {
        type: 'function',
        function: {
          name: 'tiblsRecipe',
          description: 'Return a Tibls JSON object parsed from the input',
          parameters: tiblsSchema
        }
      }
    ];
    chatPayload.tool_choice = { type: 'function', function: { name: 'tiblsRecipe' } };
  }

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

  // If we're just extracting ingredients, return the raw text content
  if (responseMode === ResponseMode.INGREDIENTS_ONLY) {
    const rawIngredients = openaiRes.data.choices?.[0]?.message?.content?.trim();
    if (!rawIngredients) throw new Error('No ingredients returned from OpenAI');
    return rawIngredients;
  }

  const toolCall = openaiRes.data.choices?.[0]?.message?.tool_calls?.[0];
  const argsString = toolCall?.function?.arguments;
  if (!argsString) throw new Error('No tool call arguments returned from OpenAI');

  const tiblsJson = JSON.parse(argsString);

  // Inject ogImageUrl if provided
  if (ogImageUrl && tiblsJson?.itemListElement?.[0] && !tiblsJson.itemListElement[0].ogImageUrl) {
    tiblsJson.itemListElement[0].ogImageUrl = ogImageUrl;
  }

  // ✅ Always ensure at least one element exists, but don’t force ogImageUrl=null
  if (!tiblsJson.itemListElement || tiblsJson.itemListElement.length === 0) {
    tiblsJson.itemListElement = [{}];
  }

  // Calories override (only performed when there's text input)
  const recipe = tiblsJson?.itemListElement?.[0];
  if (recipe?.servings && typeof recipe.servings === 'number' && typeof textInput === 'string') {
    const ambiguous = /less\s+than|approximately|about|~|under/i.test(textInput);
    const match = textInput.match(/\b(\d{2,4})\s*(?:kcal|calories?)\s*(?:per\s+serving|each)\b/i);
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
