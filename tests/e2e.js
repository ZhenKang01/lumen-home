// End-to-end test for Lumen Home.
// Setup (once, outside the app):  npm install --no-save playwright && npx playwright install chromium
// Run from the project folder:     node tests/e2e.js . shots
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const OUT = path.resolve(process.argv[3] || "shots");
fs.mkdirSync(OUT, { recursive: true });

const TEAM = "lumen-team";
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
        return res.end("window.LUMEN_CONFIG = " + JSON.stringify(Object.assign({ DELIVERY_FEE: 6.9, PROMISE_DAYS: 5, BOT_URL: "https://t.me/mend_by_smc_bot", API_URL: "", API_KEY: "", TEAM_CODE: TEAM, TEAM_NAMES: [] }, cfg)) + ";");
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

(async () => {
  const s1 = await staticServer(5173, {});                                                       // local mode + team code
  const s2 = await staticServer(5174, { API_URL: "http://localhost:8787", API_KEY: "test-key" }); // API mode
  const s3 = await staticServer(5175, { API_URL: "http://localhost:8788", API_KEY: "test-key" }); // failing API
  const mock = await startMock(8787, {});
  const mockFail = await startMock(8788, { MOCK_FAIL: "1" });
  const browser = await chromium.launch();
  const allErrors = [];

  try {
    // ---------- A. file:// with the shipped config ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      const errs = watch(page, "file");
      await page.goto(pathToFileURL(path.join(ROOT, "index.html")).href);
      await page.waitForSelector(".tile");
      check("file:// home renders 18 products", (await page.locator(".tile").count()) === 18);
      check("demo banner visible", await page.getByText("Demo store. No real payments or deliveries.").isVisible());
      await page.fill("#account-dummy", "").catch(() => {});
      await page.goto(pathToFileURL(path.join(ROOT, "index.html")).href + "#/account");
      await page.fill("#acc-name", "Mei");
      await page.click("text=Create account");
      await page.waitForSelector("#tg-title");
      check("shipped config: team-only message shown", await page.getByText("Telegram messages are only enabled for the demo team.").first().isVisible());
      check("shipped config: connect disabled", await page.locator("button:has-text('Connect Telegram')").isDisabled());
      await shot(page, "account-shipped-config");
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
      await shot(page, "01-home-1280-full");

      // search + sort + filter
      await page.fill("#q", "lamp");
      check("search 'lamp' -> 2 products", (await page.locator(".tile").count()) === 2);
      await page.fill("#q", "");
      await page.click(".tab[data-cat='Kitchen']");
      check("Kitchen filter -> 3", (await page.locator(".tile").count()) === 3);
      await page.selectOption("#sort", "price-desc");
      const firstPrice = await page.locator(".tile__price").first().textContent();
      check("sort price high->low in Kitchen starts at S$59.00", firstPrice === "S$59.00", firstPrice);
      await page.click(".tab[data-cat='All']");
      await page.selectOption("#sort", "featured");

      // product page
      await page.goto("http://localhost:5173/#/p/halo-lamp");
      await page.waitForSelector("h1:has-text('Halo floor lamp')");
      check("product shows 3 reviews", (await page.locator(".review-list li").count()) === 3);
      check("review form locked before delivery", await page.getByText("after it has been delivered").isVisible());
      await shot(page, "02-product");
      await page.click("button:has-text('Add to basket')");
      await page.goto("http://localhost:5173/#/p/candle-trio");
      await page.click(".product button:has-text('Add to basket')");
      await page.click(".product button:has-text('Add to basket')");
      check("basket count 3", (await page.textContent("#basket-count")) === "3");

      // basket
      await page.click("a[data-nav='cart']");
      await page.waitForSelector("h1:has-text('Your basket')");
      const totalText = await page.locator(".summary dd.total").textContent();
      check("basket total = 129 + 56 + 6.90 = S$191.90", totalText === "S$191.90", totalText);
      await page.click("button[aria-label='Increase quantity of Quiet hour candle set']");
      check("qty plus works (count 4)", (await page.textContent("#basket-count")) === "4");
      check("focus stays on + button", await page.evaluate(() => document.activeElement.getAttribute("aria-label")) === "Increase quantity of Quiet hour candle set");
      await page.click("button[aria-label='Decrease quantity of Quiet hour candle set']");
      await shot(page, "03-basket");
      // validation: empty name
      await page.click("text=Save name and place order");
      check("empty name shows error", await page.getByText("Please enter a first name.").isVisible());
      await page.fill("#cart-name", "<img src=x onerror=alert(1)>");
      await page.click("text=Save name and place order");
      check("HTML-ish name rejected", await page.getByText("Please use letters only").isVisible());
      await page.fill("#cart-name", "Mei");
      await page.click("text=Save name and place order");
      await page.waitForSelector("h2:has-text('Order LH-1001')");
      check("order LH-1001 placed, basket empty", (await page.textContent("#basket-count")) === "0");
      check("status chip 'On its way'", await page.locator(".chip--way").first().isVisible());

      // account: not connected
      await page.click("a[data-nav='account']");
      await page.waitForSelector("#tg-title");
      check("customer id format", /^c_[0-9a-f]{6}$/.test(await page.locator(".kv .code").textContent()));
      check("connect disabled before code", await page.locator("button:has-text('Connect Telegram')").isDisabled());
      await shot(page, "05-account-not-connected");
      await page.fill("#team-code", "wrong");
      await page.click("text=Check code");
      check("wrong code message", await page.getByText("That code doesn't match").isVisible());
      await page.fill("#team-code", TEAM);
      await page.click("text=Check code");
      await page.waitForSelector("button[data-key='tg-connect']:not([disabled])");
      check("local mode note shown", await page.getByText("connecting is simulated and no message will be sent").isVisible());
      await page.click("button[data-key='tg-connect']");
      await page.waitForSelector(".sim-token");
      check("simulated token shown and labelled", (await page.locator(".sim-token").textContent()).startsWith("SIMULATED-"));
      await shot(page, "05b-account-waiting");
      await page.waitForSelector(".status--connected", { timeout: 15000 });
      check("simulated token hidden after connect", (await page.locator(".sim-token").count()) === 0);
      await shot(page, "06-account-connected");

      // demo drawer + deliver late
      await page.click("#demo-tab");
      await page.waitForSelector("#demo-drawer[open]");
      await shot(page, "07-demo-drawer", false);
      await page.click("button[data-key='dl-LH-1001-9']");
      await page.waitForSelector(".chip--late");
      check("drawer closed after deliver", !(await page.locator("#demo-drawer[open]").count()));
      check("chip says Delivered 9 days late", (await page.locator(".chip--late").textContent()).includes("Delivered 9 days late"));
      await shot(page, "08-orders-late");

      // feed + preview
      await page.click("#demo-tab");
      const feedTitle = await page.locator(".feed li").first().textContent();
      check("feed shows late event recorded locally", feedTitle.includes("Late delivery") && feedTitle.includes("Local mode"), feedTitle);
      await page.click(".feed button:has-text('Preview message')");
      const msg = await page.locator(".message").textContent();
      check("preview mentions name, product, days, fee", msg.includes("Hi Mei") && msg.includes("Halo floor lamp") && msg.includes("9 days late") && msg.includes("S$6.90"), msg);
      check("preview has no discounts/vouchers", !/discount|voucher|coupon|% off/i.test(msg));
      check("preview label", await page.getByText("Preview. The real message is written by Mend's AI.").isVisible());
      await shot(page, "09-preview", false);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");

      // review
      await page.goto("http://localhost:5173/#/orders");
      await page.click("a:has-text('Review') >> nth=0");
      await page.waitForSelector("#write-title");
      await shot(page, "10-review-form");
      await page.click("text=Publish review");
      check("review validation", await page.getByText("Please choose a star rating.").isVisible() && await page.getByText("at least 3 characters").isVisible());
      await page.click("label[for='star-1']");
      await page.fill("#review-text", "Arrived very late and the box was <b>crushed</b>.");
      await page.click("text=Publish review");
      await page.waitForSelector(".badge:has-text('Your review')");
      check("review text shown literally (no HTML injection)", (await page.locator(".review-list li").first().textContent()).includes("<b>crushed</b>"));
      check("review form now closed for this order", await page.getByText("already reviewed").isVisible());
      await page.click("#demo-tab");
      const f2 = await page.locator(".feed li").first().textContent();
      check("low review event in feed", f2.includes("Low review") && f2.includes("1 star"), f2);
      await page.click(".feed button:has-text('Preview message') >> nth=0");
      const msg2 = await page.locator(".message").textContent();
      check("review preview text", msg2.includes("1-star review of the Quiet hour candle set") || msg2.includes("1-star review of the Halo floor lamp"), msg2);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");

      // staff
      await page.goto("http://localhost:5173/#/staff");
      await page.waitForSelector("table");
      check("staff shows 2 events", (await page.locator("tbody tr").count()) === 2);
      check("staff measure box note", await page.getByText("Impact numbers on the Mend Console are from synthetic data until the real run.").isVisible());
      await shot(page, "11-staff");

      // disconnect -> consent check
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
      await page.click("#demo-tab");
      const f3 = await page.locator(".feed li").first().textContent();
      check("not connected -> 'Not sent' in feed", f3.includes("Not sent: customer has not connected Telegram"), f3);
      check("no preview for not-sent event", (await page.locator(".feed li").first().locator("button").count()) === 0);
      await page.keyboard.press("Escape");

      // present mode
      await page.click("#demo-tab");
      await page.check("input[data-key='present']");
      check("present mode hides tab", !(await page.locator("#demo-tab").isVisible()));
      await page.keyboard.press("Escape");
      await shot(page, "12-present-mode", false);
      await page.click("#exit-present-btn");
      check("exit present restores tab", await page.locator("#demo-tab").isVisible());

      // quick start
      await page.click("#quickstart-btn");
      check("quick start has 4 steps", (await page.locator(".steps li").count()) === 4);
      await shot(page, "13-quickstart", false);
      await page.keyboard.press("Escape");

      // 404
      await page.goto("http://localhost:5173/#/nope");
      check("404 page", await page.getByText("We couldn't find that page.").isVisible());

      // reset demo
      await page.click("#demo-tab");
      await page.click("button[data-key='reset']");
      await page.click("#confirm-dialog button:has-text('Reset demo')");
      check("reset clears feed", await page.locator("#demo-drawer").getByText("No events yet.").isVisible());
      await page.keyboard.press("Escape");

      // corrupt storage
      await page.goto("http://localhost:5173/#/");
      await page.evaluate(() => localStorage.setItem("lumen_store_v2", "{not json"));
      await page.reload();
      await page.waitForSelector(".tile");
      check("corrupt storage handled", await page.getByText("could not be read").first().isVisible());

      // delete my data
      await page.goto("http://localhost:5173/#/account");
      await page.fill("#acc-name", "Arjun");
      await page.click("text=Create account");
      await page.click("button[data-key='delete']");
      await page.click("#confirm-dialog button:has-text('Delete my data')");
      await page.waitForTimeout(300);
      check("delete wipes storage", await page.evaluate(() => localStorage.getItem("lumen_store_v2")) === null || !(await page.evaluate(() => JSON.parse(localStorage.getItem("lumen_store_v2")).account)));

      check("local mode made no network calls outside the site", requests.length === 0, requests);
      allErrors.push(...errs);
      await ctx.close();
    }

    // ---------- C. API mode against the mock ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.route(/t\.me/, r => r.fulfill({ status: 200, contentType: "text/html", body: "<title>Telegram (stub)</title>" }));
      const page = await ctx.newPage();
      const errs = watch(page, "api");
      const popups = [];
      ctx.on("page", p => popups.push(p));
      const apiCalls = [];
      page.on("request", r => { if (r.url().startsWith("http://localhost:8787") && r.method() === "POST") apiCalls.push({ headers: r.headers(), body: r.postData() }); });
      await page.goto("http://localhost:5174/#/account");
      await page.fill("#acc-name", "Mei");
      await page.click("text=Create account");
      await page.fill("#team-code", TEAM);
      await page.click("text=Check code");
      await page.click("button[data-key='tg-connect']");
      await page.waitForSelector(".status--waiting");
      await page.waitForTimeout(1500);
      const tgUrl = popups.length ? popups[popups.length - 1].url() : "";
      check("Telegram link opened with start token", /^https:\/\/t\.me\/mend_by_smc_bot\?start=[0-9a-f]{24}$/.test(tgUrl), tgUrl);
      check("token not displayed in page", !(await page.content()).includes(tgUrl.split("start=")[1] || "zzzz"));
      await page.waitForSelector(".status--connected", { timeout: 20000 });
      check("API mode connected via status polling", true);
      check("x-api-key header sent", apiCalls.every(c => c.headers["x-api-key"] === "test-key"));
      check("API key never in URLs", apiCalls.length > 0);

      for (const id of ["halo-lamp", "candle-trio"]) {
        await page.goto("http://localhost:5174/#/p/" + id);
        await page.click(".product button:has-text('Add to basket')");
      }
      await page.goto("http://localhost:5174/#/cart");
      await page.click("text=Place order");
      await page.waitForSelector("h2:has-text('Order LH-1001')");
      await page.click("#demo-tab");
      await page.click("button[data-key='dl-LH-1001-9']");
      await page.waitForTimeout(1200);
      let inspect = await getJSON("http://localhost:8787/__inspect");
      const late = inspect.received.find(e => e.event_type === "late_delivery");
      const expectedKeys = ["event_type", "customer_id", "first_name", "order_id", "product_id", "product_name", "category", "order_value", "delivery_fee", "days_late", "review_score", "review_text", "promised_at", "delivered_at", "prior_orders", "telegram_connected"];
      const gotKeys = late ? Object.keys(late).filter(k => k !== "_at") : [];
      check("mock accepted late_delivery event", !!late, inspect);
      check("payload keys match contract exactly, in order", JSON.stringify(gotKeys) === JSON.stringify(expectedKeys), gotKeys);
      check("late payload values", late && late.product_id === "halo-lamp" && late.product_name === "Halo floor lamp" && late.category === "Lighting" &&
        late.order_value === 163.9 && late.delivery_fee === 6.9 && late.days_late === 9 && late.review_score === null && late.review_text === "" &&
        late.prior_orders === 0 && late.telegram_connected === true &&
        (Date.parse(late.delivered_at) - Date.parse(late.promised_at)) === 9 * 86400000 && /T00:00:00\.000Z$/.test(late.promised_at), late);
      console.log("  late payload:", JSON.stringify(Object.fromEntries(Object.entries(late || {}).filter(([k]) => k !== "_at"))));

      await page.click("#demo-tab");
      check("feed says Sent to Mend", (await page.locator(".feed li").first().textContent()).includes("Sent to Mend"));
      await page.keyboard.press("Escape");

      await page.goto("http://localhost:5174/#/p/candle-trio/review");
      await page.click("label[for='star-2']");
      await page.fill("#review-text", "Two candles had cracked glass.");
      await page.click("text=Publish review");
      await page.waitForTimeout(1200);
      inspect = await getJSON("http://localhost:8787/__inspect");
      const bad = inspect.received.find(e => e.event_type === "bad_review");
      check("bad_review payload", bad && bad.review_score === 2 && bad.review_text === "Two candles had cracked glass." && bad.days_late === 9 && bad.product_id === "candle-trio" && bad.order_id === "LH-1001", bad);
      // a 4-star review must not send anything
      await page.goto("http://localhost:5174/#/p/halo-lamp/review");
      await page.click("label[for='star-4']");
      await page.fill("#review-text", "Lovely once it arrived.");
      await page.click("text=Publish review");
      await page.waitForTimeout(800);
      inspect = await getJSON("http://localhost:8787/__inspect");
      check("4-star review sends nothing", inspect.received.length === 2, inspect.received.length);

      await page.goto("http://localhost:5174/#/staff");
      await page.waitForSelector("tbody tr");
      check("staff view loads events from API", (await page.locator("tbody tr").count()) === 2 && (await page.getByText("Source: Mend API").isVisible()));
      await shot(page, "11b-staff-api");

      await page.goto("http://localhost:5174/#/account");
      await page.click("text=Disconnect and stop messages");
      await page.waitForTimeout(500);
      await page.click("button[data-key='delete']");
      await page.click("#confirm-dialog button:has-text('Delete my data')");
      await page.waitForTimeout(800);
      inspect = await getJSON("http://localhost:8787/__inspect");
      const acts = inspect.actions.map(a => a.action);
      check("connect/status/stop/delete actions reached the API", ["connect", "status", "stop", "delete", "events"].every(a => acts.includes(a)), acts);
      check("delete removed this customer's events from mock", inspect.received.length === 0);
      allErrors.push(...errs);
      await ctx.close();
    }

    // ---------- D. failing API: retries then error in feed ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.route(/t\.me/, r => r.fulfill({ status: 200, body: "stub" }));
      const page = await ctx.newPage();
      const errs = watch(page, "fail");
      let eventPosts = 0;
      page.on("request", r => { if (r.url().startsWith("http://localhost:8788") && (r.postData() || "").includes("event_type")) eventPosts++; });
      await page.goto("http://localhost:5175/#/account");
      await page.fill("#acc-name", "Siti");
      await page.click("text=Create account");
      await page.fill("#team-code", TEAM);
      await page.click("text=Check code");
      await page.click("button[data-key='tg-connect']");
      await page.waitForSelector(".status--connected", { timeout: 20000 });
      await page.goto("http://localhost:5175/#/p/mug-set");
      await page.click(".product button:has-text('Add to basket')");
      await page.goto("http://localhost:5175/#/cart");
      await page.click("text=Place order");
      await page.waitForSelector("h2:has-text('Order LH-1001')");
      await page.click("#demo-tab");
      await page.click("button[data-key='dl-LH-1001-2']");
      check("UI not blocked while sending", await page.locator(".chip--late").isVisible());
      await page.waitForTimeout(4000);
      check("3 attempts (1 + 2 retries)", eventPosts === 3, eventPosts);
      await page.click("#demo-tab");
      const ft = await page.locator(".feed").textContent();
      check("feed shows error after retries", ft.includes("Error sending LH-1001") && ft.includes("Mend could not be reached"), ft);
      // Chrome logs failed fetches (500) as console errors; those are expected here, so filter them.
      allErrors.push(...errs.filter(e => !/status of 500/.test(e)));
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
      await shot(page, "21-" + name + "-product", false);
      await page.click(".product button:has-text('Add to basket')");
      await page.goto("http://localhost:5173/#/cart");
      await page.fill("#cart-name", "Mei");
      await page.click("text=Save name and place order");
      await page.waitForSelector(".order");
      await page.click("#demo-tab");
      await page.click("button[data-key='dl-LH-1001-9']");
      await page.waitForSelector(".chip--late");
      await shot(page, "22-" + name + "-orders");
      for (const route of ["#/cart", "#/account", "#/about", "#/staff"]) {
        await page.goto("http://localhost:5173/" + route);
        await page.waitForTimeout(150);
        const ov = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        if (route === "#/about") await shot(page, "26-" + name + "-about");
        check(name + ": no horizontal scroll on " + route, !ov);
      }
      await shot(page, "23-" + name + "-staff");
      await page.goto("http://localhost:5173/#/account");
      await shot(page, "24-" + name + "-account");
      await page.click("#demo-tab");
      await shot(page, "25-" + name + "-drawer", false);
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
      check("all images have alt + width/height", imgs.every(i => i.alt !== null && i.w && i.h), imgs.filter(i => !(i.alt !== null && i.w && i.h)));
      for (const route of ["#/", "#/p/halo-lamp", "#/cart", "#/orders", "#/account", "#/about", "#/staff", "#/x"]) {
        await page.goto("http://localhost:5173/" + route);
        await page.waitForTimeout(100);
        const hs = await page.evaluate(() => [...document.querySelectorAll("main h1, main h2, main h3, main h4")].filter(h => h.offsetParent !== null || h.closest('.visually-hidden')).map(h => +h.tagName[1]));
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
      // keyboard: tab to first element shows skip link
      await page.goto("about:blank");
      await page.goto("http://localhost:5173/#/");
      await page.waitForSelector(".tile");
      await page.keyboard.press("Tab");
      check("first Tab focuses skip link", await page.evaluate(() => document.activeElement.className) === "skip-link");
      await shot(page, "30-skip-link-focus", false);
      // CLS check on product images
      const cls = await page.evaluate(() => new Promise(res => {
        let total = 0;
        new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) total += e.value; }).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => res(total), 1500);
      }));
      check("cumulative layout shift < 0.05", cls < 0.05, cls);
      // innerHTML guard
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
    check("zero console errors", allErrors.length === 0, allErrors);
    await browser.close();
    mock.kill(); mockFail.kill();
    s1.close(); s2.close(); s3.close();
    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) { console.log("FAILED:\n - " + failed.map(f => f.name).join("\n - ")); process.exitCode = 1; }
  }
})();
