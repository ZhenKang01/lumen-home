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
  API_URL: "https://smc1.app.n8n.cloud/webhook/mend-store", API_KEY: "lh_9a754c53c17d4ff09b2b03f2",
  TEAM_CODE: "", TEAM_NAMES: []
};
```

| Setting | What it does |
| --- | --- |
| `API_URL` | The Mend backend (an n8n webhook). **Empty = local mode:** events go into the demo feed only and nothing is sent anywhere. |
| `API_KEY` | Sent as the `x-api-key` header on every request. Never shown in the UI and never put in a URL. |
| `TEAM_CODE`, `TEAM_NAMES` | **Not used any more. Leave them empty.** The Mend server checks the team code, so the store has no code of its own. |
| `BOT_URL` | Mend's Telegram bot. The connect link is `BOT_URL?start=<token>`. |
| `DELIVERY_FEE`, `PROMISE_DAYS` | S$6.90 delivery, and orders promised 5 days after they are placed. |

> **About `API_KEY`:** anyone who views the page source can see it. It is only a basic filter against random traffic, not security. The real protection is on the server: Mend refuses to connect Telegram without the team code, and only sends messages to people who connected.

> **Where it works:** the Mend backend only accepts requests from `https://zhenkang01.github.io`. The hosted site works. A copy opened from disk or `localhost` with this `API_URL` will show "Could not reach Mend". To try the store offline, set `API_URL: ""` (local mode), or point it at the mock server below.

## The demo, step by step

The **Quick start for judges** button in the top bar shows these steps on screen.

1. **Account:** enter a first name. A random customer id like `c_9f3a2b` is created once and kept.
2. **Connect Telegram:** type the team code in *Account* and press *Connect Telegram*. Mend checks the code; if it is right, Telegram opens in a new tab. Tap *Start* in the bot. The status changes from *Not connected* to *Waiting for Telegram* to *Connected*. The code is sent once with the request and never saved in the browser.
3. **Order:** add items to the basket and place the order. It shows as *On its way*.
4. **Demo controls** (button at the bottom left): choose *Deliver on time*, *Deliver 2 days late* or *Deliver 9 days late*. A late delivery sends a `late_delivery` event to Mend.
5. **Review:** after delivery, each item in the order gets a *Review* button. A review of 2 stars or lower sends a `bad_review` event.
6. **Watch Telegram.** If Telegram is slow, use **Preview message** in the Demo controls activity feed. It shows a locally made sample, clearly labelled as a preview.

The Demo controls drawer also has the activity feed (last 8 events), the `/fastforward` helper text, **Present mode** (bigger text, hides the drawer tab; reopen the drawer with Shift + D) and **Reset demo**. The staff view is at `#/staff` and is linked from the drawer, not the main menu.

## API contract

Every call is a `POST` of JSON to `API_URL` with headers `content-type: application/json` and `x-api-key: <API_KEY>`. Each call has an 8 second timeout and never blocks the UI. Network errors, timeouts and 5xx answers are retried up to 2 times; 4xx answers are not retried. The API must allow CORS from the site's origin, including the `x-api-key` header.

Formats the server accepts (the store keeps to them):
- `customer_id`: `^c_[a-z0-9]{4,24}$` (the store makes `c_` + 6 hex characters)
- `first_name`: 1 to 20 letters (the sign-up form enforces this: one word, letters only)
- `order_id`: `LH-` plus 3 to 8 digits
- `category`: one of Lighting, Furniture, Kitchen, Textiles, Decor, Storage

### Actions

| Request body | Reply and what the store does |
| --- | --- |
| `{"action":"connect","customer_id","first_name","team_code"}` | `200 {"ok":true,"token","expires_at"}`: opens `BOT_URL?start=<token>` in a new tab and shows *Waiting for Telegram*. `200 {"ok":true,"connected":true}`: shows *Connected* straight away. `403 {"error":"team_only"}`: shows "That code is not right. Telegram messages are only enabled for the demo team." |
| `{"action":"status","customer_id"}` | `{"ok":true,"status":"connected" / "waiting" / "not_connected"}`. Polled every 3 s for up to 2 minutes after the link opens; stops when connected. Also checked once on page load, so a STOP typed in Telegram is noticed. |
| `{"action":"stop","customer_id"}` | Sent by *Disconnect and stop messages*. |
| `{"action":"delete","customer_id"}` | Sent by *Delete my data*. |
| `{"action":"events"}` | `{"ok":true,"events":[{"at","event_type","first_name","order_id","product_name","status","outcome"}, ...]}`. Shown newest first in `#/staff`. Only these fields are shown; chat ids and tokens never are. |

