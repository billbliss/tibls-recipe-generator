# 📝 Tibls Recipe Conversion Prompt

Convert any provided recipe (from a URL, PDF, or image) into valid Tibls JSON as described below.

---

## ✅ Required Behavior Summary
- Always extract or generate all required Tibls fields.
- Strictly validate output JSON against the Tibls schema.
- Always include a concise `summary` for each recipe, generated if necessary.
- If any field is missing or unclear, supplement from visible content or generate a suitable value and add a note to `notes[]`.

---

## 📥 Step 1: Source Type Handling

**If given a URL:**
- Extract JSON-LD data (Schema.org `Recipe`) if available. Use it only if it includes a complete and accurate ingredient list and step-by-step instructions.
- If the structured data is incomplete (e.g., missing ingredients, quantities, or steps), ignore it and instead parse the visible recipe content directly from the DOM.
- Prefer `og:image` (or `twitter:image`) as the recipe image if it's a clear food photo; otherwise, heuristically select a main food photo.
- Parse structured data into Tibls JSON, supplementing missing fields from page content or metadata.
- If summary or other required fields are missing, generate them and add a note to `notes[]`.
- Always record whether JSON-LD was used or rejected in a `notes[]` entry.
- The term `urlSource` refers to the original recipe page URL being processed. It should match the URL included in the prompt (e.g., "HTML metadata for https://...") and must be included in the final JSON output.
- When a valid recipe URL is provided (as `urlSource`), always retrieve and parse the full page content — regardless of whether `<head>` metadata is separately provided. Do not assume the `<head>` alone is sufficient.

### 1a: Metadata Extraction from `<head>`

When extracting metadata from a webpage:

- Always parse the `<head>` section in addition to the `<body>`.
- Specifically extract `<meta property="og:image" content="...">`.
  - If present and the `content` value is a valid absolute URL pointing to an image (`.jpg`, `.jpeg`, `.png`, `.webp`), use it as the value of `ogImageUrl`.
  - Do not guess or synthesize `ogImageUrl` based on known domain patterns; only use values explicitly found in the page metadata or structured data.
- If no valid `og:image` tag is found and the JSON-LD data also lacks a valid `"image"` field:
  - Set `ogImageUrl` to `null` or omit it entirely.
  - Add a note to `notes[]`:
    ```json
    { "text": "No og:image or JSON-LD image found; ogImageUrl left unset." }
    ```

If multiple `og:image` tags are present, prefer the first valid one.

This step ensures the image metadata is reliable and prevents hallucinated values from being used.

**If given a PDF or image:**
- Use OCR to extract text if needed.
- Identify and segment: title, ingredients, instructions, time values, servings, and metadata.
- Use a clear photo of the dish as `ogImageUrl` if present.
- Always generate a `summary` (based on visible context or inferred tone) and include it.
- Note any OCR ambiguity, handwritten notes, or extra metadata in `notes[]`.

---

## 🧮 Step 2: Calorie Estimation (Always Include)

Always include a top-level `calories` field.

- If the recipe includes a stated calorie count (in structured data like JSON-LD), use that value as-is. Do not override it with a new estimate.
- Only perform calorie estimation if no calorie value is present in structured data.
- If a calorie estimate is generated, always explain this in `notes[]`.

- If the visible recipe states a per-serving calorie value (e.g., “509 calories per serving”) and the number of servings is known, prefer this over estimating from raw ingredients. Multiply the per-serving value by the number of servings to get the total `calories` value, and explain in `notes[]`.

Example:
```json
{ "text": "Calories per serving stated as 509; multiplied by 8 servings = 4,072 total kcal. Used stated value rather than estimating from raw ingredients." }
```

- If not, estimate total calories using typical values for raw ingredients:
  1. Group by ingredient type (e.g., flour, butter, sugar, eggs).
  2. Estimate based on standard raw ingredient values.
  3. Round to the nearest 100 kcal.
  4. Add a `notes[]` entry summarizing the estimate.

- If an estimate is generated and a valid `servings` value is present, add the per-serving calorie value to `notes[]` for context. Do not divide or override the `calories` field, which should always reflect the total for the full recipe.

Example note:
```json
{ "text": "Estimated total calories ~1,200 kcal; divided by 4 servings = ~300 kcal per serving. Based on typical raw ingredient values; actual values may vary." }
```

- If calorie estimation is not feasible (e.g., fewer than 3 ingredients with measurable quantities or ambiguous unit types):
  - Set `calories: 0` (never use `null`)
  - Add a `notes[]` entry explaining exactly what information was missing that prevented estimation
  - Do not skip estimation solely because some ingredients are missing; use all measurable ones to form a partial estimate when possible

This ensures the `calories` field is always present and explicitly defined.

---

## 📦 Step 3: Tibls JSON Construction

Each recipe object must include:
- `@type`: `"https://tibls.app/types/recipe"`
- `id`: Unique UUID string
- `name`: Recipe title
- `ingredients[]`: Array of ingredient objects
- `steps[]`: Array of step objects
- `summary`: Concise overview (always present)
- `calories`: Always include, even if it's 0

**Optional fields:**  
`urlSource`, `urlHost`, `created`, `updated`, `lastCooked`, `lastQueued`, `cookCount`, `prepTime`, `cookTime`, `totalTime`, `servings`, `ogImageUrl`, `notes[]`

