// Mock Mend API for testing Lumen Home. Node only, no dependencies.
//
//   node mock-api.js            -> http://localhost:8787, API key "test-key"
//   PORT=9000 MOCK_KEY=abc node mock-api.js
//   MOCK_FAIL=1 node mock-api.js   -> every event POST returns 500 (to test retries and errors)
//
// Then in config.js set API_URL: "http://localhost:8787", API_KEY: "test-key", and a TEAM_CODE.
// The mock pretends the customer pressed Start in Telegram 5 seconds after asking for a link.
// GET /__inspect shows what was received (test helper; a real API must not expose this).
"use strict";

const http = require("http");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const KEY = process.env.MOCK_KEY || "test-key";
const FAIL_EVENTS = process.env.MOCK_FAIL === "1";
const AUTO_CONNECT_MS = Number(process.env.MOCK_CONNECT_MS || 5000);

// Exactly the fields from the contract (README, "Event payload").
const EVENT_FIELDS = {
  event_type: v => v === "late_delivery" || v === "bad_review",
  customer_id: v => typeof v === "string" && /^c_[0-9a-f]{6}$/.test(v),
  first_name: v => typeof v === "string" && v.length > 0 && v.length <= 30,
  order_id: v => typeof v === "string" && /^LH-\d{4,}$/.test(v),
  product_id: v => typeof v === "string" && v.length > 0,
  product_name: v => typeof v === "string" && v.length > 0,
  category: v => ["Lighting", "Furniture", "Kitchen", "Textiles", "Decor", "Storage"].includes(v),
  order_value: v => typeof v === "number" && v > 0,
  delivery_fee: v => typeof v === "number" && v >= 0,
  days_late: v => Number.isInteger(v) && v >= 0,
  review_score: v => v === null || (Number.isInteger(v) && v >= 1 && v <= 5),
  review_text: v => typeof v === "string" && v.length <= 400,
  promised_at: v => typeof v === "string" && !isNaN(Date.parse(v)) && v.endsWith("Z"),
  delivered_at: v => typeof v === "string" && !isNaN(Date.parse(v)) && v.endsWith("Z"),
  prior_orders: v => Number.isInteger(v) && v >= 0,
  telegram_connected: v => typeof v === "boolean"
};

const received = [];        // full payloads, for /__inspect
const customers = new Map(); // customer_id -> { token, expires_at, asked_at, connected, stopped }
const actions = [];         // every action call, for /__inspect

function validateEvent(body) {
  const problems = [];
  const keys = Object.keys(body);
  for (const k of keys) if (!(k in EVENT_FIELDS)) problems.push("unexpected field: " + k);
  for (const k of Object.keys(EVENT_FIELDS)) {
    if (!(k in body)) problems.push("missing field: " + k);
    else if (!EVENT_FIELDS[k](body[k])) problems.push("bad value for " + k + ": " + JSON.stringify(body[k]));
  }
  if (body.event_type === "late_delivery" && body.days_late < 1) problems.push("late_delivery needs days_late >= 1");
  if (body.event_type === "late_delivery" && body.review_score !== null) problems.push("late_delivery needs review_score null");
  if (body.event_type === "bad_review" && !(body.review_score <= 2)) problems.push("bad_review needs review_score <= 2");
  if (body.telegram_connected !== true) problems.push("events must only be sent when telegram_connected is true");
  return problems;
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

function statusFor(id) {
  const c = customers.get(id);
  if (!c || c.stopped) return "not_connected";
  if (c.connected) return "connected";
  if (Date.now() - c.asked_at >= AUTO_CONNECT_MS) { c.connected = true; return "connected"; }
  return "waiting";
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  if (req.method === "GET" && req.url === "/__inspect") return send(res, 200, { received, actions, customers: [...customers.keys()] });
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  if (req.headers["x-api-key"] !== KEY) return send(res, 401, { error: "bad api key" });

  let raw = "";
  req.on("data", chunk => { raw += chunk; if (raw.length > 1e5) req.destroy(); });
  req.on("end", () => {
    let body;
    try { body = JSON.parse(raw); } catch (e) { return send(res, 400, { error: "invalid JSON" }); }

    if (body && body.action) {
      actions.push({ at: new Date().toISOString(), ...body });
      const id = body.customer_id;
      switch (body.action) {
        case "connect": {
          if (!id || !body.first_name) return send(res, 400, { error: "customer_id and first_name needed" });
          const token = crypto.randomBytes(12).toString("hex");
          const expires_at = new Date(Date.now() + 10 * 60000).toISOString();
          customers.set(id, { token, expires_at, asked_at: Date.now(), connected: false, stopped: false, first_name: body.first_name });
          console.log(`[connect] ${id} (${body.first_name}) -> token issued`);
          return send(res, 200, { token, expires_at });
        }
        case "status":
          return send(res, 200, { status: statusFor(id) });
        case "stop": {
          const c = customers.get(id);
          if (c) { c.stopped = true; c.connected = false; }
          console.log(`[stop] ${id}`);
          return send(res, 200, { ok: true });
        }
        case "delete":
          customers.delete(id);
          for (let i = received.length - 1; i >= 0; i--) if (received[i].customer_id === id) received.splice(i, 1);
          console.log(`[delete] ${id}`);
          return send(res, 200, { ok: true });
        case "events":
          return send(res, 200, {
            events: received.slice(-20).reverse().map(e => ({
              time: e._at, event_type: e.event_type, first_name: e.first_name, order_id: e.order_id,
              status: "received", outcome: e.event_type === "late_delivery" ? "Delivery fee refund offered (mock)" : "Asked what went wrong (mock)"
            }))
          });
        default:
          return send(res, 400, { error: "unknown action" });
      }
    }

    if (FAIL_EVENTS) { console.log("[event] forced 500"); return send(res, 500, { error: "forced failure" }); }
    const problems = validateEvent(body || {});
    if (problems.length) {
      console.log("[event] REJECTED", problems);
      return send(res, 422, { error: "payload does not match contract", problems });
    }
    received.push({ ...body, _at: new Date().toISOString() });
    console.log(`[event] ${body.event_type} ${body.order_id} ${body.product_name} days_late=${body.days_late} score=${body.review_score}`);
    return send(res, 200, { ok: true });
  });
});

server.listen(PORT, () => console.log(`Mock Mend API on http://localhost:${PORT} (key "${KEY}")`));
