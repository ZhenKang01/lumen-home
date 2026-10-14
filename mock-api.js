// Mock of the Mend backend (n8n webhook) for testing Lumen Home. Node only, no dependencies.
//
//   MOCK_TEAM_CODE=pick-any-code node mock-api.js    -> http://localhost:8787, API key "test-key"
//   PORT=9000 MOCK_KEY=abc MOCK_TEAM_CODE=xyz node mock-api.js
//
// Then point a local copy of config.js at it: API_URL "http://localhost:8787", API_KEY "test-key".
// Type the same MOCK_TEAM_CODE into the Account page to connect.
// The mock pretends the shopper pressed Start in Telegram 5 seconds after asking for a link
// (MOCK_CONNECT_MS changes that). GET /__inspect shows what it received (test helper only).
// Vouchers: a connected shopper whose order is 1+ days late gets one free-delivery voucher
// (S$6.90, 30 days, one at a time). GET /__expire?customer_id=c_xxxx makes it expire (test helper).
"use strict";

const http = require("http");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const KEY = process.env.MOCK_KEY || "test-key";
const TEAM_CODE = process.env.MOCK_TEAM_CODE || crypto.randomBytes(6).toString("hex");
const AUTO_CONNECT_MS = Number(process.env.MOCK_CONNECT_MS || 5000);

const CATEGORIES = ["Lighting", "Furniture", "Kitchen", "Textiles", "Decor", "Storage"];
const isCustomer = v => typeof v === "string" && /^c_[a-z0-9]{4,24}$/.test(v);
const isName = v => typeof v === "string" && /^\p{L}{1,20}$/u.test(v);
const isOrder = v => typeof v === "string" && /^LH-\d{3,8}$/.test(v);
const isIso = v => typeof v === "string" && !isNaN(Date.parse(v));

// Problem event fields (README, "Problem events").
const EVENT_FIELDS = {
  action: v => v === "late_delivery" || v === "bad_review",
  event_type: v => v === "late_delivery" || v === "bad_review",
  customer_id: isCustomer,
  first_name: isName,
  order_id: isOrder,
  product_id: v => typeof v === "string" && v.length > 0,
  product_name: v => typeof v === "string" && v.length > 0,
  category: v => CATEGORIES.includes(v),
  order_value: v => typeof v === "number" && v > 0,
  delivery_fee: v => typeof v === "number" && v >= 0,
  days_late: v => Number.isInteger(v) && v >= 0,
  review_score: v => v === null || (Number.isInteger(v) && v >= 1 && v <= 5),
  review_text: v => typeof v === "string" && v.length <= 400,
  promised_at: isIso,
  delivered_at: isIso,
  prior_orders: v => Number.isInteger(v) && v >= 0
};
const OPTIONAL_FIELDS = { telegram_connected: v => typeof v === "boolean" };

const customers = new Map(); // customer_id -> { first_name, token, asked_at, connected }
const openCases = new Map(); // customer_id -> case_id
const reported = new Set();  // customer_id|order_id|event_type
const vouchers = new Map();  // customer_id -> { code, value, expires_at, used_on }
const events = [];           // what the staff view sees
const received = [];         // full event bodies, for /__inspect
const actions = [];          // every action call, for /__inspect

function validateEvent(body) {
  const problems = [];
  for (const k of Object.keys(body)) if (!(k in EVENT_FIELDS) && !(k in OPTIONAL_FIELDS)) problems.push("unexpected field: " + k);
  for (const [k, ok] of Object.entries(EVENT_FIELDS)) {
    if (!(k in body)) problems.push("missing field: " + k);
    else if (!ok(body[k])) problems.push("bad value for " + k + ": " + JSON.stringify(body[k]));
  }
  for (const [k, ok] of Object.entries(OPTIONAL_FIELDS)) if (k in body && !ok(body[k])) problems.push("bad value for " + k);
  if (body.action !== body.event_type) problems.push("action and event_type must match");
  if (body.event_type === "late_delivery" && body.review_score !== null) problems.push("late_delivery needs review_score null");
  return problems;
}

