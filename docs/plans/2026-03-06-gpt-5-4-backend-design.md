# GPT-5.4 Backend Design

## Goal

Switch the backend assistant default model to `gpt-5.4` and align backend reasoning configuration with the GPT-5.4 Responses API options while remaining tolerant of existing environment values.

## Current State

- The Node backend sends assistant traffic through the Responses API in `src/server.mjs`.
- The PHP backend mirrors the same payload shape in `api/chat.php`.
- Both backends default `OPENAI_MODEL` to `gpt-4.1-mini`.
- Both backends only accept `minimal`, `low`, `medium`, and `high` for `OPENAI_REASONING_EFFORT`.
- The docs and `.env.example` describe the old defaults.

## Requirements

- Default the backend model to `gpt-5.4`.
- Support GPT-5.4 reasoning values `none` and `xhigh`.
- Keep legacy `minimal` support so older environment values do not break unexpectedly.
- Update user-facing docs and example environment config.
- Add tests that lock in the new defaults and accepted reasoning values.
- Bump the app version in `package.json`.

## Approaches Considered

### 1. Backward-compatible sync

Update both backends to default to `gpt-5.4`, expand reasoning validation to accept both legacy and GPT-5.4 values, and refresh docs/tests accordingly.

Pros:
- Meets the GPT-5.4 upgrade goal.
- Preserves compatibility with existing `minimal` configurations.
- Keeps the Node and PHP backends aligned.

Cons:
- Slightly broader parser surface than GPT-5.4 strictly needs.

### 2. Hard GPT-5.4 cutover

Update defaults to GPT-5.4 and only accept GPT-5.4 reasoning values.

Pros:
- Cleaner semantics for the new model.

Cons:
- Breaks existing `minimal` configurations.
- Creates unnecessary migration friction.

### 3. Env-only model switch

Change the configured model to `gpt-5.4` without updating code or docs.

Pros:
- Fastest possible change.

Cons:
- Leaves the reasoning config and documentation out of sync.
- Does not fully support GPT-5.4 behavior.

## Chosen Design

Use the backward-compatible sync approach.

### Architecture

- Change the default `OPENAI_MODEL` fallback from `gpt-4.1-mini` to `gpt-5.4` in both backends.
- Expand reasoning parsing in both backends to accept `none`, `minimal`, `low`, `medium`, `high`, and `xhigh`.
- Keep request payload structure unchanged except for the updated defaults and accepted values.

### Components

- `src/server.mjs`
  - Update default model.
  - Update reasoning parser JSDoc and validation.
- `api/chat.php`
  - Update default model.
  - Update reasoning parser validation.
- `.env.example`
  - Change example model default to `gpt-5.4`.
  - Change example reasoning default to `none`.
- `docs/ai-assistant.md`
  - Document GPT-5.4 as the default model.
  - Document the expanded reasoning options and recommended default.
- `tests/`
  - Add focused tests for Node-side parsing/defaults.
  - Add parity checks for PHP-side parsing/defaults where direct runtime execution is not practical.
- `package.json`
  - Bump app version.

### Data Flow

1. Backend reads `OPENAI_MODEL` and `OPENAI_REASONING_EFFORT`.
2. Backend normalizes reasoning values through the parser.
3. Backend sends the same Responses API payload shape with the updated model default and reasoning options.
4. Frontend error handling remains unchanged.

### Error Handling

- Invalid or unknown reasoning values still fall back to the configured default.
- Model availability failures remain surfaced through existing assistant error handling.
- No new runtime branches are introduced in the chat request flow.

### Testing

- Add tests that prove Node-side parsing accepts `none` and `xhigh`.
- Add tests that prove fallback behavior still works for invalid values.
- Add source-parity checks to ensure PHP and Node stay aligned on default model and accepted reasoning values.
- Run `npm test`.
