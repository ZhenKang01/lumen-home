# Lumen Home: demo store for Mend

Lumen Home is a **fictional** home-goods shop. It is the live demo for **Mend** ("Fix the order, keep the customer"). When an order goes wrong, Mend, an AI assistant on Telegram, messages the customer with a personal fix. The shop looks like a real store and lets judges cause problems on stage: late deliveries and low reviews.

There are no real payments, addresses or deliveries. The shop only ever asks for a first name.

## Run it

- **Easiest:** double-click `index.html`. It works straight from the folder (local mode).
- **Local web server (optional):** `npx serve .` or `python -m http.server 8000`, then open http://localhost:8000.

There's no build step and no npm packages at runtime. It's plain HTML, CSS and JavaScript.

## Host it for free

**Netlify (drag and drop)**
1. Go to https://app.netlify.com/drop.
2. Drag the whole `Lumen Webstore` folder onto the page.
3. You get a public URL in a few seconds. To update, drag the folder again on the site's *Deploys* tab.

**GitHub Pages**
1. Create a GitHub repository and push these files to it (`index.html` must be in the root).
2. In the repository, open *Settings → Pages*.
3. Under *Build and deployment*, choose *Deploy from a branch*, pick `main` and `/ (root)`, then save.
4. The site appears at `https://<your-user>.github.io/<repo>/` after a minute.

The app uses hash URLs (`#/orders`), so no redirect rules are needed on either host.

## Fill in `config.js`

```js
window.LUMEN_CONFIG = {
  DELIVERY_FEE: 6.9, PROMISE_DAYS: 5,
  BOT_URL: "https://t.me/mend_by_smc_bot",
  API_URL: "", API_KEY: "",
  TEAM_CODE: "", TEAM_NAMES: []
};
```

| Setting | What it does |
| --- | --- |
| `API_URL` | Your Mend API endpoint. **Empty = local mode:** events go into the demo feed only and nothing is sent anywhere. |
| `API_KEY` | Sent as the `x-api-key` header on every request. Never shown in the UI and never put in a URL. |
| `TEAM_CODE` | Code your team types in *Account* to unlock **Connect Telegram**. **Empty = nobody can connect.** |
| `TEAM_NAMES` | Optional. If you list first names (for example `["Mei", "Arjun"]`), only accounts with those names can connect. Leave `[]` to allow anyone who knows the code. |
| `BOT_URL` | Mend's Telegram bot. The connect link is `BOT_URL?start=<token>`. |
| `DELIVERY_FEE`, `PROMISE_DAYS` | S$6.90 delivery, and orders promised 5 days after they are placed. |

## The demo, step by step

The **Quick start for judges** button in the top bar shows these steps on screen.

1. **Account:** enter a first name. A random customer id like `c_9f3a2b` is created once and kept.
2. **Connect Telegram:** enter the team code, then press *Connect Telegram* and tap *Start* in the bot. The status changes from *Not connected* to *Waiting* to *Connected*.
3. **Order:** add items to the basket and place the order. It shows as *On its way*.
4. **Demo controls** (button at the bottom left): choose *Deliver on time*, *Deliver 2 days late* or *Deliver 9 days late*. A late delivery sends a `late_delivery` event to Mend.
5. **Review:** after delivery, each item in the order gets a *Review* button. A review of 2 stars or lower sends a `bad_review` event.
6. **Watch Telegram.** If Telegram is slow, use **Preview message** in the Demo controls activity feed. It shows a locally made sample, clearly labelled as a preview.

The Demo controls drawer also has the activity feed (last 8 events), the `/fastforward` helper text, **Present mode** (bigger text, hides the drawer tab; reopen the drawer with Shift + D) and **Reset demo**. The staff view is at `#/staff` and is linked from the drawer, not the main menu.

## API contract

Every call is a `POST` of JSON to `API_URL` with headers `content-type: application/json` and `x-api-key: <API_KEY>`. Each call has an 8 second timeout and up to 2 retries, and never blocks the UI. Your API must allow CORS from the site's origin, including the `x-api-key` header. Opening `index.html` from disk sends `Origin: null`.

### Problem events (sent as-is, no `action` field)

Two triggers only:
- **T1 late delivery**: delivered with `days_late >= 1`.
- **T2 low review**: review rating `<= 2`.

