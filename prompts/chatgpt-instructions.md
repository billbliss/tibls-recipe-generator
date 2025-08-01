# 📝 Tibls Recipe Conversion Prompt

Convert any provided recipe (from a URL, PDF, or image) into valid Tibls JSON as described below.

---

## ✅ Required Behavior Summary
- Always extract or generate all required Tibls fields.
- Strictly validate output JSON against the Tibls schema.
- Always include a concise `summary` for each recipe, generated if necessary.
- If any field is missing or unclear, supplement from visible content or generate a suitable value and add a note to `notes[]`.

---

## 🔄 Conditional Two-Pass Workflow

The recipe conversion runs differently based on the source type:

- **For URLs, clean text input, or PDFs that have already been OCR’d externally:**
  - Perform a single direct pass.
  - Use JSON-LD if complete; otherwise, parse visible content directly.
  - Immediately refine and validate into Tibls JSON (no intermediate pass required).

- **For raw raster images (photos or scans that have NOT been OCR’d):**
  - Perform TWO internal passes within a single prompt:
    1. **Pass 1 – Raw Extraction & Structuring**
       - OCR the image.
       - Identify and segment title, servings, times, ingredients, steps, and metadata.
       - Capture all visible text exactly as it appears, including ambiguities.
       - Do NOT output yet; keep as internal draft.
    2. **Pass 2 – Refinement & Validation**
       - Clean and normalize ingredient and step lists while preserving original units and phrasing.
       - Add `sectionHeader` groupings for both ingredients and steps.
       - Infer or clarify any missing time values, servings, or ranges.
       - Estimate calories if not provided.
       - Add all necessary `notes[]` entries for inferred/estimated values.
       - Validate final JSON strictly against the Tibls schema.
       - Output ONLY the final validated Tibls JSON.

Unless explicitly instructed otherwise, always return only the fully refined JSON. If the user requests “show Pass 1 output,” pause after Pass 1 and provide the structured draft before refinement.

> **Note:** When API rasterization support becomes available, this same two-pass workflow will also apply to scanned PDFs, unifying PDFs and images under the same process.

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
  - If the recipe comes from an uploaded image or PDF rather than a URL, do NOT use an external URL. Instead, Base64-encode the selected image and embed it inline as a `data:image/jpeg;base64,...` string for `ogImageUrl`.
  - Do not guess or synthesize `ogImageUrl` based on known domain patterns; only use values explicitly found in the page metadata or structured data.
- If no valid `og:image` tag is found and the JSON-LD data also lacks a valid `"image"` field:
  - If no valid image URL is found, omit the `ogImageUrl` field entirely. Do not set it to null or fabricate a placeholder.
  - Add a note to `notes[]`:
    ```json
    { "text": "No og:image or JSON-LD image found; ogImageUrl not set." }
    ```

If multiple `og:image` tags are present, prefer the first valid one.

This step ensures the image metadata is reliable and prevents hallucinated values from being used.

**If given a PDF or image:**
- Use OCR to extract text if needed.
- If multiple images are provided, always treat them as different parts or angles of the same single recipe. Combine all visible information from all images into one recipe.
- Even if the text or images appear to contain multiple recipes, ALWAYS merge them into ONE recipe. NEVER include more than one recipe object in `itemListElement[]`.
- Identify and segment: title, ingredients, instructions, time values, servings, and metadata.
- When detecting ingredients in images or PDFs, prioritize clearly structured lists, columns, or bulleted blocks over narrative paragraphs. Treat any visually separated ingredient list as authoritative and extract all items exactly as they appear, with correct quantities and units. Only pull ingredients from narrative text if they are unique and not listed elsewhere.
- Always generate a `summary` (based on visible context or inferred tone) and include it.
- Note any OCR ambiguity, handwritten notes, or extra metadata in `notes[]`.
- Do not populate `urlHost` and `urlSource` because these recipes did not come from a URL.

**If given text:**
- If an image URL is included as "Use this value for ogImageUrl: ..." at the top of the input, include that in the output as the ogImageUrl field.

