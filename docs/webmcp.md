<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# WebMCP

The app exposes browser-side WebMCP tools so external in-browser agents can inspect, validate, prepare, and edit labels without DOM scraping.

## Requirements

- Chrome 149 or newer with the WebMCP origin trial enabled for `https://labelprinter.app:443`.
- Local development can also use `chrome://flags/#enable-webmcp-testing`; relaunch Chrome after enabling the flag.
- Browser responses must keep the page origin-keyed and permitted for WebMCP:
  - `Origin-Agent-Cluster: ?1`
  - `Permissions-Policy: tools=(self)`
  - `Origin-Trial: <WebMCP token>`

## Runtime Behavior

- Registration target: `window.document.modelContext`
- Compatibility target: `window.navigator.modelContext` only when `registerTool(...)` is available in older preview builds.
- Registration mode: `registerTool(...)`
- Registered tools:
  - `labelprinter_action`: ordered editor action pipeline for existing editor actions and extended app controls.
  - `get_label_context`: read-only compact label state, selected items, parameter state, and warnings.
  - `validate_project`: read-only print readiness checks with errors, warnings, and batch count.
  - `prepare_print`: print preflight that focuses the visible Print button for user confirmation without starting print output.
  - `import_label_data`: focused parameter-row import from JSON rows.
- Tool annotations use `untrustedContentHint: true`; read-only tools also set `readOnlyHint: true`.
- Cross-origin exposure: none. Do not pass `exposedTo` unless a specific trusted origin is approved.
- Registration is automatic when the API is available.
- Unsupported browsers keep running with no behavior change.

## Main Action Tool Contract

Input shape:

```json
{
    "actions": [
        { "action": "..." }
    ]
}
```

Output shape (single MCP text content with JSON):

```json
{
    "ok": true,
    "executed": [],
    "errors": [],
    "warnings": [],
    "results": [],
    "uiState": {}
}
```

Large responses are shortened to stay within Chrome's current WebMCP tool-output guidance. The shortened JSON stays parseable, keeps `ok`, `executed`, `errors`, `warnings`, and result action names, and preserves compact supported-value/capability fields needed for follow-up calls.

## Focused Tool Contracts

- `get_label_context` accepts an empty object and returns `ok` plus `context` with label settings, item counts, selected item IDs, parameter summary, parameter validation counts, and warnings.
- `validate_project` accepts an empty object and returns `ok` plus `validation` with `valid`, `printReady`, `errors`, `warnings`, `checks`, `itemCount`, `selectedItemIds`, `parameterBatchCount`, and label settings.
- `prepare_print` accepts optional `{ "skipBatchConfirm": true }`, runs the same preflight checks, focuses the visible Print button when ready, and returns `userActionRequired: true`. It does not call the printing action directly.
- `import_label_data` accepts `{ "rows": [...] }`, `{ "rows": { ... } }`, `{ "json": "[...]" }`, or `{ "parameterData": ... }`, plus optional `sourceName` and `sourceLabel`. It routes through the same parameter-data JSON validation path as file/URL imports.

## Supported Actions

### Editor actions (same allowlist as in-app assistant)

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

### Extended app controls

- `set_zoom`
- `set_locale`
- `set_ble`
- `set_parameters`
- `set_parameter_data_json`
- `clear_parameter_data`
- `set_google_font_links`
- `load_project_json`
- `load_project_url`
- `load_parameter_data_url`
- `export_project_json`
- `build_share_url`
- `get_ui_state`
- `get_action_capabilities`
- `get_parameter_state`
- `get_supported_values`

## Example

```json
{
    "actions": [
        { "action": "add_item", "itemType": "text", "properties": { "text": "WebMCP" } },
        { "action": "set_zoom", "zoom": 1.4 },
        { "action": "build_share_url" }
    ]
}
```

## Known Limits

- `print`, `save_project`, and `share_project` depend on browser permissions and user-gesture/browser policy constraints.
- URL-based loaders (`load_project_url`, `load_parameter_data_url`) still depend on reachable URLs and CORS/network behavior.
- `set_parameter_data_json` expects JSON array-compatible row objects (single objects are wrapped to one-row arrays).
- This integration uses the WebMCP imperative API only (no declarative form annotations).
- Live Apache hosting depends on `mod_headers` honoring `src/.htaccess`; otherwise configure the same headers at the virtual host or reverse-proxy level.
- Full project exports, UI snapshots, and capability payloads may be summarized in WebMCP output when the serialized response would exceed the current WebMCP output budget. Use in-app save/share flows for full project transfer.
