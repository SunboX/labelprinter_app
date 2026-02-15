# AI Assistant

The app includes an integrated assistant panel for label-editor tasks.

Supported use cases:

- questions about the editor
- automatic label changes
- sketch-based help (image upload)
- rendered-label validation (current label canvas is attached automatically)

## Open The Assistant

1. Click the assistant icon in the top toolbar.
2. The assistant overlay opens on top of the app.

## What The Assistant Can Do

The assistant can:

- explain editor behavior
- add/update/remove label objects
- change label settings
- align selected objects
- trigger print/save/share flows
- use the current rendered label canvas as visual context on every request

Important property behavior for AI actions:

- Text styling is available with `textBold`, `textItalic`, `textUnderline`.
- QR size should be controlled with `size` (QR is always square).
- For sketch/photo recreation, clear old objects first (`clear_items`) before creating the new layout.

Supported allowlisted actions:

- `add_item`
- `update_item`
- `remove_item`
- `clear_items`
- `set_label`
- `select_items`
- `align_selected`
- `print`
- `save_project`
- `share_project`

## Scope Limits

The backend instructions are intentionally strict.

- In scope: label editor tasks only
- Out of scope: unrelated topics and non-editor automation

When a request is outside scope, the assistant should refuse briefly and ask for a label-editor request.

## Endpoint Behavior

There is no endpoint input in the UI.

Endpoint is selected automatically:

- Localhost (`localhost`, `127.0.0.1`, `::1`): `POST /api/chat` (Node route from `src/server.mjs`)
- Live hosting: `POST /api/chat.php` (PHP endpoint for All-Inkl)

## Docs Grounding

Assistant answers are grounded by backend-loaded markdown snippets.

- Node route (`/api/chat`) and PHP route (`/api/chat.php`) both read docs from disk.
- Grounding config is controlled with env vars:
  - `AI_DOCS_ENABLED`
  - `AI_DOCS_DIR`
  - `AI_DOCS_FILES`
  - `AI_DOCS_MAX_SNIPPETS`
  - `AI_DOCS_SNIPPET_CHARS`
  - `AI_DOCS_MAX_CONTEXT_CHARS`
- Assistant response tuning env vars:
  - `OPENAI_REASONING_EFFORT` (`minimal`, `low`, `medium`, `high`; recommended: `minimal`)
  - `AI_MAX_OUTPUT_TOKENS` (recommended: `2200`)
- Assistant diagnostics env vars:
  - `AI_DEBUG_LOGS` (`true` enables backend debug lines)
  - `AI_DEBUG_FUNCTION_ARGS_PREVIEW_CHARS` (how many tool-argument chars are logged; default `1200`)

Important:

- You do **not** need to expose docs publicly for grounding.
- If `/docs` is not deployed to web root, set `AI_DOCS_DIR` to a private server path that contains your markdown files.

## PHP Hosting (All-Inkl)

Use `api/chat.php` on your live host.

Required server config:

1. Create a `.env` file from `.env.example`.
2. Set at minimum:
   - `OPENAI_API_KEY`
   - optional `OPENAI_MODEL`
3. Configure docs grounding path:
   - set `AI_DOCS_DIR` and `AI_DOCS_FILES`
4. Keep API keys out of frontend code.

Deployment layout example:

- `/src` deployed to web root (`/`)
- `/api/chat.php` deployed to `/api/chat.php`
- docs either:
  - deployed to `/docs` and `AI_DOCS_DIR=docs`, or
  - stored in a private folder and `AI_DOCS_DIR=/absolute/private/path/to/docs`

Optional:

- Set `APP_ENV_FILE=/absolute/path/to/.env` if your `.env` is outside default lookup.

## Security Notes

- The browser never receives the OpenAI API key.
- Action execution is allowlisted and validated in the frontend action bridge.
- Both local and PHP backends apply simple rate limiting.

For broader security guidance, see [security-and-privacy.md](./security-and-privacy.md).