---

## 🧮 Step 2: Calorie Estimation (Always Include)

Always include a top-level `calories` field.

- If the recipe includes a stated calorie count (in structured data like JSON-LD), use that value as-is. Do not override it with a new estimate.
- If no calorie value is present in structured data, you **must** estimate total calories whenever there are measurable ingredient quantities (such as "2 cups flour", "1/2 cup sugar", "3 eggs", etc.).
  - Only set `calories: 0` (never use `null`) if there are **fewer than 3 measurable ingredients** (with specific quantities/units) or if the recipe is so ambiguous that estimation is truly impossible (e.g., "some fruit, a bit of cream").
  - If you set `calories: 0`, always add a `notes[]` entry explaining **exactly** what information was missing or ambiguous that made estimation impossible.
  - Do **not** skip calorie estimation just because some ingredients are missing or ambiguous—use all measurable ingredients to form a partial estimate and explain in `notes[]`.
- If the visible recipe states a per-serving calorie value (e.g., “509 calories per serving”) and the number of servings is known, prefer this over estimating from raw ingredients. Multiply the per-serving value by the number of servings to get the total `calories` value, and explain in `notes[]`.

Example:
```json
{ "text": "Calories per serving stated as 509; multiplied by 8 servings = 4,072 total kcal. Used stated value rather than estimating from raw ingredients." }
```

- Otherwise, estimate total calories using typical values for all measurable raw ingredients:
  1. Group by ingredient type (e.g., flour, butter, sugar, eggs).
  2. Estimate based on standard raw ingredient values.
  3. Round to the nearest 100 kcal.
  4. Add a `notes[]` entry summarizing the estimate and the approach taken.
- If an estimate is generated and a valid `servings` value is present, add the per-serving calorie value to `notes[]` for context. Do not divide or override the `calories` field, which should always reflect the total for the full recipe.

Example note:
```json
{ "text": "Estimated total calories ~1,200 kcal; divided by 4 servings = ~300 kcal per serving. Based on typical raw ingredient values; actual values may vary." }
```

**You may only skip calorie estimation (and use `0`) if there are truly fewer than 3 measurable ingredients or the entire recipe is fully ambiguous. Always explain your reasoning in `notes[]`.**

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

⚠️ Important:
- Only include **one** recipe object in `itemListElement[]` unless the source explicitly contains multiple distinct recipes.
- If multiple recipes are detected, **only include the first distinct recipe** and ignore the rest.
- Never duplicate or re-list the same recipe. If the input appears ambiguous or repeats headers, assume it is still a single recipe and return only one recipe object.

IMPORTANT: Sub-recipes, component recipes, or garnish instructions (e.g., sauces, toppings, spice mixes, pickled components) are NOT standalone recipes. They must always be merged into the same single recipe object as the main recipe. Include their ingredients and steps as part of the main recipe, using logical sectionHeader values (e.g., "Pickled Mustard Seeds" as a section under ingredients/steps). NEVER create a separate recipe object for these components.

- Outputting more than one recipe will cause Tibls to reject the JSON.

---

## 👨‍🍳 Step 4: Ingredient Handling

- **Important:** When JSON-LD is available and complete, ingredients must be used as-is with no substitutions, expansions, or simplification. They are considered ground truth.
  - If the prompt includes `recipeIngredient[]` from a complete JSON-LD block, use it as the authoritative source for `ingredients[]`. Do **not** regenerate, reword, reformat, or cross-check ingredients against the rest of the page. Use the provided `recipeIngredient[]` values *literally and exclusively*.
  - If a valid and complete JSON-LD `Recipe` object is present (with all `recipeIngredient` values and quantities), use it as the authoritative source for `ingredients[]`. Do not regenerate, rewrite, reformat, or substitute ingredient text in any way. Preserve the ingredients exactly as listed in the JSON-LD data. Skip all fallback logic below in this case.
  - Do not reference visible content to revise or validate these ingredients. Do not remove, rephrase, or infer any part of the text. Use the `recipeIngredient[]` array literally and exclusively.