```json
{
  "event_type": "late_delivery | bad_review",
  "customer_id": "c_9f3a2b",
  "first_name": "Mei",
  "order_id": "LH-1001",
  "product_id": "halo-lamp",
  "product_name": "Halo floor lamp",
  "category": "Lighting",
  "order_value": 135.90,
  "delivery_fee": 6.90,
  "days_late": 9,
  "review_score": null,
  "review_text": "",
  "promised_at": "2026-10-19T00:00:00.000Z",
  "delivered_at": "2026-10-28T00:00:00.000Z",
  "prior_orders": 0,
  "telegram_connected": true
}
```

- `order_value` is the order total including the delivery fee.
- For `late_delivery`, `product_*` is the order's highest-priced item.
- For `bad_review`, `review_score` and `review_text` are filled in, and `days_late` is that order's value (0 if it arrived on time).
- `promised_at` is midnight UTC, 5 days after the order date. `delivered_at` is `promised_at` plus `days_late`.
- **Consent first:** if the shopper has not connected Telegram, nothing is sent. The feed shows "Not sent: customer has not connected Telegram".

### Actions

| Request body | Expected reply |
| --- | --- |
| `{"action":"connect","customer_id","first_name"}` | `{"token":"…","expires_at":"ISO date"}`. The shop opens `BOT_URL?start=<token>` in a new tab. |
| `{"action":"status","customer_id"}` | `{"status":"not_connected" \| "waiting" \| "connected"}` (or `{"connected":true}`). Polled every 3 s for up to 2 minutes. |
| `{"action":"stop","customer_id"}` | `{"ok":true}`. Sent by *Disconnect and stop messages*. |
| `{"action":"delete","customer_id"}` | `{"ok":true}`. Sent by *Delete my data*. |
| `{"action":"events"}` | `{"events":[{"time","event_type","first_name","order_id","status","outcome"}, …]}`, the last 20, for `#/staff`. |

The token appears only inside the Telegram link. Chat ids, tokens and API keys are never shown on the page. In local mode the shop shows a clearly labelled **simulated** token and fakes a successful connection after about 4 seconds, and nothing is sent.

### Test with the mock API

`mock-api.js` is a small Node server (no dependencies) that implements the contract above. It rejects any event whose fields don't match exactly.

```bash
node mock-api.js                 # http://localhost:8787, key "test-key"
MOCK_FAIL=1 node mock-api.js     # every event gets HTTP 500, to test retries and errors
```

Then set `API_URL: "http://localhost:8787"`, `API_KEY: "test-key"` and any `TEAM_CODE` in `config.js`. The mock pretends the customer pressed *Start* in Telegram 5 seconds after asking for a link. `GET http://localhost:8787/__inspect` shows what it received.

### Automated browser test

`tests/e2e.js` runs the whole flow in Chromium with Playwright. It covers local mode, API mode against the mock, a failing API, 360/768/1280 widths, dark mode, reduced motion, blocked storage and corrupt storage. It saves screenshots and fails on any console error.

```bash
npm install --no-save playwright && npx playwright install chromium
node tests/e2e.js . shots
```

## Swap a photo

Product photos are in `/images`: 800 × 1000 px JPGs under 150 KB, from Unsplash under the Unsplash License. Photographers are credited on the About page (`#/about#credits`).

To swap one:
1. Save the new photo as an 800 × 1000 JPG under 150 KB in `/images`.
2. In `data.js`, change that product's `image:` line (one line per product). Also update `alt:` and `credit:` so the alt text and the credits page stay true.

Never link to images on other sites. Always keep a local copy.

## Privacy and responsible AI (shown in the app)

- The shop collects only a first name (invented is fine). There are no email, phone, address or card fields anywhere.
- Account has a "How Mend uses your data" panel: what is used, what is not, who can see it, and how to stop.
- Mend is an AI. A human can be requested at any time, and refunds are limited to the delivery fee.
- *Delete my data* wipes this browser's data and, if an API is set, sends `{"action":"delete"}`.
- All user text is added to the page as text nodes (never `innerHTML`).

## Known limits

- **The team code check runs in the browser.** Anyone who reads `config.js` can see `TEAM_CODE`. That is fine for a demo, but it is not security. The real protection must be on the API side.
- `API_KEY` is also visible to anyone who opens `config.js`. Use a demo-only key with narrow permissions, and rate-limit it on the server.
- Data lives in this browser's `localStorage` (key `lumen_store_v2`). Another browser or device is a different shopper. If storage is blocked, the shop still works but forgets everything when the tab closes. If saved data is corrupt, it is reset.
- Delivery dates are simulated: *Deliver 9 days late* sets the delivery date in the future relative to today.
- Ratings and reviews are fictional, and the shop never shows impact numbers.