function statusFor(id) {
  const c = customers.get(id);
  if (!c) return "not_connected";
  if (c.connected) return "connected";
  if (c.token && Date.now() - c.asked_at >= AUTO_CONNECT_MS) { c.connected = true; c.token = null; return "connected"; }
  return c.token ? "waiting" : "not_connected";
}

const DAY = 86400000;
const VOUCHER_VALUE = 6.9;
function activeVoucher(id) {
  const v = vouchers.get(id);
  return v && !v.used_on && Date.parse(v.expires_at) > Date.now() ? v : null;
}
function voucherState(v) {
  if (!v) return "";
  if (v.used_on) return "used";
  return Date.parse(v.expires_at) > Date.now() ? "active" : "expired";
}
const publicVoucher = v => (v ? { code: v.code, value: v.value, expires_at: v.expires_at } : null);
// Issue a voucher for a late delivery: connected shoppers only, one at a time.
function maybeIssueVoucher(b) {
  if (b.event_type !== "late_delivery" || b.days_late < 1) return null;
  if (statusFor(b.customer_id) !== "connected" || activeVoucher(b.customer_id)) return null;
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = "FD-" + [...crypto.randomBytes(6)].map(x => chars[x % chars.length]).join("");
  const v = { code, value: VOUCHER_VALUE, expires_at: new Date(Date.now() + 30 * DAY).toISOString(), used_on: null };
  vouchers.set(b.customer_id, v);
  return v;
}

function handleEvent(b) {
  const decide = () => {
    if (b.event_type === "late_delivery" && b.days_late < 1) return { sent: false, reason: "on_time" };
    if (b.event_type === "bad_review" && b.review_score > 2) return { sent: false, reason: "review_not_low" };
    if (statusFor(b.customer_id) !== "connected") return { sent: false, reason: "not_connected" };
    const key = b.customer_id + "|" + b.order_id + "|" + b.event_type;
    if (reported.has(key)) return { sent: false, reason: "duplicate" };
    if (openCases.has(b.customer_id)) return { sent: false, reason: "open_case" };
    reported.add(key);
    const case_id = "case_" + crypto.randomBytes(4).toString("hex");
    openCases.set(b.customer_id, case_id);
    return { sent: true, case_id };
  };
  const result = decide();
  // A real late delivery earns a voucher even when the message is held (open case); not for duplicates.
  const issued = result.reason === "duplicate" ? null : maybeIssueVoucher(b);
  events.push({
    at: new Date().toISOString(), event_type: b.event_type, first_name: b.first_name, order_id: b.order_id,
    product_name: b.product_name, status: result.sent ? "sent" : "not_sent",
    outcome: result.sent ? "Telegram message sent (mock)" : result.reason,
    _customer: b.customer_id, _voucher: issued
  });
  console.log(`[${b.event_type}] ${b.customer_id} ${b.order_id} -> ${result.sent ? "sent " + result.case_id : result.reason}${issued ? " + voucher " + issued.code : ""}`);
  const reply = Object.assign({ ok: true }, result);
  if (b.event_type === "late_delivery") reply.voucher = publicVoucher(issued);
  return reply;
}

