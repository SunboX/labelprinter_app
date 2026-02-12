# Security And Privacy Notes

This app is a browser-side editor/print client. It does not include an application backend for user/project storage.

## Share URL Data Exposure

Shared links can embed the full project payload in the query string (`project=...`).

Implications:

- URL contents can appear in browser history.
- URL contents can be logged by proxies, reverse proxies, and web servers.
- URL contents may leak via copied links or screenshots.

Recommendation:

- Do not include secrets in label templates, parameters, or embedded data.
- Prefer `projectUrl` to a controlled endpoint if payload size/sensitivity is a concern.

## Remote URL Loading

`project`, `projectUrl`, and `parameterDataUrl` can load remote files via browser `fetch`.

Constraints:

- Endpoint must be reachable by the browser.
- Endpoint must permit CORS for the app origin.
- Custom authorization headers are not configurable from URL parameters.
- Cross-origin cookie auth is generally unavailable in this flow.

## Local Storage

The app stores local preferences in browser localStorage:

- locale selection
- zoom preference with display fingerprint
- added Google Fonts links

This data is browser/profile-local and can be cleared via browser site data controls.

## Printing Permissions

Printing uses browser device APIs (`WebUSB`, `WebBluetooth`).

- User permission dialogs are browser-controlled.
- `autoPrint` can start print flow automatically, but device permission prompts may still require interaction.
- Use only trusted printer devices and known BLE UUID profiles.

## Third-Party Resources

The app serves JS dependencies locally from `node_modules` and loads user-provided Google Fonts URLs only from `fonts.googleapis.com` (validated).

Recommendation:

- Review and pin dependency versions before production deployments.
