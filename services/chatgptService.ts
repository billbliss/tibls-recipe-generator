import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../utils/core-utils';
import { resolveFromRoot, generateRecipeFilename } from '../utils/file-utils';
import { applyPerServingCaloriesOverride, enforcePerServingCalories } from '../utils/recipe-utils';
import { RecipeFocusMode, TiblsRecipeEnvelope } from '../types/types';
import sharp from 'sharp';

import tiblsSchemaJson from '../prompts/tibls-schema.json';
const tiblsSchema = tiblsSchemaJson;
const tiblsPrompt = fs.readFileSync(resolveFromRoot('prompts', 'chatgpt-instructions.md'), 'utf8');

const { log, error } = createLogger('chatgptService-log.txt');

function injectOgImageUrlIfMissing(tiblsJson: TiblsRecipeEnvelope, ogImageUrl?: string): void {
  if (ogImageUrl && tiblsJson?.itemListElement?.[0] && !tiblsJson.itemListElement[0].ogImageUrl) {
    tiblsJson.itemListElement[0].ogImageUrl = ogImageUrl;
  }
}

function buildChatPayload({
  textInput,
  imageInputs = [],
  dynamicPrompt,
  focusMode
}: {
  textInput: string;
  imageInputs?: Buffer[];
  dynamicPrompt: string;
  focusMode: RecipeFocusMode;
}): any {
  const content: any[] = [];

  if (textInput) {
    content.push({ type: 'text', text: textInput });
  }

  if (imageInputs && imageInputs.length > 0) {
    for (const image of imageInputs) {
      const base64Image = image.toString('base64');
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${base64Image}`
        }
      });
    }
  }

  const messages: any[] = [];
  if (focusMode === RecipeFocusMode.RECIPE) {
    messages.push({ role: 'system', content: tiblsPrompt });
  }
  messages.push({ role: 'user', content: dynamicPrompt });
  messages.push({ role: 'user', content: content });

  const chatPayload: any = {
    model: 'gpt-4o',
    temperature: 0.3,
    messages
  };

  if (focusMode === RecipeFocusMode.RECIPE) {
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

  return chatPayload;
}

async function callOpenAIChatCompletion(chatPayload: any): Promise<any> {
  const openaiRes = await axios.post('https://api.openai.com/v1/chat/completions', chatPayload, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  return openaiRes;
}

async function extractIngredientsOnlyWithMetadata(
  textInput: string,
  imageInputs: Buffer[]
): Promise<{ text: string }> {
  let dynamicPrompt = `You are ONLY extracting the list of ingredients.
    Respond with a JSON object like this:
    {
      "text": "...ingredient list here..."
    }
    - "text" must contain ONLY the ingredients you see, each on its own line, in the exact wording and order as written.
    - Do NOT include instructions, narrative text, serving sizes, headings, or explanations.
    - Do NOT include any explanatory text or formatting.`;

  const chatPayload = buildChatPayload({
    textInput,
    imageInputs,
    dynamicPrompt,
    focusMode: RecipeFocusMode.INGREDIENTS
  });

  const openaiRes = await callOpenAIChatCompletion(chatPayload);

  let raw = openaiRes.data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error('No ingredients returned from OpenAI');

  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) raw = fenced[1].trim();

  try {
    const parsed = JSON.parse(raw);
    if (parsed.text) return parsed;
  } catch {
    // fallback
  }

  return { text: raw };
}

export async function processImageRecipe(textInput: string, images: Buffer[] = []): Promise<any> {
  // Auto-rotate, resize, and compress images for optimal ChatGPT input
  const normalizedImages: Buffer[] = [];
  for (let i = 0; i < images.length; i++) {
    const resized = await sharp(images[i].buffer)
      .rotate()
      .resize({ width: 1024 }) // downscale to 1024px width
      .jpeg({ quality: 80 }) // compress to reasonable size
      .toBuffer();
    normalizedImages.push(resized);
  }

  // Pass 1: extract ingredients only
  const { text: rawIngredients } = await extractIngredientsOnlyWithMetadata(
    textInput,
    normalizedImages
  );

  // Embed the extracted ingredients into the second pass prompt
  const injectedPrompt = `Here is the exact ingredient list extracted verbatim from the recipe images:
    ${rawIngredients}
    Do NOT alter, add, or remove any ingredients. Use this exact list when creating the Tibls JSON.
    Now here is the full recipe text for context:
    ${textInput}`;

  // Pass 2: build the final Tibls JSON using the injected ingredients
  const finalResult = await processRecipeWithChatGPT(injectedPrompt, undefined, normalizedImages);

  // ✅ Only return the final JSON, not the first-pass text
  return finalResult;
}

export async function processRecipeWithChatGPT(
  textInput: string,
  ogImageUrl?: string,
  imageInputs?: Buffer[]
): Promise<TiblsRecipeEnvelope> {
  let dynamicPrompt = `Extract a single recipe from the provided text.`;

  const chatPayload = buildChatPayload({
    textInput,
    imageInputs,
    dynamicPrompt,
    focusMode: RecipeFocusMode.RECIPE
  });

  // Validate required keys
  if (!process.env.OPENAI_API_KEY) throw new Error('Missing OpenAI API key');

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

  const openaiRes = await callOpenAIChatCompletion(chatPayload);

  const toolCall = openaiRes.data.choices?.[0]?.message?.tool_calls?.[0];
  const argsString = toolCall?.function?.arguments;
  if (!argsString) throw new Error('No tool call arguments returned from OpenAI');

  const tiblsJson = JSON.parse(argsString);

  // Defer injection of large base64 URLs until after GPT returns, to avoid token bloat
  const isBase64Image = typeof ogImageUrl === 'string' && ogImageUrl.startsWith('data:image/');
  const deferredOgImageUrl = isBase64Image ? ogImageUrl : undefined;

  injectOgImageUrlIfMissing(tiblsJson, deferredOgImageUrl || ogImageUrl);

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

  return tiblsJson;
}
