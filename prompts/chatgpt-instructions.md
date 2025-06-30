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
- Extract JSON-LD data (Schema.org `Recipe`) if available.
- Prefer `og:image` (or `twitter:image`) as the recipe image if it's a clear food photo; otherwise, heuristically select a main food photo.
- Parse structured data into Tibls JSON, supplementing missing fields from page content or metadata.
- If summary or other required fields are missing, generate them and add a note to `notes[]`.

**If given a PDF or image:**
- Use OCR to extract text if needed.
- Identify and segment: title, ingredients, instructions, time values, servings, and metadata.
- Use a clear photo of the dish as `ogImageUrl` if present.
- Always generate a `summary` (based on visible context or inferred tone) and include it.
- Note any OCR ambiguity, handwritten notes, or extra metadata in `notes[]`.

---

## 📦 Step 2: Tibls JSON Construction

Each recipe object must include:
- `@type`: `"https://tibls.app/types/recipe"`
- `id`: Unique UUID string
- `name`: Recipe title
- `ingredients[]`: Array of ingredient objects
- `steps[]`: Array of step objects
- `summary`: Concise overview (always present)

**Optional fields:**  
`urlSource`, `urlHost`, `created`, `updated`, `lastCooked`, `lastQueued`, `cookCount`, `prepTime`, `cookTime`, `totalTime`, `servings`, `calories`, `ogImageUrl`, `notes[]`

**Notes:**
- If any required field is missing, extract or generate it and explain in `notes[]`.
- If calorie count is missing, estimate it (see Step 3) and add a note.
- Always include a `notes[]` entry for any inferred, estimated, or post-processed value.

---

## 🧮 Step 3: Calorie Estimation (If Needed)

If calories are not provided:
1. Estimate total calories using typical values for raw ingredients.
2. Group by ingredient type.
3. Round to the nearest 100 kcal.
4. Add a `calories` field and a note summarizing the estimate in `notes[]`.

---

## 👨‍🍳 Step 4: Ingredient Handling

Each ingredient:
```json
{ "text": "2 cups flour", "sectionHeader": "Dough" }
```
- Always include `sectionHeader`; only the first in a group gets a value, others get `""`.
- Use original units, with alternates in parentheses if appropriate.

---

## 🍳 Step 5: Step Handling

Each step:
```json
{ "text": "Bake for 30 minutes at 350°F.", "sectionHeader": "Bake", "time": 1800 }
```
- Use `sectionHeader` only on the first step of a group.
- If a step includes a time range, use the lower bound and add a note.
- For per-side or flipping instructions with a total time, set `time` to the full duration and add `flipTime` (half of total, rounded).
- Add a note to `notes[]` when `flipTime` is inferred.

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