// End-to-end test for Lumen Home.
// Setup (once, outside the app):  npm install --no-save playwright && npx playwright install chromium
// Run from the project folder:     node tests/e2e.js . shots
//
// The real Mend backend is never called: config.js is replaced per test server, and any request
// to the live n8n host is blocked and counted.
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const OUT = path.resolve(process.argv[3] || "shots");
fs.mkdirSync(OUT, { recursive: true });

const MOCK_CODE = "MOCKCODE" + Math.floor(Math.random() * 1e6); // test-only code for the mock server
const LIVE_HOST = /smc1\.app\.n8n\.cloud/;
const MOCK = "http://localhost:8787";
const T = {
  sent: "Sent to Mend. A Telegram message is on its way.",
  notConnected: "Not sent: the shopper has not connected Telegram.",
  held: "Held: Mend already has an open case with this customer. One case at a time.",
  duplicate: "Not sent: this order problem was already reported.",
  notProblem: "Not a problem, so no message.",
  failed: "Could not reach Mend. The order still went through.",
  wrongCode: "That code is not right. Telegram messages are only enabled for the demo team."
};

const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond });
  console.log((cond ? "PASS " : "FAIL ") + name + (extra && !cond ? "  -> " + JSON.stringify(extra).slice(0, 600) : ""));
}

// Static server; config.js is rewritten per port.
function staticServer(port, cfg) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };
  return new Promise(r => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/") p = "/index.html";
      if (p === "/config.js") {
        res.writeHead(200, { "content-type": "text/javascript" });
        return res.end("window.LUMEN_CONFIG = " + JSON.stringify(Object.assign({ DELIVERY_FEE: 6.9, PROMISE_DAYS: 5, BOT_URL: "https://t.me/mend_by_smc_bot", API_URL: "", API_KEY: "", TEAM_CODE: "", TEAM_NAMES: [] }, cfg)) + ";");
      }
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end("nf"); }
      res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    }).listen(port, () => r(s));
  });
}
function startMock(port, extraEnv) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(ROOT, "mock-api.js")], { env: Object.assign({}, process.env, { PORT: String(port) }, extraEnv) });
    p.stdout.on("data", d => { const t = d.toString(); process.stdout.write("  [mock " + port + "] " + t); if (t.includes("Mock Mend API")) resolve(p); });
    p.stderr.on("data", d => process.stdout.write("  [mock err] " + d));
  });
}
const getJSON = url => new Promise((res, rej) => http.get(url, { agent: false }, r => { let b = ""; r.on("data", c => b += c); r.on("end", () => res(JSON.parse(b))); }).on("error", rej));

function watch(page, label) {
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(label + ": " + m.text()); });
  page.on("pageerror", e => errors.push(label + " pageerror: " + e.message));
  return errors;
}
async function shot(page, name, full = true) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: full });
}
async function blockLive(ctx) {
  const hits = [];
  await ctx.route(LIVE_HOST, r => { hits.push(r.request().url()); return r.abort(); });
  return hits;
}
async function firstFeedText(page) {
  await page.click("#demo-tab");
  await page.waitForSelector("#demo-drawer[open] .feed li");
  const t = await page.locator(".feed li").first().textContent();
  return t;
}
async function closeDrawer(page) {
  if (await page.locator("#demo-drawer[open]").count()) await page.keyboard.press("Escape");
}

