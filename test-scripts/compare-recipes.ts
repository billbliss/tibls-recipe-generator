// This script compares local JSON files in the `tibls-starter-recipes` directory
// with the live data fetched from a server.ts endpoint.

// To run, type this command in terminal: 'npx ts-node test-scripts/compare-recipes.ts'

// Debugging this script is tricky without some launch.json magic.
// Here's the configs to add to launch.json that makes it easy:

  //   {
  //     "type": "node",
  //     "request": "launch",
  //     "name": "Debug compiled dist/server.js",
  //     "program": "${workspaceFolder}/dist/server.js",
  //     "preLaunchTask": "tsc: build - tsconfig.json",
  //     "cwd": "${workspaceFolder}",
  //     "envFile": "${workspaceFolder}/.env",
  //     "outFiles": ["${workspaceFolder}/dist/**/*.js"],
  //     "console": "integratedTerminal",
  //     "skipFiles": ["<node_internals>/**"]
  //   },
  //   {
  //     "type": "node",
  //     "request": "launch",
  //     "name": "Debug compare-recipes.ts",
  //     "runtimeArgs": ["-r", "ts-node/register"],
  //     "args": ["${workspaceFolder}/test-scripts/compare-recipes.ts"],
  //     "cwd": "${workspaceFolder}",
  //     "preLaunchTask": "wait-for-server",
  //     "skipFiles": ["<node_internals>/**"],
  //     "console": "integratedTerminal"
  //   }
  // ],
  // "compounds": [
  //   {
  //     "name": "Debug Server + Compare Recipes",
  //     "configurations": ["Debug with ts-node-dev", "Debug compare-recipes.ts"]
  //   }

  // You also need a .vscode/tasks.json file with the following content:

  //   {
  //   "version": "2.0.0",
  //   "tasks": [
  //     {
  //       "label": "wait-for-server",
  //       "type": "shell",
  //       "command": "sleep",
  //       "args": ["3"],
  //       "problemMatcher": []
  //     }
  //   ]
  // }

import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { diff } from 'json-diff'; // user-friendly output; could also use 'fast-json-patch' or 'deep-diff'
import { createLogger, fetchWithRetry } from '../utils/utility-functions';
const { log, error, close } = createLogger('compare-log.txt');

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
  "Bang Bang Chicken Salad.json",
  "Baked French Fries (So Crispy!).json"
];

// Utility function to pause execution for a given number of milliseconds
// This is useful for rate limiting or waiting for server responses
// Example: await sleep(1000); // pauses for 1 second
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Normalizes a recipe object by removing metadata and sorting ingredients and steps
// This is useful for comparing recipes without worrying about volatile metadata differences
function normalizeRecipe(recipe: any) {
  const { id, created, updated, lastCooked, lastQueued, ...rest } = recipe;

  return {
    ...rest,
    ingredients: [...(recipe.ingredients || [])].sort((a, b) =>
      a.text.localeCompare(b.text)
    ),
    steps: [...(recipe.steps || [])].sort((a, b) =>
      a.text.localeCompare(b.text)
    ),
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
    data: JSON.stringify({ input: url, testMode: true })
  });
  return await response.data as TiblsResponse;
}

async function compareJsonFiles() {
  const files = await fs.readdir(RECIPES_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

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
      const recipeDiff = diff(
        normalizeRecipe(localRecipe),
        normalizeRecipe(liveRecipe)
      );

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