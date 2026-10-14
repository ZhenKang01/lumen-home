// Lumen Home demo store. Plain JS, no build step.
// Rule: all text goes into the page as text nodes (see h()). Never use innerHTML.
(function () {
  "use strict";

  // ---------------------------------------------------------------- config
  var CFG = Object.assign({
    DELIVERY_FEE: 6.9, PROMISE_DAYS: 5, BOT_URL: "https://t.me/mend_by_smc_bot",
    API_URL: "", API_KEY: "", TEAM_CODE: "", TEAM_NAMES: []
  }, window.LUMEN_CONFIG || {});
  var PRODUCTS = window.LUMEN_PRODUCTS || [];
  var CATEGORIES = window.LUMEN_CATEGORIES || [];
  var BY_ID = new Map(PRODUCTS.map(function (p) { return [p.id, p]; }));
  var API = window.MendAPI;
  var STORE_KEY = "lumen_store_v2";
  var DAY = 86400000;
  var MAX_QTY = 9;
  var FEED_KEEP = 50;
  var POLL_MS = 3000;
  var POLL_FOR_MS = 120000;

  // ---------------------------------------------------------------- small helpers
  function h(tag, props) {
    var el = document.createElement(tag);
    setProps(el, props);
    appendKids(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }
  function setProps(el, props) {
    if (!props) return;
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === "class") el.setAttribute("class", v);
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else if (k === "checked") el.checked = !!v;
      else if (k === "style") Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? "" : String(v));
    });
  }
  function appendKids(el, kids) {
    kids.forEach(function (k) {
      if (k == null || k === false) return;
      if (Array.isArray(k)) return appendKids(el, k);
      el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    });
  }
  var SVGNS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  var ICONS = {
    check: [["circle", { cx: 10, cy: 10, r: 8.25 }], ["path", { d: "M6.2 10.4l2.6 2.6 5-5.4" }]],
    late: [["circle", { cx: 10, cy: 10, r: 8.25 }], ["path", { d: "M10 5.6v5.2" }], ["path", { d: "M10 13.8v.4" }]],
    truck: [["path", { d: "M2.5 5.5h9v8h-9z" }], ["path", { d: "M11.5 8.5h3.2l2.8 2.8v2.2h-6" }], ["circle", { cx: 6, cy: 14.5, r: 1.6 }], ["circle", { cx: 14.5, cy: 14.5, r: 1.6 }]],
    review: [["path", { d: "M3.5 4.5h13v9h-7l-4 3v-3h-2z" }], ["path", { d: "M7 8h6M7 10.5h4" }]],
    link: [["path", { d: "M8.5 11.5a3 3 0 0 0 4.2 0l2.8-2.8a3 3 0 0 0-4.2-4.2l-.9.9" }], ["path", { d: "M11.5 8.5a3 3 0 0 0-4.2 0l-2.8 2.8a3 3 0 0 0 4.2 4.2l.9-.9" }]],
    info: [["circle", { cx: 10, cy: 10, r: 8.25 }], ["path", { d: "M10 9v5" }], ["path", { d: "M10 6v.4" }]],
    clock: [["circle", { cx: 10, cy: 10, r: 8.25 }], ["path", { d: "M10 5.5V10l3 2" }]],
    off: [["circle", { cx: 10, cy: 10, r: 8.25 }], ["path", { d: "M6.5 10h7" }]],
    error: [["path", { d: "M10 2.5l8 14.5H2z" }], ["path", { d: "M10 8v4" }], ["path", { d: "M10 14.2v.4" }]],
    close: [["path", { d: "M5 5l10 10M15 5L5 15" }]],
    star: [["path", { d: "M10 1.8l2.5 5.3 5.7.7-4.2 4 1.1 5.7L10 14.7l-5.1 2.8 1.1-5.7-4.2-4 5.7-.7z", fill: "currentColor", stroke: "none" }]]
  };
  function icon(name, cls) {
    var svg = svgEl("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", focusable: "false", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round" });
    svg.setAttribute("class", "icon" + (cls ? " " + cls : ""));
    (ICONS[name] || []).forEach(function (d) { svg.appendChild(svgEl(d[0], d[1])); });
    return svg;
  }

  function money(n) { return "S$" + Number(n).toFixed(2); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
  function clampQty(q) { q = Math.round(Number(q)); return Math.min(MAX_QTY, Math.max(1, isFinite(q) ? q : 1)); }
  function utcMidnight(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  function addDays(d, n) { return new Date(d.getTime() + n * DAY); }
  var fmtDate = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" });
  var fmtDayUTC = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  var fmtTime = new Intl.DateTimeFormat("en-SG", { hour: "numeric", minute: "2-digit", second: "2-digit" });
  function dateText(iso) { return fmtDate.format(new Date(iso)); }
  function dayText(iso) { return fmtDayUTC.format(new Date(iso)); }
  function timeText(iso) { return fmtTime.format(new Date(iso)); }
  function ago(iso) {
    var days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 60) return days + " days ago";
    return dateText(iso);
  }
  function randomHex(bytes) {
    var a = new Uint8Array(bytes);
    window.crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }
  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // ---------------------------------------------------------------- state
  function freshState() {
    return {
      v: 2, account: null, cart: [], orders: [], reviews: [], events: [],
      telegram: { status: "none" }, next_order: 1001, present: false
    };
  }
  var storage = null;
  var loadNote = null;

  function openStorage() {
    try {
      var s = window.localStorage;
      s.setItem("__lumen_probe", "1");
      s.removeItem("__lumen_probe");
      return s;
    } catch (e) { return null; }
  }
  function looksValid(s) {
    return s && typeof s === "object" &&
      Array.isArray(s.cart) && Array.isArray(s.orders) && Array.isArray(s.reviews) && Array.isArray(s.events) &&
      s.telegram && typeof s.telegram === "object" &&
      (s.account === null || (typeof s.account === "object" && typeof s.account.customer_id === "string" && typeof s.account.first_name === "string"));
  }
  function loadState() {
    storage = openStorage();
    if (!storage) return freshState();
    var raw = null;
    try { raw = storage.getItem(STORE_KEY); } catch (e) { return freshState(); }
    if (!raw) return freshState();
    try {
      var parsed = JSON.parse(raw);
      if (!looksValid(parsed)) throw new Error("bad shape");
      var s = Object.assign(freshState(), parsed);
      s.cart = s.cart.filter(function (l) { return l && BY_ID.has(l.id); })
        .map(function (l) { return { id: l.id, qty: clampQty(l.qty) }; });
      s.events = s.events.filter(function (e) { return e && typeof e === "object"; }).slice(0, FEED_KEEP);
      // A send can't survive a reload; mark it so the feed doesn't show "Sending" forever.
      s.events.forEach(function (e) { if (e.status === "sending") e.status = "failed"; });
      return s;
    } catch (e) {
      loadNote = "Saved demo data could not be read, so the demo was reset.";
      try { storage.removeItem(STORE_KEY); } catch (_) { /* ignore */ }
      return freshState();
    }
  }
  function save() {
    if (!storage) return;
    try { storage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* quota full or blocked */ }
  }

  var state = loadState();

  // UI-only state (not saved)
  var shop = { cat: "All", q: "", sort: "featured" };
  var lampOn = false;
  var lampTimer = null;
  var tg = {}; // Telegram panel UI: simToken, fallbackLink, error, info, teamError, busy
  var pollTimer = null;
  var pollUntil = 0;

  // ---------------------------------------------------------------- catalogue and reviews
  function reviewsFor(pid) {
    var p = BY_ID.get(pid);
    var seeded = p.reviews.map(function (r) {
      return { name: r[0], rating: r[1], text: r[2], date: new Date(Date.now() - r[3] * DAY).toISOString(), mine: false };
    });
    var mine = state.reviews.filter(function (r) { return r.product_id === pid; }).map(function (r) {
      return { name: r.first_name, rating: r.rating, text: r.text, date: r.created_at, mine: true };
    });
    return mine.concat(seeded).sort(function (a, b) { return b.date.localeCompare(a.date); });
  }
  function ratingOf(pid) {
    var rs = reviewsFor(pid);
    var sum = rs.reduce(function (s, r) { return s + r.rating; }, 0);
    return { avg: rs.length ? sum / rs.length : 0, count: rs.length };
  }
  function starsEl(value) {
    var wrap = h("span", { class: "stars", "aria-hidden": "true" });
    var full = Math.round(value);
    for (var i = 1; i <= 5; i++) wrap.appendChild(icon("star", i <= full ? "" : "star--empty"));
    return wrap;
  }
  function ratingEl(avg, count) {
    return h("span", { class: "rating" },
      starsEl(avg),
      h("span", { "aria-hidden": "true" }, avg.toFixed(1) + " (" + count + ")"),
      h("span", { class: "visually-hidden" }, "Rated " + avg.toFixed(1) + " out of 5 from " + plural(count, "review")));
  }
  function productImg(p, cls, eager) {
    return h("img", { class: cls, src: p.image, alt: p.alt, width: 800, height: 1000, loading: eager ? "eager" : "lazy", decoding: "async" });
  }

  // ---------------------------------------------------------------- basket
  function cartCount() { return state.cart.reduce(function (s, l) { return s + l.qty; }, 0); }
  function cartTotals() {
    var items = round2(state.cart.reduce(function (s, l) { return s + BY_ID.get(l.id).price * l.qty; }, 0));
    var fee = state.cart.length ? CFG.DELIVERY_FEE : 0;
    return { items: items, fee: fee, total: round2(items + fee) };
  }
  function addToCart(id) {
    var p = BY_ID.get(id);
    var line = state.cart.find(function (l) { return l.id === id; });
    if (line) {
      if (line.qty >= MAX_QTY) { toast("You can have up to " + MAX_QTY + " of each item in your basket."); return; }
      line.qty += 1;
    } else {
      state.cart.push({ id: id, qty: 1 });
    }
    save();
    updateChrome();
    toast("Added " + p.name + " to your basket.");
  }
  function setQty(id, qty) {
    var line = state.cart.find(function (l) { return l.id === id; });
    if (!line) return;
    line.qty = clampQty(qty);
    save();
    updateChrome();
    refresh();
  }
  function removeFromCart(id) {
    var p = BY_ID.get(id);
    state.cart = state.cart.filter(function (l) { return l.id !== id; });
    save();
    updateChrome();
    refresh();
    toast("Removed " + p.name + " from your basket.");
    var main = document.getElementById("main");
    var next = main.querySelector("[data-key^='qty-dec-']") || main.querySelector("a[data-key='shop-link']");
    if (next) next.focus();
  }

  // ---------------------------------------------------------------- account
  function validateName(raw) {
    // Same rule as the Mend server: 1 to 20 letters.
    var v = String(raw || "").trim();
    if (!v) return { error: "Please enter a first name." };
    if (v.length > 20) return { error: "Please keep your first name to 20 letters." };
    if (!/^\p{L}+$/u.test(v)) return { error: "Please use letters only, as one word (no spaces, numbers or symbols)." };
    return { value: v };
  }
  function signUp(name) {
    if (state.account) {
      state.account.first_name = name;
    } else {
      state.account = { customer_id: "c_" + randomHex(3), first_name: name, created_at: new Date().toISOString() };
      logFeed({ kind: "info", title: "Account created for " + name, detail: "Customer id " + state.account.customer_id });
    }
    save();
    updateChrome();
  }
  function nameForm(opts) {
    var errId = opts.id + "-error";
    var input = h("input", { type: "text", id: opts.id, name: "first_name", autocomplete: "given-name", maxlength: 20, required: true, "aria-describedby": opts.id + "-hint" });
    var err = h("p", { class: "error", id: errId, hidden: true });
    var form = h("form", { class: "form-stack", novalidate: true },
      h("div", { class: "field" },
        h("label", { for: opts.id }, "First name"),
        input,
        h("p", { class: "hint", id: opts.id + "-hint" }, "Only your first name. An invented one is fine. No email, phone or address needed."),
        err),
      h("div", { class: "btn-row" }, h("button", { type: "submit", class: "btn" }, opts.submitLabel)));
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var res = validateName(input.value);
      if (res.error) {
        err.textContent = res.error;
        err.hidden = false;
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", opts.id + "-hint " + errId);
        input.focus();
        return;
      }
      signUp(res.value);
      opts.onDone(res.value);
    });
    return form;
  }

  // ---------------------------------------------------------------- orders
  function placeOrder() {
    var now = new Date();
    var items = state.cart.map(function (l) {
      var p = BY_ID.get(l.id);
      return { id: p.id, name: p.name, category: p.category, price: p.price, qty: l.qty };
    });
    var subtotal = round2(items.reduce(function (s, i) { return s + i.price * i.qty; }, 0));
    var order = {
      id: "LH-" + state.next_order,
      placed_at: now.toISOString(),
      promised_at: addDays(utcMidnight(now), CFG.PROMISE_DAYS).toISOString(),
      items: items,
      subtotal: subtotal,
      delivery_fee: CFG.DELIVERY_FEE,
      total: round2(subtotal + CFG.DELIVERY_FEE),
      status: "on_the_way",
      delivered_at: null,
      days_late: null
    };
    state.next_order += 1;
    state.orders.push(order);
    state.cart = [];
    save();
    updateChrome();
    return order;
  }
  function findOrder(id) { return state.orders.find(function (o) { return o.id === id; }); }
  function mainItem(order) {
    return order.items.slice().sort(function (a, b) { return b.price - a.price; })[0];
  }
  function priorOrders(order) {
    return state.orders.filter(function (o) { return o.placed_at < order.placed_at; }).length;
  }
  function deliver(orderId, daysLate) {
    var o = findOrder(orderId);
    if (!o || o.status !== "on_the_way") return;
    o.status = "delivered";
    o.days_late = daysLate;
    o.delivered_at = addDays(new Date(o.promised_at), daysLate).toISOString();
    save();
    if (daysLate >= 1) {
      emitEvent("late_delivery", o, mainItem(o), null);
    } else {
      logFeed({ kind: "ok", title: o.id + " delivered on time", detail: "Nothing went wrong, so nothing goes to Mend." });
    }
    toast(o.id + (daysLate >= 1 ? " delivered " + plural(daysLate, "day") + " late." : " delivered on time."));
  }
  function orderStatus(o) {
    if (o.status !== "delivered") return { cls: "way", icon: "truck", text: "On its way" };
    if (o.days_late >= 1) return { cls: "late", icon: "late", text: "Delivered " + plural(o.days_late, "day") + " late" };
    return { cls: "ok", icon: "check", text: "Delivered on time" };
  }

  // ---------------------------------------------------------------- reviews
  function reviewableOrders(pid) {
    return state.orders.filter(function (o) {
      return o.status === "delivered" &&
        o.items.some(function (i) { return i.id === pid; }) &&
        !state.reviews.some(function (r) { return r.order_id === o.id && r.product_id === pid; });
    });
  }
  function publishReview(pid, orderId, rating, text) {
    var o = findOrder(orderId);
    var review = {
      id: "r_" + randomHex(4), product_id: pid, order_id: orderId,
      first_name: state.account.first_name, rating: rating, text: text, created_at: new Date().toISOString()
    };
    state.reviews.push(review);
    save();
    var item = o.items.find(function (i) { return i.id === pid; });
    if (rating <= 2) emitEvent("bad_review", o, item, review);
    else logFeed({ kind: "info", title: rating + "-star review of " + item.name, detail: "Rating above 2, so nothing goes to Mend." });
  }

  // ---------------------------------------------------------------- Mend events and feed
  // Feed status -> plain words. "not_sent" is the old name for not_connected (kept for saved data).
  var STATUS_TEXT = {
    sending: "Sending to Mend…",
    sent: "Sent to Mend. A Telegram message is on its way.",
    local: "Local mode: recorded here only. Nothing was sent.",
    not_connected: "Not sent: the shopper has not connected Telegram.",
    not_sent: "Not sent: the shopper has not connected Telegram.",
    open_case: "Held: Mend already has an open case with this customer. One case at a time.",
    duplicate: "Not sent: this order problem was already reported.",
    not_problem: "Not a problem, so no message.",
    other: "Not sent by Mend.",
    failed: "Could not reach Mend. The order still went through."
  };
  var STATUS_SHORT = {
    sending: "Sending", sent: "Sent", local: "Recorded (local mode)", not_connected: "Not sent", not_sent: "Not sent",
    open_case: "Held", duplicate: "Not sent", not_problem: "Not sent", other: "Not sent", failed: "Failed"
  };
  var OUTCOME_TEXT = {
    sending: "Waiting for Mend",
    sent: "Mend will message the customer on Telegram",
    local: "Preview only, no message",
    not_connected: "No consent yet: Telegram not connected",
    not_sent: "No consent yet: Telegram not connected",
    open_case: "One open case at a time",
    duplicate: "Already reported",
    not_problem: "Not a problem",
    other: "Mend declined",
    failed: "Could not reach Mend"
  };
  // Server reason -> feed status.
  var REASON_STATUS = { not_connected: "not_connected", open_case: "open_case", duplicate: "duplicate", on_time: "not_problem", review_not_low: "not_problem" };

  function logFeed(entry) {
    entry.id = "e_" + randomHex(4);
    entry.ts = new Date().toISOString();
    state.events.unshift(entry);
    if (state.events.length > FEED_KEEP) state.events.length = FEED_KEEP;
    save();
    feedChanged();
    return entry;
  }

  function emitEvent(type, order, item, review) {
    var payload = {
      event_type: type,
      customer_id: state.account.customer_id,
      first_name: state.account.first_name,
      order_id: order.id,
      product_id: item.id,
      product_name: item.name,
      category: item.category,
      order_value: order.total,
      delivery_fee: order.delivery_fee,
      days_late: order.days_late || 0,
      review_score: review ? review.rating : null,
      review_text: review ? review.text : "",
      promised_at: order.promised_at,
      delivered_at: order.delivered_at,
      prior_orders: priorOrders(order),
      telegram_connected: state.telegram.status === "connected"
    };
    var title = type === "late_delivery"
      ? "Late delivery: " + order.id + ", " + plural(order.days_late, "day") + " late"
      : "Low review: " + review.rating + " " + (review.rating === 1 ? "star" : "stars") + " for " + item.name;
    var entry = logFeed({
      kind: type === "late_delivery" ? "late" : "review",
      title: title,
      detail: payload.first_name + ", " + item.name + ", " + order.id,
      event_type: type, order_id: order.id, first_name: payload.first_name,
      payload: payload, status: "sending"
    });

    // Consent first: nothing leaves the browser unless Telegram is connected.
    if (!payload.telegram_connected) { settle(entry, "not_connected"); return; }
    if (API.isLocal()) { settle(entry, "local"); return; }
    API.sendEvent(payload).then(function (r) {
      if (r && r.sent === true) {
        entry.case_id = r.case_id || null;
        settle(entry, "sent");
        return;
      }
      var reason = r && r.reason ? String(r.reason) : "";
      entry.reason = reason;
      settle(entry, REASON_STATUS[reason] || "other");
      // The server knows best: the shopper may have typed STOP in Telegram.
      if (reason === "not_connected" && state.telegram.status === "connected") setTelegram("none");
    }).catch(function (err) {
      entry.error = err.message;
      settle(entry, "failed");
    });
  }
  function settle(entry, status) {
    entry.status = status;
    save();
    feedChanged();
  }
  function feedChanged() {
    var drawer = document.getElementById("demo-drawer");
    if (drawer && drawer.open) keepFocus(renderDrawer);
    var r = parseRoute();
    if (r && r.parts[0] === "staff" && API.isLocal()) keepFocus(function () { render(false); });
  }

  var CATEGORY_WORDS = {
    Lighting: "new lighting", Furniture: "new furniture", Kitchen: "something for your kitchen",
    Textiles: "new textiles", Decor: "something for your home", Storage: "new storage"
  };
  function previewText(p) {
    if (p.event_type === "late_delivery") {
      return "Hi " + p.first_name + ", this is Mend, Lumen Home's assistant. Your " + p.product_name +
        " (order " + p.order_id + ") arrived " + plural(p.days_late, "day") + " late, and I'm sorry. " +
        "I know waiting for " + (CATEGORY_WORDS[p.category] || "an order") + " is frustrating. " +
        "Let's fix it first. I can refund your " + money(p.delivery_fee) + " delivery fee right now, or you can tell me what else would help.";
    }
    var text = "Hi " + p.first_name + ", I saw your " + p.review_score + "-star review of the " + p.product_name +
      " (order " + p.order_id + "). What went wrong? I'd like to put it right before anything else.";
    if (p.days_late > 0) {
      text += " I can also see it arrived " + plural(p.days_late, "day") + " late, so I can refund your " +
        money(p.delivery_fee) + " delivery fee if that is part of the problem.";
    }
    return text;
  }

  // ---------------------------------------------------------------- Telegram
  var WRONG_CODE = "That code is not right. Telegram messages are only enabled for the demo team.";

  function setTelegram(status) {
    state.telegram.status = status;
    save();
    accountChanged();
  }
  function accountChanged() {
    var r = parseRoute();
    if (r && r.parts[0] === "account") keepFocus(function () { render(false); });
  }
  // The team code is checked by the Mend server. It is passed straight through and never stored.
  function connectTelegram(teamCode) {
    if (!state.account || tg.busy) return;
    var code = String(teamCode || "").trim();
    if (!code) {
      tg = { teamError: "Please enter the team code." };
      accountChanged();
      focusTeamCode();
      return;
    }
    var local = API.isLocal();
    tg = { busy: true };
    // Open the tab now, while we still have the click, so pop-up blockers allow it.
    var win = null;
    if (!local) {
      try { win = window.open("about:blank", "_blank"); } catch (e) { win = null; }
    }
    function closeWin() { if (win) { try { win.close(); } catch (e) { /* ignore */ } } }
    accountChanged();
    API.connect(state.account.customer_id, state.account.first_name, code).then(function (res) {
      if (res && res.connected === true) {
        closeWin();
        tg = {};
        logFeed({ kind: "connect", title: "Telegram connected", detail: state.account.first_name + " was already connected" });
        setTelegram("connected");
        toast("Telegram is connected.");
        return;
      }
      if (!res || !res.token) throw new Error("Mend did not send a link");
      tg = {};
      if (local) {
        tg.simToken = res.token;
      } else {
        var link = CFG.BOT_URL + "?start=" + encodeURIComponent(res.token);
        if (win && !win.closed) {
          try { win.opener = null; } catch (e) { /* ignore */ }
          win.location.href = link;
        } else {
          tg.fallbackLink = link;
        }
      }
      logFeed({ kind: "connect", title: "Telegram: waiting for " + state.account.first_name, detail: local ? "Simulated link (local mode)" : "One-time link opened in Telegram" });
      startPolling();
      setTelegram("waiting");
    }).catch(function (err) {
      closeWin();
      if (err.status === 403) {
        tg = { teamError: WRONG_CODE };
        logFeed({ kind: "info", title: "Telegram: team code refused", detail: "Only the demo team can connect" });
      } else {
        tg = { error: "Could not reach Mend, so Telegram is not connected. Please try again." };
        logFeed({ kind: "error", title: "Telegram connect failed", detail: err.message });
      }
      setTelegram("none");
      if (tg.teamError) focusTeamCode();
    });
  }
  function focusTeamCode() {
    var inp = document.getElementById("team-code");
    if (inp) inp.focus();
  }
  function startPolling() {
    stopPolling();
    pollUntil = Date.now() + POLL_FOR_MS;
    pollTimer = setInterval(pollOnce, POLL_MS);
  }
  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }
  function pollOnce() {
    if (!state.account || state.telegram.status !== "waiting") { stopPolling(); return; }
    if (Date.now() > pollUntil) {
      stopPolling();
      tg = { error: "We didn't hear back from Telegram within 2 minutes. Please try again." };
      logFeed({ kind: "info", title: "Telegram: link timed out", detail: "No reply within 2 minutes" });
      setTelegram("none");
      return;
    }
    API.status(state.account.customer_id).then(function (st) {
      if (st !== "connected" || state.telegram.status !== "waiting") return;
      stopPolling();
      tg = {};
      logFeed({ kind: "connect", title: "Telegram connected", detail: state.account.first_name + " agreed to messages from Mend" });
      setTelegram("connected");
      toast("Telegram connected. Mend can now message you.");
    }).catch(function () { /* keep polling; a single failed check is not fatal */ });
  }
  function disconnectTelegram() {
    stopPolling();
    var cid = state.account.customer_id;
    tg = { info: "Messages stopped. You can also type STOP in Telegram at any time." };
    logFeed({ kind: "info", title: "Telegram disconnected", detail: "Customer stopped messages" });
    setTelegram("none");
    API.stop(cid).catch(function (err) {
      logFeed({ kind: "error", title: "Could not tell Mend to stop", detail: err.message });
      toast("Stopped here, but Mend could not be reached. Type STOP in Telegram to be sure.");
    });
  }

  // ---------------------------------------------------------------- data controls
  function deleteMyData() {
    var local = API.isLocal();
    confirmDialog({
      title: "Delete your data?",
      body: "This removes your name, basket, orders, reviews and Telegram link from this browser" +
        (local ? "." : ", and asks Mend to delete what it holds about you."),
      confirm: "Delete my data", danger: true
    }).then(function (ok) {
      if (!ok) return;
      var cid = state.account && state.account.customer_id;
      stopPolling();
      if (cid && !local) {
        API.deleteData(cid).then(function () { toast("Mend confirmed your data was deleted."); })
          .catch(function (err) { toast("Deleted here, but Mend could not be reached (" + err.message + ")."); });
      }
      try { if (storage) storage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
      var present = state.present;
      state = freshState();
      state.present = present;
      tg = {};
      updateChrome();
      toast("Your data was deleted from this browser.");
      if (location.hash === "#/") render(true); else location.hash = "#/";
    });
  }
  function resetDemo() {
    confirmDialog({
      title: "Reset the demo?",
      body: "This clears this browser's orders, reviews and activity feed. Your name, basket and Telegram link stay.",
      confirm: "Reset demo", danger: true
    }).then(function (ok) {
      if (!ok) return;
      state.orders = [];
      state.reviews = [];
      state.events = [];
      state.next_order = 1001;
      save();
      updateChrome();
      refresh();
      var drawer = document.getElementById("demo-drawer");
      if (drawer.open) renderDrawer();
      toast("Demo reset. Orders, reviews and events are cleared.");
    });
  }

  // ---------------------------------------------------------------- dialogs and toasts
  function toast(text) {
    var box = document.getElementById("toasts");
    var t = h("div", { class: "toast" }, text);
    box.appendChild(t);
    while (box.children.length > 2) box.removeChild(box.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4000);
  }
  function openModal(dlg) {
    if (dlg.open) return;
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }
  function closeModal(dlg) {
    if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open");
  }
  // Clicking the dark backdrop closes a dialog.
  function closeOnBackdrop(dlg) {
    dlg.addEventListener("click", function (e) {
      if (e.target !== dlg) return;
      var r = dlg.getBoundingClientRect();
      var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) closeModal(dlg);
    });
  }
  function closeBtn(dlg, label) {
    return h("button", { type: "button", class: "icon-btn", "aria-label": label || "Close", onclick: function () { closeModal(dlg); } }, icon("close"));
  }
  function confirmDialog(opts) {
    var dlg = document.getElementById("confirm-dialog");
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (done) return; done = true; closeModal(dlg); resolve(v); }
      var cancel = h("button", { type: "button", class: "btn btn--ghost", onclick: function () { finish(false); } }, "Cancel");
      dlg.replaceChildren(
        h("h2", { id: "confirm-title" }, opts.title),
        h("p", null, opts.body),
        h("div", { class: "btn-row" }, cancel,
          h("button", { type: "button", class: opts.danger ? "btn btn--danger" : "btn", onclick: function () { finish(true); } }, opts.confirm)));
      dlg.addEventListener("close", function onClose() { dlg.removeEventListener("close", onClose); finish(false); });
      openModal(dlg);
      cancel.focus();
    });
  }
  function showPreview(entry) {
    var dlg = document.getElementById("preview-dialog");
    var p = entry.payload;
    dlg.replaceChildren(
      h("div", { class: "modal__close" }, closeBtn(dlg, "Close preview")),
      h("h2", { id: "preview-title" }, "Message preview"),
      h("p", { class: "preview-label" }, icon("info"), "Preview. The real message is written by Mend's AI."),
      h("div", { class: "message" },
        h("p", { class: "message__from" }, "Mend, on Telegram, to " + p.first_name),
        h("p", { style: { margin: "0" } }, previewText(p))),
      h("p", { class: "small muted" },
        "Built from: first name, " + p.product_name + " (" + p.category + "), " +
        (p.event_type === "late_delivery" ? plural(p.days_late, "day") + " late" : p.review_score + "-star rating") +
        ", order " + p.order_id + ". Mend is an AI. Customers can ask for a person at any time or type STOP. Refunds are limited to the delivery fee."),
      h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn", onclick: function () { closeModal(dlg); } }, "Done")));
    openModal(dlg);
  }
  function showQuickStart() {
    var dlg = document.getElementById("quickstart");
    function go(hash) { return function () { closeModal(dlg); location.hash = hash; }; }
    dlg.replaceChildren(
      h("div", { class: "modal__close" }, closeBtn(dlg, "Close quick start")),
      h("h2", { id: "qs-title" }, "Quick start for judges"),
      h("p", { class: "muted" }, "Four steps, about two minutes."),
      h("ol", { class: "steps" },
        h("li", null, h("div", null,
          h("h3", null, "Create an account"),
          h("p", null, "Just a first name. ", h("button", { type: "button", class: "link-btn", onclick: go("#/account") }, "Go to Account")))),
        h("li", null, h("div", null,
          h("h3", null, "Connect Telegram"),
          h("p", null, "Enter the team code in Account, then press Connect Telegram and tap Start in the bot."))),
        h("li", null, h("div", null,
          h("h3", null, "Place an order and make it late"),
          h("p", null, "Add something to your basket and place the order. Then open Demo controls (bottom left) and choose Deliver 9 days late."))),
        h("li", null, h("div", null,
          h("h3", null, "Watch Telegram"),
          h("p", null, "Mend messages the customer with a fix. If Telegram is slow, use Preview message in the activity feed.")))),
      h("div", { class: "btn-row" },
        h("button", { type: "button", class: "btn btn--ghost", onclick: function () { closeModal(dlg); openDrawer(); } }, "Open demo controls"),
        h("button", { type: "button", class: "btn", onclick: go(state.account ? "#/" : "#/account") }, state.account ? "Start shopping" : "Create an account")));
    openModal(dlg);
  }

  // ---------------------------------------------------------------- demo drawer
  function openDrawer() {
    var drawer = document.getElementById("demo-drawer");
    renderDrawer();
    openModal(drawer);
    var first = drawer.querySelector(".drawer__head .icon-btn");
    if (first) first.focus();
  }
  function renderDrawer() {
    var drawer = document.getElementById("demo-drawer");
    var onWay = state.orders.filter(function (o) { return o.status === "on_the_way"; });

    function deliverBtn(o, days, label) {
      return h("button", {
        type: "button", class: "btn btn--small" + (days === 0 ? " btn--ghost" : ""), "data-key": "dl-" + o.id + "-" + days,
        onclick: function () {
          closeModal(drawer);
          deliver(o.id, days);
          if (location.hash === "#/orders") render(true); else location.hash = "#/orders";
        }
      }, label, h("span", { class: "visually-hidden" }, ", order " + o.id));
    }

    var ordersSection = h("section", { class: "drawer__section", "aria-labelledby": "dr-orders" },
      h("h3", { id: "dr-orders" }, "Orders on their way"),
      onWay.length ? onWay.map(function (o) {
        var mi = mainItem(o);
        var more = o.items.length > 1 ? " + " + (o.items.length - 1) + " more" : "";
        return h("div", { class: "drawer-order" },
          h("p", null, h("strong", null, o.id), " · " + mi.name + more + " · promised " + dayText(o.promised_at)),
          h("div", { class: "btn-row" },
            deliverBtn(o, 0, "Deliver on time"),
            deliverBtn(o, 2, "Deliver 2 days late"),
            deliverBtn(o, 9, "Deliver 9 days late")));
      }) : h("p", { class: "muted small" }, state.account ? "No orders on their way. Place an order first." : "No orders yet. Create an account and place an order first."));

    var helper = h("section", { class: "drawer__section", "aria-labelledby": "dr-ff" },
      h("h3", { id: "dr-ff" }, "Fast-forward helper"),
      h("p", { class: "small", style: { margin: "0" } }, "Mend waits a little before following up. To skip the wait on stage, type ",
        h("span", { class: "code" }, "/fastforward"), " to the bot in Telegram. (Shown here for reference only. The shop does not send it.)"));

    var recent = state.events.slice(0, 8);
    var feed = h("section", { class: "drawer__section", "aria-labelledby": "dr-feed" },
      h("h3", { id: "dr-feed" }, "Mend activity feed"),
      h("p", { class: "small muted" }, API.isLocal() ? "Local mode: no API in config.js, so nothing leaves this browser." : "Connected to the Mend API."),
      recent.length ? h("ol", { class: "feed" }, recent.map(feedItem)) : h("p", { class: "muted small" }, "No events yet."),
      h("p", { class: "small", style: { margin: ".75rem 0 0" } }, h("a", { href: "#/staff", onclick: function () { closeModal(drawer); } }, "Open staff view")));

    var present = h("section", { class: "drawer__section", "aria-labelledby": "dr-present" },
      h("h3", { id: "dr-present" }, "Projector"),
      h("label", { class: "switch" },
        h("input", {
          type: "checkbox", checked: state.present, "data-key": "present",
          onchange: function (e) { state.present = e.target.checked; save(); updateChrome(); }
        }),
        h("span", null, h("strong", null, "Present mode"), h("br"),
          h("span", { class: "small muted" }, "Larger text and no Demo controls tab. Use Exit present mode in the top bar, or press Shift + D to open these controls."))));

    var reset = h("section", { class: "drawer__section", "aria-labelledby": "dr-reset" },
      h("h3", { id: "dr-reset" }, "Reset"),
      h("p", { class: "small muted" }, "Clears this browser's orders, reviews and events."),
      h("button", { type: "button", class: "btn btn--danger btn--small", "data-key": "reset", onclick: resetDemo }, "Reset demo"));

    drawer.replaceChildren(
      h("div", { class: "drawer__head" },
        h("div", null,
          h("h2", { id: "drawer-title" }, "Demo controls"),
          h("p", null, "Demo tools for the live presentation. Real shoppers would not see this.")),
        closeBtn(drawer, "Close demo controls")),
      ordersSection, feed, helper, present, reset);
  }
  function feedItem(e) {
    var kindIcon = { late: "late", review: "review", connect: "link", error: "error", ok: "check", info: "info" }[e.kind] || "info";
    var kindLabel = { late: "Late delivery", review: "Low review", connect: "Connection", error: "Error", ok: "Delivered", info: "Note" }[e.kind] || "Note";
    var canPreview = e.payload && (e.status === "sent" || e.status === "local");
    return h("li", null,
      icon(kindIcon, "feed__icon feed__icon--" + e.kind),
      h("div", null,
        h("p", { class: "feed__title" }, h("span", { class: "visually-hidden" }, kindLabel + ": "), e.title),
        h("p", { class: "feed__meta" }, h("time", { datetime: e.ts }, timeText(e.ts)), e.detail ? " · " + e.detail : ""),
        e.status ? h("p", { class: "feed__status feed__status--" + e.status }, STATUS_TEXT[e.status] || e.status) : null,
        canPreview ? h("button", { type: "button", class: "link-btn", "data-key": "pv-" + e.id, onclick: function () { showPreview(e); } },
          "Preview message", h("span", { class: "visually-hidden" }, " for " + e.order_id)) : null));
  }

  // ---------------------------------------------------------------- views
  function viewHome() {
    var heroEl = h("section", { class: "hero" + (lampOn ? " is-lit" : ""), "aria-labelledby": "hero-title" });
    var art = document.getElementById("hero-art").content.cloneNode(true);
    var pull = h("button", { type: "button", class: "btn btn--ghost", "aria-pressed": String(lampOn), "data-key": "lamp" }, "Pull the cord");
    pull.addEventListener("click", function () {
      clearTimeout(lampTimer);
      setLamp(heroEl, pull, !lampOn);
      heroEl.classList.add("is-pulled");
      setTimeout(function () { heroEl.classList.remove("is-pulled"); }, 260);
    });
    heroEl.appendChild(h("div", { class: "hero__inner" },
      h("div", { class: "hero__copy" },
        h("p", { class: "hero__eyebrow" }, "Lighting and quiet things for home"),
        h("h1", { id: "hero-title", tabindex: "-1" }, "Light that settles the room."),
        h("p", { class: "hero__lede" }, "Lamps, linen and calm pieces for slower evenings. Every order is promised within five days, and if we slip, we make it right."),
        h("div", { class: "btn-row" },
          h("button", {
            type: "button", class: "btn btn--glow", onclick: function () {
              var t = document.getElementById("shop-title");
              t.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
              t.focus({ preventScroll: true });
            }
          }, "Shop the collection"),
          pull)),
      h("div", { class: "hero__art" }, art)));
    if (!lampOn) {
      clearTimeout(lampTimer);
      lampTimer = setTimeout(function () { setLamp(heroEl, pull, true); }, prefersReducedMotion() ? 0 : 500);
    }

    var search = h("input", { type: "search", id: "q", value: shop.q, placeholder: "Lamp, mug, rug…", autocomplete: "off" });
    search.addEventListener("input", function () { shop.q = search.value; updateGrid(); });
    var sort = h("select", { id: "sort" },
      [["featured", "Featured"], ["price-asc", "Price: low to high"], ["price-desc", "Price: high to low"], ["rating", "Top rated"]]
        .map(function (o) { return h("option", { value: o[0] }, o[1]); }));
    sort.value = shop.sort;
    sort.addEventListener("change", function () { shop.sort = sort.value; updateGrid(); });

    var tabs = h("div", { class: "tabs", role: "group", "aria-label": "Filter by category" },
      ["All"].concat(CATEGORIES).map(function (c) {
        return h("button", {
          type: "button", class: "tab", "aria-pressed": String(shop.cat === c), "data-cat": c,
          onclick: function () {
            shop.cat = c;
            tabs.querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-pressed", String(t.getAttribute("data-cat") === c)); });
            updateGrid();
          }
        }, c);
      }));
    var count = h("p", { class: "result-count small muted", id: "result-count", "aria-live": "polite" });
    var grid = h("ul", { class: "grid", id: "grid" });

    function updateGrid() {
      var q = shop.q.trim().toLowerCase();
      var list = PRODUCTS.filter(function (p) {
        return (shop.cat === "All" || p.category === shop.cat) && (!q || p.name.toLowerCase().indexOf(q) !== -1);
      });
      var withRating = list.map(function (p) { return { p: p, r: ratingOf(p.id) }; });
      if (shop.sort === "price-asc") withRating.sort(function (a, b) { return a.p.price - b.p.price; });
      if (shop.sort === "price-desc") withRating.sort(function (a, b) { return b.p.price - a.p.price; });
      if (shop.sort === "rating") withRating.sort(function (a, b) { return b.r.avg - a.r.avg; });
      grid.replaceChildren.apply(grid, withRating.map(function (x) { return tile(x.p, x.r); }));
      count.textContent = withRating.length
        ? "Showing " + plural(withRating.length, "product") + (shop.cat !== "All" ? " in " + shop.cat : "") + (q ? " matching “" + shop.q.trim() + "”" : "") + "."
        : "";
      var empty = document.getElementById("grid-empty");
      if (empty) empty.hidden = withRating.length > 0;
    }

    var shopSection = h("section", { class: "wrap page", "aria-labelledby": "shop-title" },
      h("div", { class: "shop-head" },
        h("h2", { id: "shop-title", tabindex: "-1" }, "Shop the collection"),
        h("div", { class: "toolbar" },
          h("div", { class: "field" }, h("label", { for: "q" }, "Search products"), search),
          h("div", { class: "field" }, h("label", { for: "sort" }, "Sort by"), sort))),
      tabs, count, grid,
      h("div", { class: "empty", id: "grid-empty", hidden: true },
        h("p", null, "No products match that search."),
        h("button", {
          type: "button", class: "btn btn--ghost", onclick: function () {
            shop.q = ""; shop.cat = "All"; search.value = "";
            tabs.querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-pressed", String(t.getAttribute("data-cat") === "All")); });
            updateGrid(); search.focus();
          }
        }, "Clear search and filters")));
    var frag = h("div", null, heroEl, shopSection);
    updateGrid();
    return { node: frag, title: "Lumen Home", focus: "hero-title" };
  }
  function setLamp(heroEl, pull, on) {
    lampOn = on;
    heroEl.classList.toggle("is-lit", on);
    pull.setAttribute("aria-pressed", String(on));
  }
  function tile(p, r) {
    var href = "#/p/" + encodeURIComponent(p.id);
    return h("li", { class: "tile" },
      h("a", { class: "tile__link", href: href },
        productImg(p, "tile__img"),
        h("h3", { class: "tile__name" }, p.name)),
      h("div", { class: "tile__meta" },
        h("span", { class: "tile__price" }, money(p.price)),
        ratingEl(r.avg, r.count)),
      h("p", { class: "small muted", style: { margin: "0" } }, p.category),
      h("button", { type: "button", class: "btn btn--ghost btn--small", onclick: function () { addToCart(p.id); } },
        "Add to basket", h("span", { class: "visually-hidden" }, ", " + p.name)));
  }

  function viewProduct(p, toReview) {
    var r = ratingOf(p.id);
    var reviews = reviewsFor(p.id);
    var node = h("div", { class: "wrap page" },
      h("nav", { class: "crumbs", "aria-label": "Breadcrumb" },
        h("a", { href: "#/" }, "Shop"), " / ",
        h("button", {
          type: "button", class: "link-btn", style: { color: "inherit" },
          onclick: function () { shop.cat = p.category; location.hash = "#/"; }
        }, p.category), " / ",
        h("span", { "aria-current": "page" }, p.name)),
      h("div", { class: "product" },
        productImg(p, "product__img", true),
        h("div", null,
          h("p", { class: "eyebrow" }, p.category),
          h("h1", { id: "page-title", tabindex: "-1" }, p.name),
          h("a", { href: "#/p/" + p.id + "/reviews", class: "small" }, ratingEl(r.avg, r.count)),
          h("p", { class: "product__price" }, money(p.price)),
          h("p", { class: "product__blurb" }, p.blurb),
          h("ul", { class: "facts", "aria-label": "Details" }, p.details.map(function (d) { return h("li", null, d); })),
          h("p", { class: "stock" }, icon("check"), "In stock, " + p.stock + " left"),
          h("div", { class: "btn-row" },
            h("button", { type: "button", class: "btn", onclick: function () { addToCart(p.id); } }, "Add to basket"),
            h("a", { class: "btn btn--ghost", href: "#/cart" }, "View basket")),
          h("p", { class: "small muted", style: { marginTop: "1rem" } },
            "Delivery " + money(CFG.DELIVERY_FEE) + ". Promised within " + CFG.PROMISE_DAYS + " days of your order."))),
      h("div", { class: "reviews" },
        h("section", { "aria-labelledby": "reviews-title", id: "reviews" },
          h("h2", { id: "reviews-title", tabindex: "-1" }, "Reviews"),
          h("div", { class: "review-summary" },
            h("span", { class: "review-summary__big", "aria-hidden": "true" }, r.avg.toFixed(1)),
            h("span", null, starsEl(r.avg), h("br"),
              h("span", { class: "small muted" }, h("span", { class: "visually-hidden" }, r.avg.toFixed(1) + " out of 5, "), "from " + plural(r.count, "review")))),
          h("ul", { class: "review-list" }, reviews.map(function (rv) {
            return h("li", null,
              h("div", { class: "review-list__head" },
                h("span", { class: "review-list__name" }, rv.name),
                h("span", { class: "rating" }, starsEl(rv.rating), h("span", { class: "visually-hidden" }, rv.rating + " out of 5 stars")),
                h("span", { class: "small muted" }, ago(rv.date)),
                rv.mine ? h("span", { class: "badge" }, icon("check"), "Your review") : null),
              h("p", null, rv.text));
          }))),
        reviewBox(p)));
    return { node: node, title: p.name, focus: toReview ? "write-title" : "page-title", scrollTo: toReview };
  }
  function reviewBox(p) {
    var box = h("section", { class: "write-review", id: "write", "aria-labelledby": "write-title" },
      h("h2", { id: "write-title", tabindex: "-1" }, "Write a review"));
    if (!state.account) {
      box.appendChild(h("p", { class: "muted" }, "You can review a product after it has been delivered to you. ",
        h("a", { href: "#/account" }, "Create an account"), " to start."));
      return box;
    }
    var open = reviewableOrders(p.id);
    if (!open.length) {
      var hasIt = state.orders.filter(function (o) { return o.items.some(function (i) { return i.id === p.id; }); });
      var msg = !hasIt.length
        ? "You can review this after it has been delivered in one of your orders."
        : hasIt.some(function (o) { return o.status === "on_the_way"; })
          ? "Your order is on its way. You can review this once it arrives."
          : "Thanks, you have already reviewed this for each of your orders.";
      box.appendChild(h("p", { class: "muted" }, msg));
      return box;
    }

    var rating = 0;
    var labels = [];
    var ratingErr = h("p", { class: "error", id: "rating-error", hidden: true });
    var ratingOut = h("p", { class: "hint", id: "rating-out" }, "Choose from 1 to 5 stars.");
    var group = h("div", { class: "star-input" });
    [1, 2, 3, 4, 5].forEach(function (n) {
      var id = "star-" + n;
      var input = h("input", { type: "radio", name: "rating", id: id, value: n, "aria-describedby": "rating-out" });
      var label = h("label", { for: id }, icon("star"), h("span", { class: "visually-hidden" }, plural(n, "star")));
      input.addEventListener("change", function () {
        rating = n;
        labels.forEach(function (l, i) { l.classList.toggle("on", i < n); });
        ratingOut.textContent = n + " out of 5 stars.";
        ratingErr.hidden = true;
      });
      labels.push(label);
      group.appendChild(input);
      group.appendChild(label);
    });

    var text = h("textarea", { id: "review-text", name: "text", maxlength: 400, rows: 5, "aria-describedby": "review-hint" });
    var counter = h("span", { "aria-hidden": "true" }, "0 / 400");
    text.addEventListener("input", function () { counter.textContent = text.value.length + " / 400"; });
    var textErr = h("p", { class: "error", id: "text-error", hidden: true });

    var orderField = null;
    var orderSelect = null;
    if (open.length > 1) {
      orderSelect = h("select", { id: "review-order" }, open.map(function (o) {
        return h("option", { value: o.id }, o.id + ", delivered " + dayText(o.delivered_at));
      }));
      orderField = h("div", { class: "field" }, h("label", { for: "review-order" }, "Which order?"), orderSelect);
    }

    var form = h("form", { class: "form-stack", novalidate: true },
      h("p", { class: "small muted", style: { margin: "0" } },
        "You're reviewing as " + state.account.first_name + (open.length === 1 ? ", for order " + open[0].id + "." : ".")),
      orderField,
      h("fieldset", null,
        h("legend", { class: "legend" }, "Your rating"),
        group, ratingOut, ratingErr),
      h("div", { class: "field" },
        h("label", { for: "review-text" }, "Your review"),
        text,
        h("p", { class: "hint", id: "review-hint" }, "Between 3 and 400 characters. ", counter),
        textErr),
      h("div", { class: "btn-row" }, h("button", { type: "submit", class: "btn" }, "Publish review")));

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var body = text.value.trim();
      var firstBad = null;
      if (!rating) {
        ratingErr.textContent = "Please choose a star rating.";
        ratingErr.hidden = false;
        firstBad = firstBad || group.querySelector("input");
      }
      if (body.length < 3 || body.length > 400) {
        textErr.textContent = body.length < 3 ? "Please write at least 3 characters." : "Please keep it to 400 characters.";
        textErr.hidden = false;
        text.setAttribute("aria-invalid", "true");
        text.setAttribute("aria-describedby", "review-hint text-error");
        firstBad = firstBad || text;
      } else {
        textErr.hidden = true;
        text.removeAttribute("aria-invalid");
      }
      if (firstBad) { firstBad.focus(); return; }
      var orderId = orderSelect ? orderSelect.value : open[0].id;
      publishReview(p.id, orderId, rating, body);
      toast("Thanks, your review is published.");
      render(false);
      var t = document.getElementById("reviews-title");
      if (t) { t.scrollIntoView({ block: "start" }); t.focus({ preventScroll: true }); }
    });
    box.appendChild(form);
    return box;
  }

  function viewCart() {
    var node = h("div", { class: "wrap page" }, h("h1", { id: "page-title", tabindex: "-1" }, "Your basket"));
    if (!state.cart.length) {
      node.appendChild(h("div", { class: "empty" },
        h("p", null, "Your basket is empty."),
        h("a", { class: "btn", href: "#/", "data-key": "shop-link" }, "Browse the shop")));
      return { node: node, title: "Basket" };
    }
    var t = cartTotals();
    var lines = h("ul", { "aria-label": "Items in your basket" }, state.cart.map(function (l) {
      var p = BY_ID.get(l.id);
      return h("li", { class: "line" },
        h("img", { class: "line__img", src: p.image, alt: "", width: 76, height: 95, loading: "lazy" }),
        h("div", null,
          h("h2", { class: "line__name" }, h("a", { href: "#/p/" + p.id }, p.name)),
          h("p", { class: "small muted", style: { margin: "0" } }, money(p.price) + " each"),
          h("div", { class: "line__controls" },
            h("div", { class: "qty", role: "group", "aria-label": "Quantity of " + p.name },
              h("button", {
                type: "button", "aria-label": "Decrease quantity of " + p.name, "data-key": "qty-dec-" + p.id, "data-alt": "qty-inc-" + p.id,
                disabled: l.qty <= 1, onclick: function () { setQty(p.id, l.qty - 1); }
              }, "−"),
              h("output", { "aria-live": "polite", "aria-label": "Quantity" }, String(l.qty)),
              h("button", {
                type: "button", "aria-label": "Increase quantity of " + p.name, "data-key": "qty-inc-" + p.id, "data-alt": "qty-dec-" + p.id,
                disabled: l.qty >= MAX_QTY, onclick: function () { setQty(p.id, l.qty + 1); }
              }, "+")),
            h("button", { type: "button", class: "link-btn", onclick: function () { removeFromCart(p.id); } },
              "Remove", h("span", { class: "visually-hidden" }, " " + p.name)),
            h("span", { class: "line__total" }, money(p.price * l.qty)))));
    }));

    var summary = h("section", { class: "summary", "aria-labelledby": "sum-title" },
      h("h2", { id: "sum-title", style: { fontSize: "1.3rem" } }, "Order summary"),
      h("dl", null,
        h("dt", null, "Items (" + cartCount() + ")"), h("dd", null, money(t.items)),
        h("dt", null, "Delivery"), h("dd", null, money(t.fee)),
        h("dt", { class: "total" }, "Total"), h("dd", { class: "total" }, money(t.total))),
      h("p", { class: "small muted" }, "Promised within " + CFG.PROMISE_DAYS + " days. This is a demo, so no payment is taken."));

    function doPlace() {
      var o = placeOrder();
      toast("Order " + o.id + " placed. Thank you, " + state.account.first_name + ".");
      location.hash = "#/orders";
    }
    if (state.account) {
      summary.appendChild(h("button", { type: "button", class: "btn btn--block", onclick: doPlace }, "Place order"));
    } else {
      summary.appendChild(h("div", { class: "signin" },
        h("h3", null, "First, what should we call you?"),
        nameForm({ id: "cart-name", submitLabel: "Save name and place order", onDone: doPlace })));
    }
    node.appendChild(h("div", { class: "cart" }, lines, summary));
    return { node: node, title: "Basket" };
  }

  function viewOrders() {
    var node = h("div", { class: "wrap page" }, h("h1", { id: "page-title", tabindex: "-1" }, "Your orders"));
    if (!state.orders.length) {
      node.appendChild(h("div", { class: "empty" },
        h("p", null, state.account ? "You haven't placed an order yet." : "Create an account and place an order to see it here."),
        h("a", { class: "btn", href: "#/" }, "Browse the shop")));
      return { node: node, title: "Orders" };
    }
    var list = h("div", { class: "orders" });
    state.orders.slice().reverse().forEach(function (o) {
      var st = orderStatus(o);
      var delivered = o.status === "delivered";
      var trackCls = "track" + (delivered ? (o.days_late >= 1 ? " track--late" : " track--ok") : "");
      list.appendChild(h("article", { class: "order", "aria-labelledby": "o-" + o.id },
        h("div", { class: "order__head" },
          h("h2", { id: "o-" + o.id }, "Order " + o.id),
          h("span", { class: "chip chip--" + st.cls }, icon(st.icon), st.text)),
        h("dl", { class: "order__dates" },
          h("div", null, h("dt", null, "Placed"), h("dd", null, dateText(o.placed_at))),
          h("div", null, h("dt", null, "Promised by"), h("dd", null, dayText(o.promised_at))),
          h("div", null, h("dt", null, "Delivered"), h("dd", null, delivered ? dayText(o.delivered_at) : "Not yet"))),
        h("div", { class: trackCls },
          h("div", { class: "track__bar", "aria-hidden": "true" }, h("span", { class: "track__fill", style: { width: delivered ? "100%" : "55%" } })),
          h("div", { class: "track__steps" },
            h("span", { class: "done" }, "Placed"),
            h("span", { class: "done" }, "On its way"),
            h("span", { class: delivered ? "done" : "" }, "Delivered")),
          h("p", { class: "visually-hidden" }, delivered ? "Step 3 of 3: delivered." : "Step 2 of 3: on its way.")),
        h("ul", { class: "order__items", "aria-label": "Items in order " + o.id }, o.items.map(function (it) {
          var p = BY_ID.get(it.id);
          var mine = state.reviews.find(function (r) { return r.order_id === o.id && r.product_id === it.id; });
          var action = null;
          if (delivered && mine) {
            action = h("span", { class: "badge" }, icon("check"), "Reviewed, " + plural(mine.rating, "star"));
          } else if (delivered) {
            action = h("a", { class: "btn btn--ghost btn--small", href: "#/p/" + it.id + "/review" }, "Review", h("span", { class: "visually-hidden" }, " " + it.name));
          }
          return h("li", null,
            p ? h("img", { src: p.image, alt: "", width: 48, height: 60, loading: "lazy" }) : null,
            h("span", { class: "grow" }, h("a", { href: "#/p/" + it.id }, it.name), h("span", { class: "muted" }, " × " + it.qty)),
            h("span", { class: "num" }, money(it.price * it.qty)),
            action);
        })),
        h("p", { class: "order__total" },
          h("span", { class: "muted" }, "Items " + money(o.subtotal) + " + delivery " + money(o.delivery_fee) + " = "),
          h("strong", null, money(o.total))),
        !delivered ? h("p", { class: "small muted", style: { margin: ".5rem 0 0" } }, "Demo tip: use Demo controls (bottom left) to deliver this order on time or late.") : null));
    });
    node.appendChild(list);
    return { node: node, title: "Orders" };
  }

  function viewAccount() {
    var node = h("div", { class: "wrap page" });
    if (!state.account) {
      node.appendChild(h("h1", { id: "page-title", tabindex: "-1" }, "Create your account"));
      node.appendChild(h("p", { class: "muted", style: { maxWidth: "36rem" } }, "No password, no email. Your account lives in this browser only."));
      node.appendChild(h("div", { class: "panel", style: { maxWidth: "36rem" } },
        nameForm({ id: "acc-name", submitLabel: "Create account", onDone: function (n) { toast("Welcome, " + n + "."); render(true); } })));
      node.appendChild(dataPanel(false));
      return { node: node, title: "Account" };
    }
    var a = state.account;
    node.appendChild(h("h1", { id: "page-title", tabindex: "-1" }, "Hi, " + a.first_name));
    node.appendChild(h("div", { class: "account" },
      h("section", { class: "panel", "aria-labelledby": "acc-title" },
        h("h2", { id: "acc-title" }, "Your account"),
        h("dl", { class: "kv" },
          h("dt", null, "First name"), h("dd", null, a.first_name),
          h("dt", null, "Orders"), h("dd", null, String(state.orders.length)),
          h("dt", null, "Customer id"), h("dd", null, h("span", { class: "code" }, a.customer_id))),
        h("p", { class: "small muted" }, "Your customer id is a random label made in this browser. It is how Mend tells demo shoppers apart.")),
      telegramPanel(),
      dataPanel(true)));
    return { node: node, title: "Account" };
  }

  function telegramPanel() {
    var st = state.telegram.status;
    var local = API.isLocal();
    var statusMap = {
      none: { cls: "none", icon: "off", text: "Not connected" },
      waiting: { cls: "waiting", icon: "clock", text: "Waiting for Telegram" },
      connected: { cls: "connected", icon: "check", text: "Connected" }
    };
    var s = statusMap[st] || statusMap.none;
    var panel = h("section", { class: "panel", "aria-labelledby": "tg-title" },
      h("h2", { id: "tg-title" }, "Telegram messages from Mend"),
      h("p", { class: "status status--" + s.cls, role: "status" }, icon(s.icon), h("span", null, h("span", { class: "visually-hidden" }, "Telegram status: "), s.text)),
      h("p", null, "If an order arrives late or you leave a low review, Mend can message you on Telegram to put it right. Only if you connect."));

    if (st === "connected") {
      panel.appendChild(h("p", { class: "small muted" }, "Mend will only message you about your Lumen Home orders. Type STOP in Telegram at any time."));
      panel.appendChild(h("button", { type: "button", class: "btn btn--danger", "data-key": "tg-stop", onclick: disconnectTelegram }, "Disconnect and stop messages"));
      return panel;
    }

    if (local) {
      panel.appendChild(h("div", { class: "note" },
        h("p", null, h("strong", null, "Local mode."), " No API is set in config.js, so connecting is simulated, the code is not checked, and no message will be sent.")));
    }
    if (st === "waiting") {
      if (tg.simToken) {
        panel.appendChild(h("div", { class: "note" },
          h("p", null, "Simulated token: ", h("span", { class: "sim-token" }, tg.simToken)),
          h("p", { class: "small" }, "This is not a real link. It will show as connected in a few seconds.")));
      }
      if (tg.fallbackLink) {
        var fb = h("a", { class: "btn btn--glow", href: tg.fallbackLink, target: "_blank", rel: "noopener noreferrer" }, "Open Telegram");
        fb.addEventListener("click", function () { tg.fallbackLink = null; setTimeout(function () { render(false); }, 50); });
        panel.appendChild(h("p", { class: "small" }, "Your browser blocked the new tab. Use this button instead:"));
        panel.appendChild(h("p", null, fb));
      } else if (!local) {
        panel.appendChild(h("p", { class: "small muted" }, "Telegram opened in a new tab. Press Start in the chat with the bot, then come back here."));
      }
      panel.appendChild(h("p", { class: "small muted" }, "Checking every 3 seconds for up to 2 minutes."));
      panel.appendChild(h("div", { class: "btn-row" },
        h("button", { type: "button", class: "btn", disabled: true }, "Connect Telegram"),
        h("button", { type: "button", class: "btn btn--ghost", "data-key": "tg-cancel", onclick: disconnectTelegram }, "Cancel")));
      return panel;
    }
    if (tg.error) panel.appendChild(h("p", { class: "error", role: "alert" }, tg.error));
    if (tg.info) panel.appendChild(h("p", { class: "note note--plain" }, tg.info));

    // The code goes straight to the server with the connect request. It is never saved.
    var described = "team-hint" + (tg.teamError ? " team-error" : "");
    var codeInput = h("input", {
      type: "password", id: "team-code", name: "team_code", autocomplete: "off", spellcheck: "false",
      "aria-describedby": described, "aria-invalid": tg.teamError ? "true" : null, disabled: tg.busy
    });
    var connectBtn = h("button", { type: "submit", class: "btn", "data-key": "tg-connect", disabled: true },
      tg.busy ? "Checking code…" : "Connect Telegram");
    codeInput.addEventListener("input", function () { connectBtn.disabled = !codeInput.value.trim(); });
    var form = h("form", { class: "form-stack", novalidate: true },
      h("div", { class: "field" },
        h("label", { for: "team-code" }, "Team code"),
        codeInput,
        h("p", { class: "hint", id: "team-hint" }, "Telegram messages are only enabled for the demo team. Mend checks the code."),
        tg.teamError ? h("p", { class: "error", id: "team-error", role: "alert" }, tg.teamError) : null),
      h("div", { class: "btn-row" }, connectBtn));
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var code = codeInput.value;
      codeInput.value = "";
      connectTelegram(code);
    });
    panel.appendChild(form);
    panel.appendChild(h("p", { class: "small muted", style: { marginTop: ".75rem" } },
      local ? "Nothing leaves this browser in local mode." : "This opens Mend's bot in Telegram with a one-time link."));
    return panel;
  }

  function dataPanel(withDelete) {
    return h("section", { class: "panel panel--wide", "aria-labelledby": "data-title", style: withDelete ? null : { marginTop: "1.5rem" } },
      h("h2", { id: "data-title" }, "How Mend uses your data"),
      h("p", null, "Mend is an AI assistant, not a person. You can ask for a human at any time, and Mend's refunds are limited to the delivery fee."),
      h("div", { class: "data-grid" },
        h("div", null, h("h3", null, "What is used"), h("p", null, "Your first name, the order (items, dates, delivery fee) and any review you write.")),
        h("div", null, h("h3", null, "What is not"), h("p", null, "No payment details, address, email or phone number. The shop never asks for them.")),
        h("div", null, h("h3", null, "Who can see it"), h("p", null, "Only the Mend demo team, and only for this hackathon demo.")),
        h("div", null, h("h3", null, "How to stop"), h("p", null, "Type STOP in Telegram, or use Disconnect and stop messages above. Nothing is sent unless you connect."))),
      withDelete ? h("button", { type: "button", class: "btn btn--danger", "data-key": "delete", onclick: deleteMyData }, "Delete my data") : null);
  }

  function viewAbout() {
    var node = h("div", { class: "wrap page" },
      h("div", { class: "about" },
        h("div", null,
          h("p", { class: "eyebrow" }, "About"),
          h("h1", { id: "page-title", tabindex: "-1" }, "About this demo"),
          h("p", null, "Lumen Home is a made-up shop. The products, prices, people and reviews are invented. There are no real payments, addresses or deliveries."),
          h("p", null, "It exists to show ", h("strong", null, "Mend"), ": “Fix the order, keep the customer.”")),
        h("section", { "aria-labelledby": "mend-title", class: "prose" },
          h("h2", { id: "mend-title" }, "Meet Mend"),
          h("p", null, "Mend is an AI assistant that works on Telegram. When something goes wrong with an order, the shop tells Mend, and Mend messages the customer with a personal fix."),
          h("p", null, "Two things trigger Mend:"),
          h("ul", null,
            h("li", null, "A delivery that arrives 1 or more days after the promised date."),
            h("li", null, "A review of 2 stars or lower.")),
          h("p", null, "Mend only messages customers who connected Telegram themselves. Mend is an AI, a human can be requested at any time, and refunds are limited to the delivery fee. Typing STOP ends messages.")),
        h("section", { "aria-labelledby": "credits" },
          h("h2", { id: "credits", tabindex: "-1" }, "Photo credits"),
          h("p", { class: "muted" }, "Product photos are from Unsplash, used under the Unsplash License. Thank you to the photographers."),
          h("div", { class: "table-wrap" },
            h("table", null,
              h("thead", null, h("tr", null, h("th", { scope: "col" }, "Product"), h("th", { scope: "col" }, "Photographer"), h("th", { scope: "col" }, "Source"))),
              h("tbody", null, PRODUCTS.map(function (p) {
                return h("tr", null,
                  h("td", null, h("a", { href: "#/p/" + p.id }, p.name)),
                  h("td", null, p.credit ? p.credit.by : "Illustration"),
                  h("td", null, p.credit ? h("a", { href: p.credit.url, target: "_blank", rel: "noopener noreferrer" }, "Unsplash", h("span", { class: "visually-hidden" }, ", photo by " + p.credit.by + " (opens in a new tab)")) : "Made for this demo"));
              })))))));
    return { node: node, title: "About" };
  }

  function viewStaff() {
    var local = API.isLocal();
    var tableHolder = h("div", null);
    var source = h("p", { class: "small muted" }, local ? "Source: this browser's activity feed (local mode)." : "Source: Mend API. Loading…");
    var node = h("div", { class: "wrap page" },
      h("p", { class: "eyebrow" }, "Staff and judges"),
      h("h1", { id: "page-title", tabindex: "-1" }, "Staff view"),
      h("p", { class: "muted" }, "Read-only list of the most recent Mend events. Not linked from the main menu."),
      h("div", { class: "staff" },
        h("section", { "aria-labelledby": "events-title" },
          h("h2", { id: "events-title" }, "Recent events"),
          source, tableHolder),
        h("aside", { class: "measure", "aria-labelledby": "measure-title" },
          h("h2", { id: "measure-title" }, "How we measure it"),
          h("ol", null,
            h("li", null, "A 10% holdout group gets no Mend message, so we can compare."),
            h("li", null, "Repeat purchase within 60 days."),
            h("li", null, "Customer retention at 90 days.")),
          h("p", { class: "small muted", style: { margin: "0" } }, "Impact numbers on the Mend Console are from synthetic data until the real run."))));

    function localRows() {
      return state.events.filter(function (e) { return e.event_type; }).slice(0, 20).map(function (e) {
        var outcome = e.error ? "Error: " + e.error : OUTCOME_TEXT[e.status] || "";
        if (e.status === "other" && e.reason) outcome += " (" + e.reason + ")";
        return {
          at: e.ts, event_type: e.event_type, first_name: e.first_name, order_id: e.order_id,
          product_name: e.payload ? e.payload.product_name : "", status: STATUS_SHORT[e.status] || e.status, outcome: outcome
        };
      });
    }
    function timeOf(r) { return r.at || r.time || r.ts || ""; }
    // Server codes -> plain words. Free text from the server is shown as it is.
    var PLAIN = {
      sent: "Sent", not_sent: "Not sent", held: "Held", failed: "Failed", error: "Error",
      not_connected: "Telegram not connected", open_case: "Open case already", duplicate: "Already reported",
      on_time: "Not a problem", review_not_low: "Not a problem"
    };
    function plain(v) {
      var s = String(v == null ? "" : v);
      if (PLAIN[s]) return PLAIN[s];
      return /^[a-z]+(_[a-z]+)+$/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : s;
    }
    // Only these fields are shown. Anything else the server sends (ids, tokens) is ignored.
    function draw(rows) {
      if (!rows.length) { tableHolder.replaceChildren(h("p", { class: "muted" }, "No events yet. Deliver an order late or publish a 1 or 2 star review.")); return; }
      rows = rows.slice().sort(function (a, b) { return String(timeOf(b)).localeCompare(String(timeOf(a))); });
      tableHolder.replaceChildren(h("div", { class: "table-wrap" },
        h("table", null,
          h("caption", { class: "visually-hidden" }, "Recent Mend events, newest first"),
          h("thead", null, h("tr", null, ["Time", "Event type", "First name", "Order id", "Product", "Status", "Outcome"].map(function (c) { return h("th", { scope: "col" }, c); }))),
          h("tbody", null, rows.map(function (r) {
            var t = timeOf(r);
            var d = t ? new Date(t) : null;
            return h("tr", null,
              h("td", { class: "num" }, d && !isNaN(d) ? dateText(t) + ", " + timeText(t) : String(t)),
              h("td", null, r.event_type === "late_delivery" ? "Late delivery" : r.event_type === "bad_review" ? "Low review" : String(r.event_type || "")),
              h("td", null, String(r.first_name || "")),
              h("td", null, String(r.order_id || "")),
              h("td", null, String(r.product_name || "")),
              h("td", null, plain(r.status)),
              h("td", null, plain(r.outcome)));
          })))));
    }
    if (local) {
      draw(localRows());
    } else {
      draw([]);
      tableHolder.replaceChildren(h("p", { class: "muted" }, "Loading events…"));
      API.events().then(function (rows) {
        source.textContent = "Source: Mend API, most recent events.";
        draw(rows.slice(0, 20));
      }).catch(function (err) {
        source.textContent = "Could not load from the Mend API (" + err.message + "). Showing this browser's feed instead.";
        draw(localRows());
      });
    }
    return { node: node, title: "Staff view" };
  }

  function viewNotFound() {
    var node = h("div", { class: "wrap page" },
      h("p", { class: "eyebrow" }, "Error 404"),
      h("h1", { id: "page-title", tabindex: "-1" }, "We couldn't find that page."),
      h("p", { class: "muted" }, "The link may be old, or the product may have moved."),
      h("a", { class: "btn", href: "#/" }, "Back to the shop"));
    return { node: node, title: "Page not found" };
  }

  // ---------------------------------------------------------------- router
  function parseRoute() {
    var hash = location.hash || "#/";
    if (hash.slice(0, 2) !== "#/") return null;
    var rest = hash.slice(2);
    var anchor = null;
    var i = rest.indexOf("#");
    if (i >= 0) { anchor = rest.slice(i + 1); rest = rest.slice(0, i); }
    var parts = rest.split("/").filter(Boolean).map(function (x) {
      try { return decodeURIComponent(x); } catch (e) { return x; }
    });
    return { parts: parts, anchor: anchor };
  }
  var NAV_FOR = { "": "home", p: "home", cart: "cart", orders: "orders", account: "account", about: "about" };

  function render(isNavigation) {
    var r = parseRoute() || { parts: [], anchor: null };
    var page = r.parts[0] || "";
    var view;
    switch (page) {
      case "": view = viewHome(); break;
      case "p": view = BY_ID.has(r.parts[1]) && (!r.parts[2] || r.parts[2] === "review" || r.parts[2] === "reviews")
        ? viewProduct(BY_ID.get(r.parts[1]), r.parts[2] === "review") : viewNotFound();
        if (r.parts[2] === "reviews" && view.title !== "Page not found") { view.focus = "reviews-title"; view.scrollTo = true; }
        break;
      case "cart": view = viewCart(); break;
      case "orders": view = viewOrders(); break;
      case "account": view = viewAccount(); break;
      case "about": view = viewAbout(); break;
      case "staff": view = viewStaff(); break;
      default: view = viewNotFound();
    }
    var main = document.getElementById("main");
    main.replaceChildren(view.node);
    document.title = view.title === "Lumen Home" ? "Lumen Home, calm lighting and home goods" : view.title + " · Lumen Home";
    var navKey = NAV_FOR[page];
    document.querySelectorAll("[data-nav]").forEach(function (a) {
      if (a.getAttribute("data-nav") === navKey && view.title !== "Page not found") a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (isNavigation) {
      var target = document.getElementById(r.anchor || view.focus || "page-title");
      if (target) {
        if (r.anchor || view.scrollTo) target.scrollIntoView({ block: "start" });
        else window.scrollTo(0, 0);
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      } else {
        window.scrollTo(0, 0);
      }
    }
  }
  // Re-render the current page after a state change, keeping focus and scroll.
  function refresh() { keepFocus(function () { render(false); }); }
  function keepFocus(fn) {
    var active = document.activeElement;
    var key = active && active.getAttribute ? active.getAttribute("data-key") : null;
    var alt = active && active.getAttribute ? active.getAttribute("data-alt") : null;
    var y = window.scrollY;
    fn();
    window.scrollTo(0, y);
    if (!key) return;
    var el = document.querySelector("[data-key='" + key + "']");
    if (el && el.disabled && alt) el = document.querySelector("[data-key='" + alt + "']");
    if (el && !el.disabled) el.focus({ preventScroll: true });
  }

  function updateChrome() {
    var n = cartCount();
    document.getElementById("basket-count").textContent = String(n);
    document.getElementById("basket-count-label").textContent = n === 1 ? " item" : " items";
    document.documentElement.classList.toggle("present", !!state.present);
    document.getElementById("exit-present-btn").hidden = !state.present;
    document.getElementById("storage-note").hidden = !!storage;
  }

  // ---------------------------------------------------------------- start
  function init() {
    updateChrome();
    render(false);

    window.addEventListener("hashchange", function () { render(true); });
    document.querySelector(".skip-link").addEventListener("click", function (e) {
      e.preventDefault();
      var t = document.querySelector("#main h1") || document.getElementById("main");
      t.focus();
    });
    document.getElementById("demo-tab").addEventListener("click", openDrawer);
    document.getElementById("quickstart-btn").addEventListener("click", showQuickStart);
    document.getElementById("exit-present-btn").addEventListener("click", function () {
      state.present = false; save(); updateChrome();
      document.getElementById("demo-tab").focus();
    });
    ["demo-drawer", "quickstart", "preview-dialog", "confirm-dialog"].forEach(function (id) {
      closeOnBackdrop(document.getElementById(id));
    });
    document.addEventListener("keydown", function (e) {
      if (!(e.shiftKey && (e.key === "D" || e.key === "d")) || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      var drawer = document.getElementById("demo-drawer");
      e.preventDefault();
      if (drawer.open) closeModal(drawer); else openDrawer();
    });
    // Other tabs of this demo change the same storage; follow them.
    window.addEventListener("storage", function (e) {
      if (e.key !== STORE_KEY) return;
      state = loadState();
      updateChrome();
      refresh();
    });

    if (loadNote) { logFeed({ kind: "error", title: "Saved data was reset", detail: loadNote }); toast(loadNote); }
    if (state.telegram.status === "waiting") {
      if (API.isLocal()) setTelegram("none"); else startPolling();
    } else if (state.telegram.status === "connected" && state.account && !API.isLocal()) {
      // The shopper may have typed STOP in Telegram since the last visit.
      API.status(state.account.customer_id).then(function (st) {
        if (st === "not_connected" && state.telegram.status === "connected") {
          logFeed({ kind: "info", title: "Telegram is no longer connected", detail: "Mend reports the shopper stopped messages" });
          setTelegram("none");
        }
      }).catch(function () { /* offline: keep the saved status */ });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
