# WebMCP

The app now exposes a browser-side WebMCP tool so external in-browser agents can execute label actions and extended app controls without DOM scraping.

## Requirements

- Chrome `146.0.7672.0` or newer.
- Enable `chrome://flags/#enable-webmcp-testing`.
- Relaunch Chrome after enabling the flag.

## Runtime Behavior

- Registration target: `window.navigator.modelContext`
- Registration mode:
  - preferred: `registerTool(...)`
  - fallback: `provideContext({ tools: [...] })`
- Tool name: `labelprinter_action`
- Registration is automatic when the API is available.
- Unsupported browsers keep running with no behavior change.

## Tool Contract

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