(async () => {
  const sLocal = await staticServer(5173, {});                                              // local mode
  const sApi = await staticServer(5174, { API_URL: MOCK, API_KEY: "test-key" });            // API mode -> mock
  const mock = await startMock(8787, { MOCK_TEAM_CODE: MOCK_CODE, MOCK_CONNECT_MS: "4000" });
  const browser = await chromium.launch();
  const allErrors = [];

  try {
    // ---------- A. file:// with the shipped config (live API_URL, but every live call is blocked) ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const hits = await blockLive(ctx);
      const page = await ctx.newPage();
      const errs = watch(page, "file");
      const shipped = fs.readFileSync(path.join(ROOT, "config.js"), "utf8");
      check("shipped config points at the n8n webhook", shipped.includes("https://smc1.app.n8n.cloud/webhook/mend-store"));
      check("shipped config keeps TEAM_CODE empty", /TEAM_CODE:\s*""/.test(shipped) && /TEAM_NAMES:\s*\[\]/.test(shipped));
      await page.goto(pathToFileURL(path.join(ROOT, "index.html")).href);
      await page.waitForSelector(".tile");
      check("file:// home renders 18 products", (await page.locator(".tile").count()) === 18);
      check("demo banner visible", await page.getByText("Demo store. No real payments or deliveries.").isVisible());
      await page.goto(pathToFileURL(path.join(ROOT, "index.html")).href + "#/account");
      await page.fill("#acc-name", "Mei");
      await page.click("text=Create account");
      await page.waitForSelector("#team-code");
      check("shipped config: team code box shown (server checks it)", await page.locator("#team-code").isVisible());
      check("shipped config: no local-mode note", !(await page.getByText("Local mode.").count()));
      check("browsing never called the live API", hits.length === 0, hits);
      allErrors.push(...errs);
      await ctx.close();
    }

    // ---------- B. Local mode, full flow ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      const errs = watch(page, "local");
      const requests = [];
      page.on("request", r => { if (!r.url().startsWith("http://localhost:5173")) requests.push(r.url()); });
      await page.goto("http://localhost:5173/#/");
      await page.waitForSelector(".hero.is-lit");
      await shot(page, "01-home-1280", false);

      await page.fill("#q", "lamp");
      check("search 'lamp' -> 2 products", (await page.locator(".tile").count()) === 2);
      await page.fill("#q", "");
      await page.click(".tab[data-cat='Kitchen']");
      check("Kitchen filter -> 3", (await page.locator(".tile").count()) === 3);
      await page.click(".tab[data-cat='All']");

      await page.goto("http://localhost:5173/#/p/halo-lamp");
      await page.waitForSelector("h1:has-text('Halo floor lamp')");
      check("review form locked before delivery", await page.getByText("after it has been delivered").isVisible());
      await page.click(".product button:has-text('Add to basket')");
      await page.goto("http://localhost:5173/#/cart");
      await page.click("text=Save name and place order");
      check("empty name shows error", await page.getByText("Please enter a first name.").isVisible());
      await page.fill("#cart-name", "Wei Ling");
      await page.click("text=Save name and place order");
      check("name with a space rejected (server format: letters only)", await page.getByText("Please use letters only").isVisible());
      check("name box limited to 20 characters", (await page.getAttribute("#cart-name", "maxlength")) === "20");
      await page.fill("#cart-name", "Mei");
      await page.click("text=Save name and place order");
      await page.waitForSelector("h2:has-text('Order LH-1001')");

      await page.goto("http://localhost:5173/#/account");
      await page.waitForSelector("#team-code");
      check("local: connect disabled until a code is typed", await page.locator("button[data-key='tg-connect']").isDisabled());
      check("local mode note says code not checked", await page.getByText("the code is not checked").isVisible());
      await page.fill("#team-code", "anything");
      check("local: connect enabled after typing", !(await page.locator("button[data-key='tg-connect']").isDisabled()));
      await page.click("button[data-key='tg-connect']");
      await page.waitForSelector(".sim-token");
      check("simulated token shown and labelled", (await page.locator(".sim-token").textContent()).startsWith("SIMULATED-"));
      await page.waitForSelector(".status--connected", { timeout: 15000 });
      check("simulated token hidden after connect", (await page.locator(".sim-token").count()) === 0);

      await page.click("#demo-tab");
      await page.click("button[data-key='dl-LH-1001-9']");
      await page.waitForSelector(".chip--late");
      check("drawer closed after deliver", !(await page.locator("#demo-drawer[open]").count()));
      const f1 = await firstFeedText(page);
      check("local: late event recorded locally", f1.includes("Late delivery") && f1.includes("Local mode"), f1);
      await page.click(".feed button:has-text('Preview message')");
      const msg = await page.locator(".message").textContent();
      check("preview mentions name, product, days, fee; no discounts", msg.includes("Hi Mei") && msg.includes("Halo floor lamp") && msg.includes("9 days late") && msg.includes("S$6.90") && !/discount|voucher|coupon/i.test(msg), msg);
      await page.keyboard.press("Escape");
      await closeDrawer(page);

      await page.goto("http://localhost:5173/#/p/halo-lamp/review");
      await page.click("label[for='star-1']");
      await page.fill("#review-text", "Arrived very late and the box was <b>crushed</b>.");
      await page.click("text=Publish review");
      await page.waitForSelector(".badge:has-text('Your review')");
      check("review text shown literally", (await page.locator(".review-list li").first().textContent()).includes("<b>crushed</b>"));

      await page.goto("http://localhost:5173/#/account");
      await page.click("text=Disconnect and stop messages");
      check("STOP hint after disconnect", await page.getByText("type STOP in Telegram").first().isVisible());
      await page.goto("http://localhost:5173/#/p/mug-set");
      await page.click(".product button:has-text('Add to basket')");
      await page.goto("http://localhost:5173/#/cart");
      await page.click("text=Place order");
      await page.waitForSelector("h2:has-text('Order LH-1002')");
      await page.click("#demo-tab");
      await page.click("button[data-key='dl-LH-1002-2']");
      const f2 = await firstFeedText(page);
      check("local: not connected -> plain 'Not sent' message", f2.includes(T.notConnected), f2);
      await closeDrawer(page);

      await page.goto("http://localhost:5173/#/staff");
      await page.waitForSelector("table");
      check("local staff view shows 3 events with product column", (await page.locator("tbody tr").count()) === 3 && (await page.locator("th:has-text('Product')").count()) === 1);
      // present mode, quick start, 404, reset, corrupt storage
      await page.click("#demo-tab");
      await page.check("input[data-key='present']");
      check("present mode hides tab", !(await page.locator("#demo-tab").isVisible()));
      await page.keyboard.press("Escape");
      await page.click("#exit-present-btn");
      await page.click("#quickstart-btn");
      check("quick start has 4 steps", (await page.locator(".steps li").count()) === 4);
      await page.keyboard.press("Escape");
      await page.goto("http://localhost:5173/#/nope");
      check("404 page", await page.getByText("We couldn't find that page.").isVisible());
      await page.goto("http://localhost:5173/#/");
      await page.evaluate(() => localStorage.setItem("lumen_store_v2", "{not json"));
      await page.reload();
      await page.waitForSelector(".tile");
      check("corrupt storage handled", await page.getByText("could not be read").first().isVisible());
      check("local mode made no network calls outside the site", requests.length === 0, requests);
      allErrors.push(...errs);
      await ctx.close();
    }

    // ---------- C. API mode against the mock ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const liveHits = await blockLive(ctx);
      await ctx.route(/t\.me/, r => r.fulfill({ status: 200, contentType: "text/html", body: "<title>Telegram (stub)</title>" }));
      const page = await ctx.newPage();
      const errs = watch(page, "api");
      const popups = [];
      ctx.on("page", p => popups.push(p));

      // Optional override of the reply to problem events / connect, to reach every reply type.
      let override = null;
      let eventAttempts = 0;
      await page.route(MOCK + "/**", async route => {
        const req = route.request();
        if (req.method() !== "POST") return route.continue();
        let body = {};
        try { body = JSON.parse(req.postData() || "{}"); } catch (e) { /* ignore */ }
        const isEvent = body.action === "late_delivery" || body.action === "bad_review";
        if (isEvent) eventAttempts++;
        if (override && override.match(body)) {
          if (override.abort) return route.abort("connectionrefused");
          return route.fulfill({ status: override.status || 200, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: JSON.stringify(override.reply) });
        }
        return route.continue();
      });
      const onEvent = b => b.action === "late_delivery" || b.action === "bad_review";

      async function order(ids, expectId) {
        for (const id of ids) {
          await page.goto("http://localhost:5174/#/p/" + id);
          await page.click(".product button:has-text('Add to basket')");
        }
        await page.goto("http://localhost:5174/#/cart");
        await page.click("text=Place order");
        await page.waitForSelector("h2:has-text('Order " + expectId + "')");
      }
      async function deliverLate(id, days) {
        await page.click("#demo-tab");
        await page.click(`button[data-key='dl-${id}-${days}']`);
        await page.waitForSelector(".chip--late");
      }
      async function waitFeedSettled() {
        await page.waitForFunction(() => {
          try { const s = JSON.parse(localStorage.getItem("lumen_store_v2")); return s.events.every(e => e.status !== "sending"); } catch (e) { return false; }
        }, null, { timeout: 15000 });
      }

      await page.goto("http://localhost:5174/#/account");
      await page.fill("#acc-name", "Mei");
      await page.click("text=Create account");
      await page.waitForSelector("#team-code");
      check("API: connect disabled until a code is typed", await page.locator("button[data-key='tg-connect']").isDisabled());
      await shot(page, "api-01-account-not-connected");

      // wrong code -> 403 team_only
      await page.fill("#team-code", "not-the-code");
      await page.click("button[data-key='tg-connect']");
      await page.waitForSelector("#team-error");
      check("403 shows the team-only message", (await page.locator("#team-error").textContent()) === T.wrongCode);
      check("status stays Not connected after 403", await page.locator(".status--none").isVisible());
      await page.waitForTimeout(300);
      check("blank tab closed after 403", ctx.pages().length === 1, ctx.pages().length);
      check("code box emptied after submit", (await page.inputValue("#team-code")) === "");
      await shot(page, "api-02-account-wrong-code");

      // right code -> token -> waiting -> connected
      await page.fill("#team-code", MOCK_CODE);
      await page.click("button[data-key='tg-connect']");
      await page.waitForSelector(".status--waiting");
      await page.waitForTimeout(800);
      const tgUrl = popups.length ? popups[popups.length - 1].url() : "";
      check("Telegram link opened with start token", /^https:\/\/t\.me\/mend_by_smc_bot\?start=[0-9a-f]{24}$/.test(tgUrl), tgUrl);
      check("token not displayed in page", !(await page.content()).includes(tgUrl.split("start=")[1] || "zzzz"));
      await shot(page, "api-03-account-waiting");
      await page.waitForSelector(".status--connected", { timeout: 20000 });
      await shot(page, "api-04-account-connected");
      const stored = await page.evaluate(() => localStorage.getItem("lumen_store_v2"));
      check("team code never stored in the browser", !stored.includes(MOCK_CODE));
      check("team code never shown in the page", !(await page.content()).includes(MOCK_CODE));

      // 1) sent
      await order(["halo-lamp", "candle-trio"], "LH-1001");
      await deliverLate("LH-1001", 9);
      await waitFeedSettled();
      let f = await firstFeedText(page);
      check("feed: sent", f.includes(T.sent), f);
      await closeDrawer(page);
      let inspect = await getJSON(MOCK + "/__inspect");
      const late = inspect.received.find(e => e.action === "late_delivery");
      const keys = late ? Object.keys(late) : [];
      const expected = ["action", "event_type", "customer_id", "first_name", "order_id", "product_id", "product_name", "category", "order_value", "delivery_fee", "days_late", "review_score", "review_text", "promised_at", "delivered_at", "prior_orders", "telegram_connected"];
      check("event body = action + first-prompt payload", JSON.stringify(keys) === JSON.stringify(expected), keys);
      check("late payload values", late && late.action === "late_delivery" && late.event_type === "late_delivery" && /^c_[a-z0-9]{4,24}$/.test(late.customer_id) &&
        late.product_id === "halo-lamp" && late.order_value === 163.9 && late.days_late === 9 && late.review_score === null && late.prior_orders === 0, late);
      console.log("  late body:", JSON.stringify(late));

      // 2) held (open case)
      await order(["mug-set"], "LH-1002");
      await deliverLate("LH-1002", 2);
      await waitFeedSettled();
      f = await firstFeedText(page);
      check("feed: held (open case)", f.includes(T.held), f);
      await closeDrawer(page);

      // bad_review payload goes through too (also held, since a case is open)
      await page.goto("http://localhost:5174/#/p/candle-trio/review");
      await page.click("label[for='star-2']");
      await page.fill("#review-text", "Two candles had cracked glass.");
      await page.click("text=Publish review");
      await waitFeedSettled();
      inspect = await getJSON(MOCK + "/__inspect");
      const bad = inspect.received.find(e => e.action === "bad_review");
      check("bad_review body", bad && bad.event_type === "bad_review" && bad.review_score === 2 && bad.review_text === "Two candles had cracked glass." && bad.days_late === 9 && bad.order_id === "LH-1001", bad);
      await page.click("#demo-tab");
      await shot(page, "api-05-feed-sent-held", false);
      await closeDrawer(page);

      // 3) not a problem: on_time and review_not_low (server replies forced)
      override = { match: onEvent, reply: { ok: true, sent: false, reason: "on_time" } };
      await order(["pantry-jars"], "LH-1003");
      await deliverLate("LH-1003", 2);
      await waitFeedSettled();
      f = await firstFeedText(page);
      check("feed: on_time -> not a problem", f.includes(T.notProblem), f);
      await closeDrawer(page);
      override = { match: onEvent, reply: { ok: true, sent: false, reason: "review_not_low" } };
      await page.goto("http://localhost:5174/#/p/mug-set/review");
      await page.click("label[for='star-1']");
      await page.fill("#review-text", "Chipped on arrival.");
      await page.click("text=Publish review");
      await waitFeedSettled();
      f = await firstFeedText(page);
      check("feed: review_not_low -> not a problem", f.includes(T.notProblem), f);
      await closeDrawer(page);

      // 4) 400 -> could not reach Mend, no retry
      override = { match: onEvent, status: 400, reply: { error: "bad_request" } };
      eventAttempts = 0;
      await order(["hook-rail"], "LH-1004");
      await deliverLate("LH-1004", 9);
      await waitFeedSettled();
      f = await firstFeedText(page);
      check("feed: 400 -> could not reach Mend", f.includes(T.failed), f);
      check("400 is not retried", eventAttempts === 1, eventAttempts);
      check("order still went through after 400", (await page.locator("h2:has-text('Order LH-1004')").count()) === 1);
      await closeDrawer(page);

      // 5) network failure -> could not reach Mend, retried twice, UI not blocked
      override = { match: onEvent, abort: true };
      eventAttempts = 0;
      await order(["jute-rug"], "LH-1005");
      await page.click("#demo-tab");
      await page.click("button[data-key='dl-LH-1005-9']");
      check("UI not blocked while sending", await page.locator(".chip--late").first().isVisible());
      await waitFeedSettled();
      f = await firstFeedText(page);
      check("feed: network error -> could not reach Mend", f.includes(T.failed), f);
      check("network error retried (3 attempts)", eventAttempts === 3, eventAttempts);
      await shot(page, "api-06-feed-not-problem-failed", false);
      await closeDrawer(page);

      // 6) server says not_connected (shopper typed STOP) -> message + status flips
      override = { match: onEvent, reply: { ok: true, sent: false, reason: "not_connected" } };
      await order(["knit-throw"], "LH-1006");
      await deliverLate("LH-1006", 2);
      await waitFeedSettled();
      f = await firstFeedText(page);
      check("feed: server not_connected", f.includes(T.notConnected), f);
      await closeDrawer(page);
      await page.goto("http://localhost:5174/#/account");
      check("server not_connected flips status to Not connected", await page.locator(".status--none").isVisible());
      override = null;

      // 7) reconnect while the server still has us -> {ok, connected:true} straight away
      const pagesBefore = ctx.pages().length;
      await page.fill("#team-code", MOCK_CODE);
      await page.click("button[data-key='tg-connect']");
      await page.waitForSelector(".status--connected", { timeout: 5000 });
      await page.waitForTimeout(300);
      check("connected:true reply -> Connected, no Telegram tab left open", ctx.pages().length === pagesBefore, [pagesBefore, ctx.pages().length]);

      // 8) duplicate: reset demo, order ids restart at LH-1001, same problem again
      await page.click("#demo-tab");
      await page.click("button[data-key='reset']");
      await page.click("#confirm-dialog button:has-text('Reset demo')");
      await closeDrawer(page);
      await order(["halo-lamp"], "LH-1001");
      await deliverLate("LH-1001", 9);
      await waitFeedSettled();
      f = await firstFeedText(page);
      check("feed: duplicate", f.includes(T.duplicate), f);
      await closeDrawer(page);

      // 9) client-side consent: disconnect, then nothing is sent
      await page.goto("http://localhost:5174/#/account");
      await page.click("text=Disconnect and stop messages");
      eventAttempts = 0;
      await order(["ember-lamp"], "LH-1002");
      await deliverLate("LH-1002", 2);
      await waitFeedSettled();
      f = await firstFeedText(page);
      check("feed: not connected (client check)", f.includes(T.notConnected), f);
      check("nothing sent while not connected", eventAttempts === 0, eventAttempts);
      await shot(page, "api-07-feed-duplicate-not-connected", false);
      await closeDrawer(page);

      // staff view from the API
      await page.goto("http://localhost:5174/#/staff");
      await page.waitForSelector("tbody tr");
      const rows = await page.locator("tbody tr").count();
      check("staff view loads events from API", rows >= 4 && (await page.getByText("Source: Mend API").isVisible()), rows);
      const firstRow = await page.locator("tbody tr").first().textContent();
      check("staff view newest first, with product", firstRow.includes("Halo floor lamp") && firstRow.includes("Already reported"), firstRow);
      check("staff view shows no case ids or tokens", !(await page.content()).match(/case_[0-9a-f]{8}|start=/));
      await shot(page, "api-08-staff");

      // delete
      await page.goto("http://localhost:5174/#/account");
      await page.click("button[data-key='delete']");
      await page.click("#confirm-dialog button:has-text('Delete my data')");
      await page.waitForTimeout(800);
      inspect = await getJSON(MOCK + "/__inspect");
      const acts = inspect.actions.map(a => a.action);
      check("connect/status/stop/delete/events reached the API", ["connect", "status", "stop", "delete", "events"].every(a => acts.includes(a)), acts);
      check("connect sends team_code (mock never logs it)", inspect.actions.filter(a => a.action === "connect").every(a => a.team_code === "(hidden)"));
      check("API mode never touched the live backend", liveHits.length === 0, liveHits);
      // 403 and a deliberately aborted request both log a console error in Chromium; those are expected here.
      allErrors.push(...errs.filter(e => !/status of 40[03]|ERR_CONNECTION_REFUSED|Failed to load resource/.test(e)));
      await ctx.close();
    }

    // ---------- E. responsive + dark mode screenshots ----------
    for (const [w, hgt, scheme, name] of [[360, 780, "light", "mobile-360"], [768, 1024, "light", "tablet-768"], [1280, 900, "dark", "dark-1280"], [360, 780, "dark", "dark-360"]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, colorScheme: scheme });
      const page = await ctx.newPage();
      const errs = watch(page, name);
      await page.goto("http://localhost:5173/#/");
      await page.waitForSelector(".hero.is-lit");
      await shot(page, "20-" + name + "-home", false);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      check(name + ": no horizontal scroll on home", !overflow);
      await page.goto("http://localhost:5173/#/p/fern-chair");
      await page.waitForSelector("h1");
      await page.click(".product button:has-text('Add to basket')");
      await page.goto("http://localhost:5173/#/cart");
      await page.fill("#cart-name", "Mei");
      await page.click("text=Save name and place order");
      await page.waitForSelector(".order");
      await page.click("#demo-tab");
      await page.click("button[data-key='dl-LH-1001-9']");
      await page.waitForSelector(".chip--late");
      for (const route of ["#/cart", "#/account", "#/about", "#/staff"]) {
        await page.goto("http://localhost:5173/" + route);
        await page.waitForTimeout(150);
        const ov = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        check(name + ": no horizontal scroll on " + route, !ov);
      }
      await shot(page, "23-" + name + "-staff");
      await page.goto("http://localhost:5173/#/account");
      await shot(page, "24-" + name + "-account");
      allErrors.push(...errs);
      await ctx.close();
    }

    // ---------- F. reduced motion + structural checks ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      const errs = watch(page, "a11y");
      await page.goto("http://localhost:5173/#/");
      await page.waitForSelector(".hero.is-lit", { timeout: 1000 });
      check("reduced motion: lamp lit immediately", true);
      const imgs = await page.evaluate(() => [...document.images].map(i => ({ alt: i.getAttribute("alt"), w: i.getAttribute("width"), h: i.getAttribute("height") })));
      check("all images have alt + width/height", imgs.every(i => i.alt !== null && i.w && i.h));
      await page.goto("http://localhost:5173/#/account");
      await page.fill("#acc-name", "Mei");
      await page.click("text=Create account");
      for (const route of ["#/", "#/p/halo-lamp", "#/cart", "#/orders", "#/account", "#/about", "#/staff", "#/x"]) {
        await page.goto("http://localhost:5173/" + route);
        await page.waitForTimeout(100);
        const hs = await page.evaluate(() => [...document.querySelectorAll("main h1, main h2, main h3, main h4")].filter(h => h.offsetParent !== null).map(h => +h.tagName[1]));
        let ok = hs[0] === 1 && hs.filter(x => x === 1).length === 1;
        for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) ok = false;
        check("headings in order on " + route, ok, hs);
        const unlabeled = await page.evaluate(() => [...document.querySelectorAll("input, select, textarea")].filter(el => {
          if (el.type === "hidden") return false;
          if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) return false;
          return !(el.id && document.querySelector("label[for='" + el.id + "']")) && !el.closest("label");
        }).map(el => el.id || el.name));
        check("all inputs labelled on " + route, unlabeled.length === 0, unlabeled);
      }
      await page.goto("about:blank");
      await page.goto("http://localhost:5173/#/");
      await page.waitForSelector(".tile");
      await page.keyboard.press("Tab");
      check("first Tab focuses skip link", await page.evaluate(() => document.activeElement.className) === "skip-link");
      const cls = await page.evaluate(() => new Promise(res => {
        let total = 0;
        new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) total += e.value; }).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => res(total), 1500);
      }));
      check("cumulative layout shift < 0.05", cls < 0.05, cls);
      const src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8") + fs.readFileSync(path.join(ROOT, "api.js"), "utf8");
      check("no innerHTML/outerHTML/insertAdjacentHTML in code", !/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/.test(src));
      allErrors.push(...errs);
      await ctx.close();
    }

    // ---------- G. storage blocked ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); });
      const page = await ctx.newPage();
      const errs = watch(page, "nostorage");
      await page.goto("http://localhost:5173/#/");
      await page.waitForSelector(".tile");
      await page.click(".tile button >> nth=0");
      check("works with storage blocked", (await page.textContent("#basket-count")) === "1");
      check("storage note shown", await page.locator("#storage-note").isVisible());
      allErrors.push(...errs);
      await ctx.close();
    }
  } catch (e) {
    console.log("CRASH", e);
    results.push({ name: "crash: " + e.message, ok: false });
  } finally {
    check("zero unexpected console errors", allErrors.length === 0, allErrors);
    await browser.close();
    mock.kill();
    sLocal.close(); sApi.close();
    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) { console.log("FAILED:\n - " + failed.map(f => f.name).join("\n - ")); process.exitCode = 1; }
  }
})();
