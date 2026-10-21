# Lumen Home: demo store for Mend

Lumen Home is a **fictional** home-goods shop and the live demo for **Mend** ("Fix the order, keep the customer"). When an order goes wrong, Mend, an AI assistant on Telegram, messages the customer with a fix. Judges can cause problems on stage: a late delivery or a low review.

There are no real payments, addresses or deliveries. The shop asks for a name, email, mobile and delivery address like a real shop (made-up details are fine, kept in the browser only). Mend only ever receives the first name and a random customer id.

Live site: https://zhenkang01.github.io/lumen-home/

## Run it

- Double-click `index.html`. It runs from the folder in **local mode**: events appear in the demo feed and nothing is sent anywhere.
- Or serve the folder: `python -m http.server 8000`, then open http://localhost:8000.

Plain HTML, CSS and JavaScript. No build step, no packages.

To host it: push to GitHub and turn on *Settings → Pages → Deploy from branch → main / root*.

## The demo, step by step

The **Quick start for judges** button in the top bar shows these steps on screen.

1. **Account:** fill in the sign-up form. Add `?demo` to the URL for a link that fills in Mei's details.
2. **Connect Telegram:** enter the team code in *Account*, press *Connect Telegram*, then tap *Start* in the bot. The status changes to *Connected*.
3. **Order:** add items to the basket and place the order.
4. **Demo controls** (bottom left): choose *Deliver on time*, *Deliver 2 days late* or *Deliver 9 days late*. A late delivery sends a `late_delivery` event to Mend.
5. **Review:** after delivery, press *Review* on an item. 2 stars or lower sends a `bad_review` event.
6. **Watch Telegram.** If it is slow, use **Preview message** in the Demo controls feed.

Demo controls also has **Present mode** (bigger text; reopen the drawer with Shift + D) and **Reset demo**. The staff view is at `#/staff`.

## Settings (`config.js`)

| Setting | What it does |
| --- | --- |
| `API_URL` | The Mend backend (an n8n webhook). Empty means local mode. |
| `API_KEY` | Sent as the `x-api-key` header. Visible in the page source, so it is only a basic filter, not security. |
| `BOT_URL` | Mend's Telegram bot. |
| `DELIVERY_FEE`, `PROMISE_DAYS` | S$6.90 delivery; orders promised 5 days after they are placed. |
| `TEAM_CODE`, `TEAM_NAMES` | Not used. Leave empty. The server checks the team code. |

## How it talks to Mend

The store sends JSON `POST` requests to `API_URL`: `connect`, `status`, `stop`, `delete`, `events`, `voucher`, `redeem`, plus the two problem events `late_delivery` (delivered 1 or more days late) and `bad_review` (rating 2 or below). The store only sends an event when the shopper has connected Telegram, and the server checks again. Each call has an 8 second timeout and never blocks the shop.

For the full request and reply formats, read `api.js` and `mock-api.js`.

## Tests

```bash
node mock-api.js                 # fake backend on http://localhost:8787
npm install --no-save playwright && npx playwright install chromium
node tests/e2e.js . shots        # full browser test
```

## Privacy and responsible AI

- The shop collects name, email, mobile and address (invented is fine, browser only). Mend gets only the first name and a random customer id. No password or card fields.
- *How Mend uses your data* on the Account page explains what is used, who sees it and how to stop.
- Mend is an AI. A person can be requested at any time, and refunds are limited to the delivery fee.
- *Delete my data* clears this browser and tells the backend to delete the customer.

## Known limits

- The backend only accepts requests from the GitHub Pages site. Local copies need local mode or the mock API.
- Data is kept in this browser's `localStorage`. Another browser or device is a different shopper.
- Delivery dates, ratings and reviews are simulated.
