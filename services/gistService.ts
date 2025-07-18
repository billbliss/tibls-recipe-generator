import axios from 'axios';

export interface GistRecipe {
  name: string;
  description: string;
  date: string;
  rawJsonUrl: string;
  tiblsUrl: string;
  ogImageUrl: string;
}

export async function fetchGistRecipes(gistId: string, baseUrl: string): Promise<GistRecipe[]> {
  const response = await axios.get(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json'
    }
  });

  const files = response.data.files;

  return Object.keys(files)
    .filter((filename) => filename.endsWith('.json'))
    .map((filename) => {
      const file = files[filename];
      const rawJsonUrl = `${baseUrl}/gist-file/${filename}`;
      const tiblsUrl = `tibls://tibls.app/import?r=${rawJsonUrl}`;
      let parsed;
      try {
        parsed = JSON.parse(file.content);
      } catch {
        return null; // skip invalid JSON file
      }

      const recipe = parsed?.itemListElement?.[0] || {};
      const name = recipe.name || filename.replace(/\.json$/, '');
      const description = recipe.summary || '';
      const dateMatch = filename.match(/(\d{1,2}-[A-Za-z]+-\d{4})/);
      let date = 'Unknown';
      if (dateMatch) {
        date = dateMatch[1];
      } else {
        const timestamp = parsed?.created || parsed?.updated || recipe.created || recipe.updated;
        if (timestamp) {
          date = new Date(timestamp * 1000).toLocaleDateString('en-US', {
            timeZone: 'UTC',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
        }
      }
      const ogImageUrl = recipe.ogImageUrl || '';

      return { name, description, date, rawJsonUrl, tiblsUrl, ogImageUrl };
    })
    .filter((recipe): recipe is GistRecipe => Boolean(recipe));
}
