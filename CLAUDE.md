# CLAUDE.md: Lumen Home

Fictional home-goods demo store for the Mend hackathon. Plain HTML/CSS/JS. It must run by double-clicking `index.html` and on Netlify / GitHub Pages. No framework, no build step, no runtime npm packages.

## Files
- `index.html`: page shell (demo bar, header, footer, dialogs, hero lamp `<template>`).
- `styles.css`: all styles. Light tokens on `:root`, dark via `prefers-color-scheme`, `html.present` = present mode.
- `config.js`: `window.LUMEN_CONFIG` (API_URL empty = local mode; TEAM_CODE empty = nobody can connect).
- `data.js`: 18 products (`window.LUMEN_PRODUCTS`), 3 per category, seeded reviews `[name, rating, text, daysAgo]`.
- `api.js`: `window.MendAPI` adapter (POST, x-api-key, 8 s timeout, 2 retries; local-mode simulation).
- `app.js`: state (`localStorage` key `lumen_store_v2`), hash router, views, demo drawer, events, Telegram flow.
- `mock-api.js`: Node mock of the Mend API for testing. Validates the event payload strictly.
- `tests/e2e.js`: Playwright end-to-end test and screenshots (`node tests/e2e.js . shots`).

## Rules
- Never use `innerHTML` / `outerHTML` / `insertAdjacentHTML`. Build DOM with `h()` (text nodes) and `icon()` / `svgEl()`.
- Only a first name is collected. No email, phone, address or card fields.
- Event payload fields are fixed (README, "API contract"). Don't add or rename fields; `mock-api.js` rejects extras.
- Send events only when Telegram is connected (consent first). Otherwise log "Not sent: customer has not connected Telegram".
- Never display tokens (after use), chat ids or the API key.
- Preview messages must never mention discounts or vouchers. Refunds are limited to the delivery fee.
- Don't invent impact numbers anywhere in the app.
- Sentence case, plain words, buttons say what they do.
- Keep it accessible: labels on inputs, headings in order, colour never the only signal (icons + text), visible focus, reduced motion respected.
- Product images: 800 × 1000 JPG, under 150 KB, with `width`/`height` set in markup and real `alt` text.

## Design
Palette: Dusk ink #1C2230, Lamplight #F0B44C (accent only), Fog #EEF1F4, Paper #FFFFFF, Slate #56606F, Moss #2F6A55, plus status red #A1372F for "late" only.
Type: local old-style serif stack for headings, system sans for body, tabular numerals for prices.
One hero moment: the pendant lamp that switches on (pull-cord toggle). Everything else stays quiet: flat image tiles, hairline rules, no shadows on cards.

## Testing
Run `node tests/e2e.js . shots` (needs `playwright` + Chromium installed outside the app). It must end with all checks passed and zero console errors. Look at the screenshots, not just the pass count.