The team code is typed into the Account page, sent with `connect`, and then cleared from the box. It is not stored and not in `config.js`. The token appears only inside the Telegram link.

### Problem events

Two triggers only:
- **T1 late delivery**: delivered with `days_late >= 1`.
- **T2 low review**: review rating `<= 2`.

The body is the event payload with `action` set to the event type (`event_type` is kept too):

```json
{
  "action": "late_delivery",
  "event_type": "late_delivery",
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
- For `late_delivery`, `product_*` is the order's highest-priced item and `review_score` is `null`.
- For `bad_review`, `review_score` and `review_text` are filled in, and `days_late` is that order's value (0 if it arrived on time).
- `promised_at` is midnight UTC, 5 days after the order date. `delivered_at` is `promised_at` plus `days_late`.
- **Consent first:** the store only sends an event when the saved Telegram status is *Connected*. The server checks again.

Replies are shown in the Demo controls activity feed in plain words:

| Reply | Feed message |
| --- | --- |
| `{"ok":true,"sent":true,"case_id"}` | Sent to Mend. A Telegram message is on its way. |
| `{"sent":false,"reason":"not_connected"}` (or not connected in the store) | Not sent: the shopper has not connected Telegram. The store also switches its status to *Not connected*. |
| `{"sent":false,"reason":"open_case"}` | Held: Mend already has an open case with this customer. One case at a time. |
| `{"sent":false,"reason":"duplicate"}` | Not sent: this order problem was already reported. |
| `{"sent":false,"reason":"on_time"}` or `"review_not_low"` | Not a problem, so no message. |
| HTTP 400, other errors, network failure or timeout | Could not reach Mend. The order still went through. |

In local mode the store shows a clearly labelled **simulated** token, does not check the code, fakes a successful connection after about 4 seconds, and sends nothing.

### Test with the mock API

`mock-api.js` is a small Node server (no dependencies) that copies the backend: the team-code check (403), connect, status, stop, delete, events, and every event reply (`sent`, `not_connected`, `open_case`, `duplicate`, `on_time`, `review_not_low`). It rejects bodies that don't match the formats above with HTTP 400.

```bash
MOCK_TEAM_CODE=choose-a-test-code node mock-api.js   # http://localhost:8787, key "test-key"
```

Then, in a local copy of `config.js`, set `API_URL: "http://localhost:8787"` and `API_KEY: "test-key"`, and type your test code on the Account page. The mock pretends the shopper pressed *Start* in Telegram 5 seconds after asking for a link. To see `duplicate`, use *Reset demo* (order numbers restart at LH-1001) and make the same order late again. `GET http://localhost:8787/__inspect` shows what it received; the team code is never logged.

### Automated browser test

`tests/e2e.js` runs the whole flow in Chromium with Playwright. It covers local mode, API mode against the mock (wrong code, waiting, connected, and every feed message, including 400 and network failure), the shipped config with all calls to the live backend blocked, 360/768/1280 widths, dark mode, reduced motion, blocked storage and corrupt storage. It saves screenshots and fails on any console error.

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

- `API_KEY` is visible to anyone who views the page source. It is only a basic filter. The real protection is that the server refuses to connect Telegram without the team code, and only sends messages to people who connected.
- The backend only accepts requests from the GitHub Pages site. Local copies need local mode or the mock.
- Data lives in this browser's `localStorage` (key `lumen_store_v2`). Another browser or device is a different shopper. If storage is blocked, the shop still works but forgets everything when the tab closes. If saved data is corrupt, it is reset.
- Delivery dates are simulated: *Deliver 9 days late* sets the delivery date in the future relative to today.
- Ratings and reviews are fictional, and the shop never shows impact numbers.
