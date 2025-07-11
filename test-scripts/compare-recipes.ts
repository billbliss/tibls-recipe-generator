// This script compares local JSON files in the `tibls-starter-recipes` directory
// with the live data fetched from a server.ts endpoint.

// See README.md in the test-scripts directory for more details on how to run/debug this script.

import fs from 'fs/promises';
import path from 'path';
import { createLogger, fetchWithRetry, sleep } from '../utils/core-utils';
import { ResponseMode } from '../types/types';
const { log, error, close } = createLogger('compare-log.txt');

import jsonDiff from 'json-diff';
const { diff } = jsonDiff;

const REQUEST_DELAY_MS = 20000; // Delay between requests (in milliseconds) to avoid rate limiting issues

type TiblsResponse = {
  itemListElement: {
    [key: string]: any;
    urlSource: string;
  }[];
};

const RECIPES_DIR = './test-scripts/tibls-starter-recipes';
const SERVER_URL = 'http://localhost:3000/webhook'; // only works in development mode currently

// Optional list of filenames to process; if populated, only these will be compared
const ONLY_FILES: string[] = [
  'Bang Bang Chicken Salad.json',
  'Baked French Fries (So Crispy!).json'
];

// Normalizes a recipe object by removing metadata and sorting ingredients and steps
// This is useful for comparing recipes without worrying about volatile metadata differences
function normalizeRecipe(recipe: any) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, created, updated, lastCooked, lastQueued, ...rest } = recipe;

  return {
    ...rest,
    ingredients: [...(recipe.ingredients || [])].sort((a, b) => a.text.localeCompare(b.text)),
    steps: [...(recipe.steps || [])].sort((a, b) => a.text.localeCompare(b.text))
  };
}

// Retrieves a local JSON file from the `tibls-starter-recipes` directory
// and parses it into a JavaScript object.
async function getLocalJson(filename: string) {
  const filePath = path.join(RECIPES_DIR, filename);
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function fetchServerJson(url: string): Promise<TiblsResponse> {
  const response = await fetchWithRetry(SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ input: url, responseMode: ResponseMode.JSON })
  });
  return (await response.data) as TiblsResponse;
}

async function compareJsonFiles() {
  const files = await fs.readdir(RECIPES_DIR);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  for (const file of jsonFiles) {
    if (ONLY_FILES.length > 0 && !ONLY_FILES.includes(file)) {
      log(`⏭ Skipping ${file} — not in ONLY_FILES`);
      continue;
    }
    log(`\n🔍 Comparing: ${file}`);
    try {
      const local = await getLocalJson(file);
      const url = local.itemListElement?.[0]?.urlSource;
      if (!url) {
        console.warn(`⚠️ No urlSource found in ${file}`);
        continue;
      }

      log(`🌐 Fetching live recipe for ${url}`);
      const live = await fetchServerJson(url);
      log(`✅ Successfully fetched live recipe for ${url}`);
      await sleep(REQUEST_DELAY_MS); // Wait the specified amount to avoid rate limiting issues when retrieving recipe URLs

      const localRecipe = local.itemListElement[0];
      const liveRecipe = live.itemListElement[0];

      log(`🔍 Comparing normalized recipes...`);
      // Normalize both recipes to remove metadata and sort ingredients/steps before comparison
      const recipeDiff = diff(normalizeRecipe(localRecipe), normalizeRecipe(liveRecipe));

      if (!recipeDiff) {
        log('✅ No differences found.');
      } else {
        log('❗ Differences:');
        log(typeof recipeDiff === 'string' ? recipeDiff : JSON.stringify(recipeDiff, null, 2));
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        log(`❌ Exception during comparison of ${file}: ${err.message}`);
        error(`❌ Error comparing ${file}:`, err.message);
      } else {
        log(`❌ Unknown error during comparison of ${file}: ${String(err)}`);
        error(`❌ Unknown error comparing ${file}:`, err);
      }
    }
  }
}

// Main function to run the comparison
// This is the entry point of the script
// It initializes the logger and calls the comparison function
// It also handles any errors that occur during the comparison process
// Finally, it closes the logger stream to ensure all logs are written
async function main() {
  try {
    await compareJsonFiles();
  } catch (err) {
    error('Fatal error:', err);
  } finally {
    close(); // Close the logger stream when done
  }
}

main();