function send(res, status, obj) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, x-api-key",
    "access-control-allow-methods": "POST, OPTIONS"
  });
  res.end(obj === undefined ? "" : JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  if (req.method === "GET" && req.url === "/__inspect") return send(res, 200, { received, actions, openCases: [...openCases.keys()], vouchers: Object.fromEntries(vouchers) });
  if (req.method === "GET" && req.url.startsWith("/__expire")) {
    const id = new URL(req.url, "http://x").searchParams.get("customer_id");
    const v = vouchers.get(id);
    if (v) v.expires_at = new Date(Date.now() - 1000).toISOString();
    return send(res, 200, { ok: !!v });
  }
  if (req.method !== "POST") return send(res, 405, { error: "post_only" });
  if (req.headers["x-api-key"] !== KEY) return send(res, 401, { error: "bad_key" });

  let raw = "";
  req.on("data", chunk => { raw += chunk; if (raw.length > 1e5) req.destroy(); });
  req.on("end", () => {
    let b;
    try { b = JSON.parse(raw); } catch (e) { return send(res, 400, { error: "bad_json" }); }
    if (!b || typeof b !== "object") return send(res, 400, { error: "bad_request" });
    const id = b.customer_id;

    if (b.action === "late_delivery" || b.action === "bad_review") {
      const problems = validateEvent(b);
      received.push(b);
      if (problems.length) {
        console.log("[event] REJECTED", problems);
        return send(res, 400, { error: "bad_request", problems });
      }
      return send(res, 200, handleEvent(b));
    }

    // Never log the team code itself.
    actions.push(Object.assign({ at: new Date().toISOString() }, b, b.team_code ? { team_code: "(hidden)" } : {}));
    switch (b.action) {
      case "connect": {
        if (!isCustomer(id) || !isName(b.first_name)) return send(res, 400, { error: "bad_request" });
        if (typeof b.team_code !== "string" || b.team_code !== TEAM_CODE) {
          console.log(`[connect] ${id} refused: wrong team code`);
          return send(res, 403, { error: "team_only" });
        }
        if (statusFor(id) === "connected") return send(res, 200, { ok: true, connected: true });
        const token = crypto.randomBytes(12).toString("hex");
        const expires_at = new Date(Date.now() + 10 * 60000).toISOString();
        customers.set(id, { first_name: b.first_name, token, asked_at: Date.now(), connected: false });
        console.log(`[connect] ${id} (${b.first_name}) -> token issued`);
        return send(res, 200, { ok: true, token, expires_at });
      }
      case "status":
        if (!isCustomer(id)) return send(res, 400, { error: "bad_request" });
        return send(res, 200, { ok: true, status: statusFor(id) });
      case "stop":
        if (!isCustomer(id)) return send(res, 400, { error: "bad_request" });
        customers.delete(id);
        openCases.delete(id);
        console.log(`[stop] ${id}`);
        return send(res, 200, { ok: true });
      case "delete":
        if (!isCustomer(id)) return send(res, 400, { error: "bad_request" });
        customers.delete(id);
        openCases.delete(id);
        vouchers.delete(id);
        for (const k of [...reported]) if (k.startsWith(id + "|")) reported.delete(k);
        for (let i = events.length - 1; i >= 0; i--) if (events[i]._customer === id) events.splice(i, 1);
        for (let i = received.length - 1; i >= 0; i--) if (received[i].customer_id === id) received.splice(i, 1);
        console.log(`[delete] ${id}`);
        return send(res, 200, { ok: true });
      case "voucher":
        if (!isCustomer(id)) return send(res, 400, { error: "bad_request" });
        return send(res, 200, { ok: true, voucher: publicVoucher(activeVoucher(id)) });
      case "redeem": {
        if (!isCustomer(id) || !isOrder(b.order_id)) return send(res, 400, { error: "bad_request" });
        const v = activeVoucher(id);
        if (!v) {
          console.log(`[redeem] ${id} ${b.order_id} -> not redeemed`);
          return send(res, 200, { ok: true, redeemed: false });
        }
        v.used_on = b.order_id;
        console.log(`[redeem] ${id} ${b.order_id} -> ${v.code}`);
        return send(res, 200, { ok: true, redeemed: true, value: v.value, code: v.code });
      }
      case "events":
        return send(res, 200, {
          ok: true,
          events: events.slice(-20).reverse().map(({ _customer, _voucher, ...e }) => Object.assign(e, { voucher: voucherState(_voucher) }))
        });
      default:
        return send(res, 400, { error: "unknown_action" });
    }
  });
});

server.listen(PORT, () => console.log(`Mock Mend API on http://localhost:${PORT} (key "${KEY}"). Team code comes from MOCK_TEAM_CODE.`));
