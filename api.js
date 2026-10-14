// api.js
// If config.API_URL is empty -> "local mode": record the event in the feed only.
// If set -> POST JSON to API_URL, header "x-api-key: <API_KEY>", 8 s timeout, never block the UI.
//
// Every call returns a Promise and never throws synchronously, so callers can fire and forget.
// A failed call rejects with an Error that has:
//   .status  HTTP status (0 for network failure or timeout)
//   .body    parsed JSON reply, if the server sent one (for example {error: "team_only"})
// Error messages are kept short and never include the API key.
(function () {
  "use strict";

  var cfg = window.LUMEN_CONFIG || {};
  var TIMEOUT_MS = 8000;
  var RETRIES = 2; // only for network errors, timeouts and 5xx

  // Local-mode simulation of the Telegram handshake (no network, nothing sent).
  var SIM_CONNECT_MS = 4000;
  var simConnects = {};

  function isLocal() {
    return !cfg.API_URL;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function fail(message, status, body) {
    var err = new Error(message);
    err.status = status || 0;
    err.body = body || null;
    return err;
  }

  async function postOnce(body) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    var res;
    try {
      res = await fetch(cfg.API_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": cfg.API_KEY || "" },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
    } catch (err) {
      throw fail(err && err.name === "AbortError" ? "Timed out after 8 s" : "Could not reach the server", 0);
    } finally {
      clearTimeout(timer);
    }
    var text = "";
    try { text = await res.text(); } catch (e) { /* empty body */ }
    var data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (e) { data = null; }
    }
    if (!res.ok) throw fail("Server replied " + res.status, res.status, data);
    if (text && data === null) throw fail("Server reply was not JSON", res.status);
    return data || {};
  }

  async function post(body, retries) {
    var tries = retries == null ? RETRIES : retries;
    var lastErr;
    for (var attempt = 0; attempt <= tries; attempt++) {
      try {
        return await postOnce(body);
      } catch (err) {
        lastErr = err;
        // 4xx answers (bad request, wrong code, bad key) will not change on retry.
        var retryable = err.status === 0 || err.status >= 500 || err.status === 429;
        if (!retryable) break;
        if (attempt < tries) await sleep(700 * (attempt + 1));
      }
    }
    throw lastErr;
  }

  function randomHex(bytes) {
    var arr = new Uint8Array(bytes);
    window.crypto.getRandomValues(arr);
    return Array.prototype.map.call(arr, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  window.MendAPI = {
    isLocal: isLocal,

    // Problem event (late_delivery / bad_review). `action` is set to the event type.
    // Resolves to the server reply: {ok:true, sent:true, case_id} or {ok:true, sent:false, reason}.
    sendEvent: function (payload) {
      if (isLocal()) return Promise.resolve({ mode: "local" });
      var body = Object.assign({ action: payload.event_type }, payload);
      return post(body);
    },

    // Ask Mend for a one-time /start token. The team code is checked by the server and never stored.
    // Resolves to {ok, token, expires_at} or {ok, connected:true}. Rejects with status 403 for a wrong code.
    connect: function (customerId, firstName, teamCode) {
      if (isLocal()) {
        simConnects[customerId] = Date.now();
        return Promise.resolve({
          ok: true,
          token: "SIMULATED-" + randomHex(3).toUpperCase(),
          expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
          simulated: true
        });
      }
      return post({ action: "connect", customer_id: customerId, first_name: firstName, team_code: teamCode }, 1);
    },

    // Resolves to "connected" | "waiting" | "not_connected". No retries: the caller polls.
    status: function (customerId) {
      if (isLocal()) {
        var started = simConnects[customerId];
        if (!started) return Promise.resolve("not_connected");
        return Promise.resolve(Date.now() - started >= SIM_CONNECT_MS ? "connected" : "waiting");
      }
      return post({ action: "status", customer_id: customerId }, 0).then(function (r) {
        if (r && (r.status === "connected" || r.connected === true)) return "connected";
        if (r && r.status === "waiting") return "waiting";
        return "not_connected";
      });
    },

    stop: function (customerId) {
      delete simConnects[customerId];
      if (isLocal()) return Promise.resolve({ mode: "local" });
      return post({ action: "stop", customer_id: customerId });
    },

    deleteData: function (customerId) {
      delete simConnects[customerId];
      if (isLocal()) return Promise.resolve({ mode: "local" });
      return post({ action: "delete", customer_id: customerId });
    },

    // The shopper's free-delivery voucher: {ok, voucher:{code, value, expires_at} | null}.
    // Local mode resolves {mode:"local"}; the app simulates vouchers itself.
    voucher: function (customerId) {
      if (isLocal()) return Promise.resolve({ mode: "local" });
      return post({ action: "voucher", customer_id: customerId }, 1);
    },

    // Use the voucher on an order: {ok, redeemed:true, value, code} or {ok, redeemed:false}.
    // Called once, when the order is placed. No retries, so it can't be applied twice.
    redeem: function (customerId, orderId) {
      if (isLocal()) return Promise.resolve({ mode: "local" });
      return post({ action: "redeem", customer_id: customerId, order_id: orderId }, 0);
    },

    // Recent events for the staff view. Resolves to an array (null in local mode).
    events: function () {
      if (isLocal()) return Promise.resolve(null);
      return post({ action: "events" }, 1).then(function (r) {
        return Array.isArray(r) ? r : (r && Array.isArray(r.events) ? r.events : []);
      });
    }
  };
})();
