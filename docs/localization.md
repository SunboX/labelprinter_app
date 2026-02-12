# Localization

The app uses runtime JSON translation bundles with `src/I18n.mjs`.

## Supported Locales

- `en` (English)
- `de` (German)

Locale normalization accepts prefixes:

- `de-DE` -> `de`
- unknown/unsupported locales -> `en`

## Locale Resolution Order

On startup, locale is resolved in this order:

1. URL parameter `lang`
2. persisted locale in localStorage (`labelprinter_app_locale`)
3. browser language (`navigator.language`)
4. fallback default (`en`)

## Runtime Translation Bindings

`I18n.applyTranslations(...)` updates elements using these data attributes:

- `data-i18n` -> `textContent`
- `data-i18n-placeholder` -> `placeholder`
- `data-i18n-title` -> `title`
- `data-i18n-aria-label` -> `aria-label`

Bundle files:

- `src/i18n/en.json`
- `src/i18n/de.json`

## URL Usage Example

- `http://localhost:3000/?lang=de`

This switches the UI to German before initial render.