**Notes:**
- If any required field is missing, extract or generate it and explain in `notes[]`.
- If calorie count is missing, estimate it (see Step 3) and add a note.
- Always include a `notes[]` entry for any inferred, estimated, or post-processed value.

---

## 👨‍🍳 Step 4: Ingredient Handling

- **Important:** When JSON-LD is available and complete, ingredients must be used as-is with no substitutions, expansions, or simplification. They are considered ground truth.
  - If the prompt includes `recipeIngredient[]` from a complete JSON-LD block, use it as the authoritative source for `ingredients[]`. Do **not** regenerate, reword, reformat, or cross-check ingredients against the rest of the page. Use the provided `recipeIngredient[]` values *literally and exclusively*.
  - If a valid and complete JSON-LD `Recipe` object is present (with all `recipeIngredient` values and quantities), use it as the authoritative source for `ingredients[]`. Do not regenerate, rewrite, reformat, or substitute ingredient text in any way. Preserve the ingredients exactly as listed in the JSON-LD data. Skip all fallback logic below in this case.
  - Do not reference visible content to revise or validate these ingredients. Do not remove, rephrase, or infer any part of the text. Use the `recipeIngredient[]` array literally and exclusively.

- If JSON-LD is missing or incomplete:
  - Extract every ingredient mentioned anywhere in the recipe, even if it appears only in instructions or narrative text.
  - If a visually structured ingredient list exists in the DOM, treat it as the primary source. Only use JSON-LD if it matches this list exactly.
  - Do not assume all ingredients appear in a dedicated list — capture any mentioned item that contributes flavor, texture, or function.
  - Include ingredients used solely for preparation, such as brushing oil, garlic for rubbing, or finishing garnishes (e.g., flaky salt).
  - Always include flavor base ingredients used to infuse simmering liquids (e.g., onion, celery, carrot, herbs, pancetta), even if strained out.
  - If an ingredient is used in multiple forms (e.g., garlic rubbed and minced), create separate entries for each form.

Once all ingredients are identified:

- Format each entry as:
  ```json
  { "text": "2 cups flour", "sectionHeader": "Dough" }
  ```
- Use the original unit system from the recipe (imperial or metric), with alternate units in parentheses if helpful.
- Set `sectionHeader` for the first ingredient in each logical group; all others should have `""`.
- Maintain exact quantities and units unless the source gives a range (use the lower bound and add a note).
- Do not substitute, summarize, or normalize (e.g., don’t convert “1 cup dried chickpeas” into “1 lb canned”).
- If a substitution is explicitly listed, choose the first form and mention the alternate in `notes[]`.

---

## 🍳 Step 5: Step Handling

When extracting `steps[]`, prioritize full coverage of all preparation, cooking, and assembly actions — even if some are mentioned only in prose or assumed from ingredient usage.

- Do not omit or merge operations; capture each distinct action as its own step.
- Include any step that affects the final dish: brushing, rubbing, soaking, garnishing, straining, resting, etc.
- Include steps for components that are later discarded (e.g., simmering aromatics).

Once all steps are identified:

- Format each as:
  ```json
  { "text": "Bake for 30 minutes at 350°F.", "sectionHeader": "Bake", "time": 1800 }
  ```
- Assign `sectionHeader` to the first step of each logical group; others should have `""`.
- Only include the `time` field for steps with a measurable duration (in seconds).
- For time ranges, use the lower bound and add a `notes[]` entry noting the range.
- If a step includes per-side or flipping instructions, set `time` to the full total, and include `flipTime` (half of `time`, rounded).
- Do not collapse multi-part operations into one step (e.g., “make chickpea puree” should not include soaking, cooking, and blending).
- Preserve order of operations and ensure each step is directly actionable and matches the original tone and structure.

---

## 📝 Notes

Always include notes for:
- JSON-LD usage and post-processing
- Timing ranges or approximations
- OCR or image scanning
- Calorie estimation (if performed)
- Any inferred, estimated, or supplemented field

Example:
```json
"notes": [
  { "text": "Summary inferred from page content as none was provided." },
  { "text": "Time range of 35–45 minutes given; used 35 minutes." }
]
```

---

## ✅ Final Validation

- Ensure all required fields are present and valid per the Tibls JSON Schema.
- Do not include `"time"` in a step unless it is meaningful.
- All time fields: `prepTime`, `cookTime`, and `totalTime` in minutes (integers); step `time`/`flipTime` in seconds (integers).
- No `null`, `undefined`, or placeholder values.
- If any value is generated or inferred, explain in `notes[]`.
- Output must be strictly valid JSON and fully conform to the schema.
- If structured data and visible recipe disagree significantly on ingredient count or content, log a warning and fallback to DOM content
- Consider flagging recipes with fewer than 5 ingredients for manual review if the visible recipe is more complex.
- Verify that all ingredients mentioned in the original source text appear in the `ingredients[]` list with correct quantities. Do not assume minor items can be omitted.

---

## 🔖 Final Output Checklist

Before returning the Tibls JSON, ensure the following:

- All required fields are present:
  - `@type`
  - `id`
  - `name`
  - `ingredients`
  - `steps`
  - `summary`
  - `calories`
- `calories` is always included:
  - Estimated if possible
  - Set to `0` if not estimable, with an explanatory note in `notes[]`
- `notes[]` includes entries for all inferred, estimated, or post-processed values

Failure to include these fields will result in invalid output.