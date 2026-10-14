// Lumen Home settings. Edit these values, then reload the page.
// API_URL empty -> "local mode": events are recorded in the demo feed only, nothing is sent.
// API_KEY is visible to anyone who views the page source. It is only a basic filter;
// the Mend server checks the team code before connecting Telegram.
// TEAM_CODE / TEAM_NAMES are no longer used by the store (the server checks the code). Keep them empty.
window.LUMEN_CONFIG = {
  DELIVERY_FEE: 6.9, PROMISE_DAYS: 5,
  BOT_URL: "https://t.me/mend_by_smc_bot",
  API_URL: "https://smc1.app.n8n.cloud/webhook/mend-store", API_KEY: "lh_9a754c53c17d4ff09b2b03f2",
  TEAM_CODE: "", TEAM_NAMES: []
};
