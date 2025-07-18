import { load } from 'cheerio';
import { fetchWithRetry, createLogger } from '../utils/core-utils';
import { isLikelyRecipePage } from '../utils/recipe-utils';

const { log } = createLogger('urlService-log.txt');

/**
 * Fetch and process a recipe URL.
 * - Fetches HTML
 * - Extracts JSON-LD if available
 * - Falls back to HTML <head> if needed
 * - Returns assembled input for ChatGPT
 */
export async function handleUrl(recipeUrl: string): Promise<string> {
  const rawHtml = (
    await fetchWithRetry(recipeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (TiblsRecipeLoaderBot; +https://tibls.app)',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
  ).data;

  const $ = load(rawHtml);

  // Extract and filter <head> HTML for minimal relevant content
  let head = $('head').clone();
  let extractedJsonLd: any = null;
  let foundAnyJsonLd = false;

  head.find('script[type="application/ld+json"]').each((_, el) => {
    const scriptContent = $(el).text().trim();
    try {
      const json = JSON.parse(scriptContent);
      foundAnyJsonLd = true;
      const items = Array.isArray(json) ? json : json['@graph'] ? json['@graph'] : [json];

      const recipeItem = items.find((item: Record<string, any>) => {
        const type = item['@type'];
        const isRecipe =
          type === 'Recipe' ||
          (Array.isArray(type) && type.includes('Recipe')) ||
          item.recipeIngredient ||
          item.recipeInstructions;
        return isRecipe;
      });

      if (recipeItem && !extractedJsonLd) {
        extractedJsonLd = recipeItem;
      }

      if (!recipeItem) {
        $(el).remove();
      }
    } catch {
      $(el).remove(); // remove invalid JSON
    }
  });

  head
    .find(['style', 'link[rel="stylesheet"]', 'link[rel*="icon"]', 'link[rel*="pre"]'].join(','))
    .remove();

  const headHtml = head.html() || '';

  const likelyRecipePage = isLikelyRecipePage(extractedJsonLd, $('title').text(), headHtml);

  // Only throw if there's no JSON-LD at all AND it's not likely a recipe page
  if (!foundAnyJsonLd && !likelyRecipePage) {
    throw new Error(
      'This page does not appear to contain a recipe or recognizable cooking content.'
    );
  }

  if (extractedJsonLd) {
    return `This page contains valid Schema.org JSON-LD recipe data. Use it as the authoritative source for ingredients. Do not modify them.

      URL: ${recipeUrl}

      Extracted JSON-LD:
      ${JSON.stringify(extractedJsonLd, null, 2)}

      ---

      Fallback HTML <head> metadata (only for summary, missing field(s), or context use):
      ${headHtml}`;
  } else {
    log('📎 Fallback mode: No valid JSON-LD recipe found. Prompting model to parse HTML.');
    return `HTML metadata for ${recipeUrl}:
      ${headHtml}

      ---

      Please fetch and parse the full recipe from the above URL.`;
  }
}
