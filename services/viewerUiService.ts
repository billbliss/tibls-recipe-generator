import fs from 'fs';
import { resolveFromRoot } from '../utils/file-utils';
import { GistRecipe } from './gistService';

export function renderViewerHtml(recipes: GistRecipe[]): string {
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
        <div class="recipe-card" id="recipe-${idx}">
          <div class="recipe-field">${
            r.ogImageUrl
              ? `<img class="thumbnail" src="${r.ogImageUrl}" alt="${r.name} image" />`
              : ''
          }</div>
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
      <h2>Recipe Index</h2>
      <ul>
        ${indexLinks}
      </ul>
    </div>
  `;

  return template.replace(
    '{{TABLE_ROWS}}',
    recipeDirectory + `<div class="recipe-list">${rows}</div>`
  );
}
