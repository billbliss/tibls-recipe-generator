import fs from 'fs';
import { resolveFromRoot } from '../utils/file-utils';
import { RecipeRecord } from '../types/recipeStoreTypes';

export function renderViewerHtml(recipes: RecipeRecord[]): string {
  const template = fs.readFileSync(resolveFromRoot('public', 'viewer.html'), 'utf8');

  // Sort recipes by date (newest first)
  const sortedRecipes = [...recipes].sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });

  const indexLinks = sortedRecipes
    .filter((r) => r.name)
    .map((r, idx) => `<li><a href="#recipe-${idx}">${r.name}</a> (${r.date || 'Unknown'})</li>`)
    .join('');

  const rows = sortedRecipes
    .filter((r) => r.name || r.description || r.tiblsUrl || r.rawJsonUrl || r.ogImageUrl)
    .map(
      (r, idx) => `
        <div class="recipe-card" id="recipe-${idx}" data-filename="${r.filename}">
          <div class="recipe-field">
            <div class="image-wrapper">
              <div class="image-container">
                ${
                  r.ogImageUrl
                    ? `<img class="thumbnail" src="${r.ogImageUrl}" alt="${r.name} image" />`
                    : `<img class="thumbnail default-img" src="/img/default-image.jpg" alt="Default recipe image" />`
                }
                <button class="edit-button" aria-label="Edit">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="white" viewBox="0 0 24 24">
                    <path d="M3 17.25V21h3.75l11.06-11.06-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41L18.37 3.29a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div class="recipe-field"><span class="label">Recipe Name</span>${r.name}</div>
          ${r.description ? `<div class="recipe-field"><span class="label">Summary</span>${r.description}</div>` : ''}
          <div class="recipe-field"><span class="label">Date</span>${r.date || 'Unknown'}</div>
          <div class="recipe-field">
            <button class="import-button" onclick="window.location.href='${r.tiblsUrl}'">Tibls Import</button><br>
            <a href="${r.rawJsonUrl}">Raw JSON</a>
          </div>
        </div>
      `
    )
    .join('');

  const recipeDirectory = `
    <div class="recipe-directory">
      <h2>Recipe Index<button id="sort-toggle" class="sort-button">Sort by Date</button></h2>
      <ul id="recipe-index">
        ${indexLinks}
      </ul>
    </div>
  `;

  return template.replace(
    '{{TABLE_ROWS}}',
    recipeDirectory + `<div class="recipe-list">${rows}</div>`
  );
}