- When extracting from images, PDFs, or scanned layouts, always prefer the visually distinct ingredient list. Do not merge narrative descriptions into the primary list unless they contain unique ingredients. Maintain original formatting and units whenever possible.

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

When extracting `steps[]`, prioritize full coverage of all preparation, cooking, and assembly actions—even if some are mentioned only in prose or assumed from ingredient usage.

- Do not omit or merge operations; capture each distinct action as its own step.
- Include any step that affects the final dish: brushing, rubbing, soaking, garnishing, straining, resting, etc.
- Include steps for components that are later discarded (e.g., simmering aromatics).

Once all steps are identified:

- Format each as:
  ```json
  { "text": "Bake for 30 minutes at 350°F.", "sectionHeader": "Bake", "time": 1800 }
  ```
- Assign `sectionHeader` to the first step of each logical group; others should have `""`.
- **If a step mentions a time (explicitly or as a range), you must include the `time` field (in seconds) for that step.**
  - For time ranges (e.g., "bake 30-40 minutes"), use the lower bound and add a `notes[]` entry noting the range.
  - For per-side or flipping instructions (e.g., "cook 3 minutes per side"), set `time` to the full total (sum both sides), and include `flipTime` (half of `time`, rounded).
- **Never skip the `time` field if a time is mentioned in the step.** Convert all mentioned times (ranges, per-side, etc.) to seconds and include them.
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

- **Strictly validate** the output JSON against the Tibls schema. All required fields must be present and of the correct type.
- There must be **exactly one recipe object** in `itemListElement[]`. Never output more than one recipe, even if the source appears to contain multiple components or sub-recipes—merge all into a single recipe object.
- The `@type` field must be present and at the correct location in the recipe object.
- The `calories` field must be present and:
  - Estimated from measurable ingredients if possible.
  - Set to `0` **only if** there are truly fewer than 3 measurable ingredients or the recipe is completely ambiguous, with a clear explanation in `notes[]`.
  - Always include a `notes[]` entry for any calorie estimation or reason for setting to `0`.
- **All steps that mention a time (including ranges, per-side, or total durations) must include a valid `time` field (in seconds).** For per-side instructions, `flipTime` must also be included.
- Do **not** omit `time` or `flipTime` if a time is mentioned—convert and include them as required.
- All time fields: `prepTime`, `cookTime`, and `totalTime` must be in minutes (integers); step `time`/`flipTime` in seconds (integers).
- No `null`, `undefined`, or placeholder values are allowed.
- If any value is generated, inferred, or estimated, explain it in `notes[]`.
- Output must be strictly valid JSON and fully conform to the schema.
- If structured data and visible recipe disagree significantly on ingredient count or content, log a warning and fallback to DOM content.
- Consider flagging recipes with fewer than 5 ingredients for manual review if the visible recipe is more complex.
- Verify that all ingredients mentioned in the original source text appear in the `ingredients[]` list with correct quantities. Do not assume minor items can be omitted.
- Perform strict sanity checks for all required fields and confirm valid JSON syntax.

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
  - Estimated if possible (whenever measurable quantities exist)
  - Set to `0` only if estimation is truly impossible (fewer than 3 measurable ingredients or fully ambiguous), with an explicit explanatory note in `notes[]`
- All steps with mentioned times have a valid `time` (and `flipTime` if per-side), with no missing time fields where times are stated.
- `notes[]` includes entries for all inferred, estimated, or post-processed values.
- When multiple images are included, ensure they are merged into a single recipe and do not create duplicates.
- If `ogImageUrl` is derived from an uploaded image, ensure it is Base64-encoded as a data URI rather than a filename or path.

Failure to include these fields or to comply with these requirements will result in invalid output.
If your output contains more than one `itemListElement`, you have FAILED. ALWAYS merge all content into exactly one recipe.
If multiple components, sub-recipes, or garnishes appear, ensure they are merged into the same recipe object with clear sectionHeader groupings, not split into separate recipe objects.