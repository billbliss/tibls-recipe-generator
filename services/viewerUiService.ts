import fs from 'fs';
import { resolveFromRoot } from '../utils/file-utils';
import { GistRecipe } from './gistService';

export function renderViewerHtml(recipes: GistRecipe[]): string {
  const template = fs.readFileSync(resolveFromRoot('public', 'viewer.html'), 'utf8');

  const rows = recipes
    .filter((r) => r.name || r.description || r.tiblsUrl || r.rawJsonUrl || r.ogImageUrl)
    .map(
      (r) => `
        <div class="recipe-card">
          <div class="recipe-field">${
            r.ogImageUrl
              ? `<img class="thumbnail" src="${r.ogImageUrl}" alt="${r.name} image" />`
              : ''
          }</div>
          <div class="recipe-field"><span class="label">Recipe Name</span>${r.name}</div>
          ${r.description ? `<div class="recipe-field"><span class="label">Summary</span>${r.description}</div>` : ''}
          <div class="recipe-field"><span class="label">Date</span>${r.date || 'Unknown'}</div>
          <div class="recipe-field"><span class="label">Import Link</span>
            <a href="${r.tiblsUrl}">Import</a><br>
            <a href="${r.rawJsonUrl}">Raw JSON</a>
          </div>
        </div>
      `
    )
    .join('');

  return template.replace('{{TABLE_ROWS}}', `<div class="recipe-list">${rows}</div>`);
}
