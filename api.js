// api.js
// If config.API_URL is empty -> "local mode": record the event in the feed only.
// If set -> POST JSON to API_URL, header "x-api-key: <API_KEY>", 8 s timeout, 2 retries, never block the UI.
//
// Every call returns a Promise and never throws synchronously, so callers can fire and forget.
// Error messages are kept short and never include the API key.
(function () {
  "use strict";

  var cfg = window.LUMEN_CONFIG || {};
  var TIMEOUT_MS = 8000;
  var RETRIES = 2;

  // Local-mode simulation of the Telegram handshake (no network, nothing sent).
  var SIM_CONNECT_MS = 4000;
  var simConnects = {};

  function isLocal() {
    return !cfg.API_URL;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function shortError(err) {
    if (!err) return "Unknown error";
    if (err.name === "AbortError") return "Timed out after 8 s";
    if (err.status) return "Server replied " + err.status;
    return "Could not reach the server";
  }

  async function postOnce(body) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    try {
      var res = await fetch(cfg.API_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": cfg.API_KEY || "" },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      if (!res.ok) {
        var httpErr = new Error("HTTP " + res.status);
        httpErr.status = res.status;
        // 4xx (except timeout / rate limit) will not get better on retry.
        httpErr.fatal = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
        throw httpErr;
      }
      var text = await res.text();
      return text ? JSON.parse(text) : {};
    } finally {
      clearTimeout(timer);
    }
  }

  async function post(body, retries) {
    var tries = retries == null ? RETRIES : retries;
    var lastErr;
    for (var attempt = 0; attempt <= tries; attempt++) {
      try {
        return await postOnce(body);
      } catch (err) {
        lastErr = err;
        if (err.fatal) break;
        if (attempt < tries) await sleep(700 * (attempt + 1));
      }
    }
    var out = new Error(shortError(lastErr));
    out.cause = lastErr;
    throw out;
  }

  function randomHex(bytes) {
    var arr = new Uint8Array(bytes);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    return Array.prototype.map.call(arr, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  window.MendAPI = {
    isLocal: isLocal,

    // Problem event (T1 late delivery / T2 low review). Payload is sent exactly as given.
    sendEvent: function (payload) {
      if (isLocal()) return Promise.resolve({ mode: "local" });
      return post(payload).then(function (r) { return { mode: "api", response: r }; });
    },

    // Ask Mend for a one-time /start token. Returns {token, expires_at[, simulated]}.
    connect: function (customerId, firstName) {
      if (isLocal()) {
        simConnects[customerId] = Date.now();
        return Promise.resolve({
          token: "SIMULATED-" + randomHex(3).toUpperCase(),
          expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
          simulated: true
        });
      }
      return post({ action: "connect", customer_id: customerId, first_name: firstName });
    },

    // Returns "connected" | "waiting" | "not_connected". No retries: the caller polls.
    status: function (customerId) {
      if (isLocal()) {
        var started = simConnects[customerId];
        if (!started) return Promise.resolve("not_connected");
        return Promise.resolve(Date.now() - started >= SIM_CONNECT_MS ? "connected" : "waiting");
      }
      return post({ action: "status", customer_id: customerId }, 0).then(function (r) {
        if (r && (r.connected === true || r.status === "connected")) return "connected";
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

    // Last 20 events for the staff view. Resolves to an array.
    events: function () {
      if (isLocal()) return Promise.resolve(null);
      return post({ action: "events" }, 1).then(function (r) {
        return Array.isArray(r) ? r : (r && Array.isArray(r.events) ? r.events : []);
      });
    }
  };
})();
