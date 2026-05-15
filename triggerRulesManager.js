// ================================================================
// ⚡ Instant Rules Manager — Trigger-Based Auto Rules
// Paste in browser console on Facebook Ads Manager page
// by Yellow Web — https://yellowweb.top
// ================================================================

var _IRM = function () {
  "use strict";

  // ───────────────────────────────────────────────────────────────
  // Config
  // ───────────────────────────────────────────────────────────────
  var API = "https://adsmanager-graph.facebook.com/v23.0/";
  var VERSION = "2026.04.08";
  var YW_URL = "https://yellowweb.top";

  // Fields stored in cents by FB API (× 100)
  var CURRENCY_FIELDS = new Set([
    "cost_per", "spent", "cost_per_mobile_app_install", "cpm", "cpc",
  ]);

  var FIELDS = [
    { v: "cost_per",                   l: "Cost per Result"       },
    { v: "results",                    l: "Results"               },
    { v: "spent",                      l: "Spend"                 },
    { v: "cost_per_mobile_app_install",l: "Cost per App Install"  },
    { v: "impressions",                l: "Impressions"           },
    { v: "lifetime_impressions",       l: "Lifetime Impressions"  },
    { v: "reach",                      l: "Reach"                 },
    { v: "cpm",                        l: "CPM"                   },
    { v: "cpc",                        l: "CPC"                   },
    { v: "ctr",                        l: "CTR (%)"               },
  ];

  var TRIGGER_TYPES = [
    { v: "STATS_CHANGE",    l: "Stats Change"    },
    { v: "STATS_MILESTONE", l: "Stats Milestone" },
  ];

  var OPERATORS = [
    { v: "GREATER_THAN", l: ">"         },
    { v: "LESS_THAN",    l: "<"         },
    { v: "EQUAL",        l: "= (exact)" },
  ];

  var ENTITY_TYPES = [
    { v: "ADSET",    l: "Ad Set"   },
    { v: "CAMPAIGN", l: "Campaign" },
    { v: "AD",       l: "Ad"       },
  ];

  var TIME_PRESETS = [
    { v: "TODAY",    l: "Today"    },
    { v: "LIFETIME", l: "Lifetime" },
  ];

  var EXEC_TYPES = [
    { v: "PAUSE",        l: "Pause"        },
    { v: "UNPAUSE",      l: "Unpause"      },
    { v: "NOTIFICATION", l: "Notification" },
  ];

  // ───────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────
  function lbl(arr, v) {
    var found = arr.find(function (x) { return x.v === v; });
    return found ? found.l : v;
  }

  function apiToDisplay(field, raw) {
    var n = parseFloat(raw);
    if (isNaN(n)) return raw;
    return CURRENCY_FIELDS.has(field) ? (n / 100).toFixed(2) : String(n);
  }

  function displayToApi(field, val) {
    var n = parseFloat(String(val).replace(",", "."));
    if (isNaN(n)) return "0";
    return CURRENCY_FIELDS.has(field) ? String(Math.round(n * 100)) : String(Math.round(n));
  }

  function fmtTrigger(spec) {
    var t = spec.trigger;
    if (!t) return "—";
    return lbl(FIELDS, t.field) + " " + lbl(OPERATORS, t.operator) + " " + apiToDisplay(t.field, t.value);
  }

  function fmtFilters(spec) {
    var ex = (spec.filters || []).filter(function (f) {
      return f.field !== "entity_type" && f.field !== "time_preset" && f.field !== "attribution_window";
    });
    if (!ex.length) return "—";
    return ex.map(function (f) {
      return lbl(FIELDS, f.field) + " " + lbl(OPERATORS, f.operator) + " " + apiToDisplay(f.field, f.value);
    }).join("; ");
  }

  function getF(spec, field) {
    return (spec.filters || []).find(function (f) { return f.field === field; });
  }

  function parseSpec(r) {
    if (typeof r.evaluation_spec === "string") r.evaluation_spec = JSON.parse(r.evaluation_spec);
    if (typeof r.execution_spec === "string")  r.execution_spec  = JSON.parse(r.execution_spec);
    return r;
  }

  // ───────────────────────────────────────────────────────────────
  // API
  // ───────────────────────────────────────────────────────────────
  function tok() { return window.__accessToken; }

  async function apiGet(path, params) {
    params = params || {};
    var url = new URL(path.startsWith("http") ? path : API + path);
    url.searchParams.set("access_token", tok());
    Object.keys(params).forEach(function (k) { url.searchParams.set(k, params[k]); });
    var r = await fetch(url.toString(), { credentials: "include" });
    return r.json();
  }

  async function apiPost(path, body) {
    body = body || {};
    var url = path.startsWith("http") ? path : API + path;
    body.access_token = tok();
    var r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
      credentials: "include",
    });
    return r.json();
  }

  async function getAllPages(path, params) {
    params = params || {};
    var items = [];
    var data = await apiGet(path, params);
    if (data.data) items = items.concat(data.data);
    while (data.paging && data.paging.next) {
      data = await apiGet(data.paging.next);
      if (data.data) items = items.concat(data.data);
    }
    return items;
  }

  // Load all accounts with trigger rule counts (single request via field expansion)
  async function fetchAccounts() {
    var accs = await getAllPages("me/adaccounts", {
      fields: "id,name,adrules_library.limit(200){id,evaluation_spec}",
    });
    return accs.map(function (acc) {
      var rules = (acc.adrules_library && acc.adrules_library.data) ? acc.adrules_library.data : [];
      var triggerCount = rules.filter(function (r) {
        try {
          var spec = typeof r.evaluation_spec === "string" ? JSON.parse(r.evaluation_spec) : r.evaluation_spec;
          return spec && spec.evaluation_type === "TRIGGER";
        } catch (_) { return false; }
      }).length;
      return {
        id: acc.id.replace("act_", ""),
        name: acc.name || acc.id,
        triggerCount: triggerCount,
      };
    });
  }

  async function fetchTriggerRules(accId) {
    var rules = await getAllPages("act_" + accId + "/adrules_library", {
      fields: "id,name,status,evaluation_spec,execution_spec",
      limit: "200",
    });
    return rules.map(parseSpec).filter(function (r) {
      return r.evaluation_spec && r.evaluation_spec.evaluation_type === "TRIGGER";
    });
  }

  async function apiCreate(accId, name, evalSpec, execSpec, status) {
    return apiPost("act_" + accId + "/adrules_library", {
      name: name,
      evaluation_spec: JSON.stringify(evalSpec),
      execution_spec:  JSON.stringify(execSpec),
      status: status || "ENABLED",
    });
  }

  async function apiUpdate(ruleId, name, evalSpec, execSpec, status) {
    return apiPost(ruleId, {
      name: name,
      evaluation_spec: JSON.stringify(evalSpec),
      execution_spec:  JSON.stringify(execSpec),
      status: status || "ENABLED",
    });
  }

  async function apiDelete(ruleId) {
    return apiPost(ruleId + "?method=delete", { method: "delete" });
  }

  async function apiToggle(ruleId, status) {
    return apiPost(ruleId, { status: status });
  }

  // ───────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────
  var S = { accounts: [], accountId: "", rules: [] };

  // ───────────────────────────────────────────────────────────────
  // CSS — yellow / black theme
  // ───────────────────────────────────────────────────────────────
  if (!document.getElementById("irm-css")) {
    var styleEl = document.createElement("style");
    styleEl.id = "irm-css";
    styleEl.textContent = [
      /* reset & wrap */
      ".irm-wrap{position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:999998;",
      "display:flex;align-items:center;justify-content:center;",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;}",

      /* panel */
      ".irm-panel{background:#111000;color:#fff8d0;border-radius:13px;",
      "width:960px;max-width:97vw;max-height:92vh;",
      "display:flex;flex-direction:column;overflow:hidden;",
      "box-shadow:0 24px 72px rgba(0,0,0,.95),0 0 0 1px #443b00;}",

      /* header */
      ".irm-hdr{background:#0a0900;padding:11px 18px;display:flex;align-items:center;gap:10px;",
      "border-bottom:2px solid #ffd700;flex-shrink:0;}",
      ".irm-title{font-size:16px;font-weight:800;color:#ffd700;letter-spacing:.2px;}",
      ".irm-title-sep{flex:1;}",
      ".irm-yw{font-size:11px;color:#80740a;text-decoration:none;font-weight:600;}",
      ".irm-yw:hover{color:#ffd700;}",
      ".irm-close{background:none;border:none;color:#5a5020;cursor:pointer;font-size:24px;padding:0 3px;line-height:1;margin-left:4px;}",
      ".irm-close:hover{color:#ff6b6b;}",

      /* toolbar */
      ".irm-tb{background:#0d0c00;padding:9px 18px;display:flex;align-items:center;gap:9px;flex-wrap:wrap;",
      "border-bottom:1px solid #2a2600;flex-shrink:0;}",
      ".irm-acc-sel{flex:1;min-width:220px;max-width:480px;",
      "background:#1a1700;border:1px solid #3d3800;color:#fff8d0;",
      "border-radius:7px;padding:7px 10px;font-size:13px;outline:none;cursor:pointer;}",
      ".irm-acc-sel:focus{border-color:#ffd700;}",
      ".irm-acc-sel option{background:#1a1700;color:#fff8d0;}",
      ".irm-st{font-size:11px;color:#7a6e30;margin-left:auto;}",

      /* buttons */
      ".irm-btn{padding:6px 14px;border:none;border-radius:6px;font-size:12px;font-weight:700;",
      "cursor:pointer;transition:filter .15s;white-space:nowrap;}",
      ".irm-btn:hover:not(:disabled){filter:brightness(1.2);}",
      ".irm-btn:disabled{opacity:.4;cursor:not-allowed;filter:none;}",
      ".irm-btn-y{background:#ffd700;color:#0d0d00;}",
      ".irm-btn-g{background:#183018;color:#7ecf7e;border:1px solid #2a4a2a;}",
      ".irm-btn-r{background:#301818;color:#ff9090;border:1px solid #4a2a2a;}",
      ".irm-btn-n{background:#1e1c00;color:#c0b060;border:1px solid #3d3800;}",
      ".irm-btn-gh{background:none;color:#7a6e30;border:1px solid #2a2600;}",
      ".irm-btn-sm{padding:3px 9px;font-size:11px;}",
      ".irm-btn-xs{padding:2px 7px;font-size:11px;}",

      /* body / table */
      ".irm-body{overflow-y:auto;flex:1;padding:14px 18px;}",
      ".irm-tw{overflow-x:auto;}",
      "table.irm-tbl{width:100%;border-collapse:collapse;font-size:12px;}",
      ".irm-tbl th{background:#0a0900;color:#7a6e30;font-weight:700;padding:8px 10px;",
      "text-align:left;border-bottom:1px solid #2a2600;",
      "white-space:nowrap;text-transform:uppercase;letter-spacing:.5px;font-size:10px;}",
      ".irm-tbl td{padding:7px 10px;border-bottom:1px solid #181600;vertical-align:middle;color:#e0d090;}",
      ".irm-tbl tr:hover td{background:#1a1700;}",
      ".irm-act{display:flex;gap:5px;align-items:center;}",
      ".irm-badge{display:inline-block;padding:2px 8px;border-radius:10px;",
      "font-size:10px;font-weight:700;letter-spacing:.4px;}",
      ".irm-on{background:#152815;color:#7ecf7e;border:1px solid #2a4a2a;}",
      ".irm-off{background:#281515;color:#e08080;border:1px solid #4a2525;}",
      ".irm-tc{background:#1a1500;color:#ffd700;border:1px solid #3d3000;}",
      ".irm-tm{background:#001a1a;color:#5ecfcf;border:1px solid #006060;}",
      ".irm-empty{text-align:center;color:#4a4420;padding:40px;font-size:14px;}",

      /* log */
      ".irm-log{background:#090800;border:1px solid #1e1c00;border-radius:6px;",
      "padding:6px 12px;font-size:11px;color:#7a6e30;",
      "margin-top:10px;min-height:28px;max-height:65px;",
      "overflow-y:auto;line-height:1.6;font-family:monospace;}",
      ".irm-err{color:#ff9090;}.irm-ok{color:#7ecf7e;}.irm-warn{color:#ffd700;}",

      /* modal overlay */
      ".irm-mo{position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:1000000;",
      "display:flex;align-items:center;justify-content:center;}",
      /* modal box */
      ".irm-mb{background:#111000;color:#fff8d0;border-radius:13px;",
      "width:580px;max-width:96vw;max-height:90vh;overflow-y:auto;padding:24px;",
      "box-shadow:0 28px 80px rgba(0,0,0,.95),0 0 0 1px #443b00;}",
      ".irm-mb h3{margin:0 0 18px;font-size:15px;color:#ffd700;}",
      ".irm-fg{margin-bottom:13px;}",
      ".irm-lbl{display:block;font-size:10px;color:#7a6e30;margin-bottom:4px;",
      "font-weight:700;text-transform:uppercase;letter-spacing:.5px;}",
      ".irm-sel,.irm-inp{width:100%;background:#080700;border:1px solid #2a2600;",
      "color:#fff8d0;border-radius:6px;padding:7px 10px;",
      "font-size:13px;outline:none;box-sizing:border-box;}",
      ".irm-sel:focus,.irm-inp:focus{border-color:#ffd700;}",
      ".irm-sel option{background:#080700;color:#fff8d0;}",
      ".irm-sel:disabled{opacity:.5;cursor:not-allowed;}",
      ".irm-sec{font-size:10px;font-weight:700;color:#4a4420;text-transform:uppercase;",
      "letter-spacing:1px;margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid #1e1c00;}",
      ".irm-cr{display:grid;grid-template-columns:1fr 80px 110px 24px;",
      "gap:6px;align-items:center;margin-bottom:6px;}",
      ".irm-cr .irm-sel,.irm-cr .irm-inp{width:100%;}",
      ".irm-rm{background:none;border:none;color:#804040;cursor:pointer;",
      "font-size:18px;padding:0;line-height:1;}",
      ".irm-rm:hover{color:#ff6b6b;}",
      ".irm-af{background:#090800;border:1px dashed #2a2600;color:#7a6e30;",
      "border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer;",
      "width:100%;margin-top:3px;}",
      ".irm-af:hover{background:#1a1700;}",
      ".irm-r2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}",
      ".irm-mft{display:flex;justify-content:space-between;align-items:center;",
      "margin-top:22px;padding-top:14px;border-top:1px solid #1e1c00;}",
      ".irm-mfr{display:flex;gap:8px;}",
      ".irm-note{font-size:11px;color:#7a6e30;margin:0 0 8px;",
      "padding:7px 10px;background:#090800;border-radius:5px;border-left:2px solid #ffd700;}",
      /* info icon + tooltip */
      ".irm-lbl-row{display:flex;align-items:center;gap:6px;margin-bottom:4px;}",
      ".irm-info{display:inline-flex;align-items:center;justify-content:center;",
      "width:14px;height:14px;border-radius:50%;background:#2a2600;border:1px solid #4a4010;",
      "color:#ffd700;font-size:9px;font-weight:800;cursor:default;",
      "font-style:normal;line-height:1;flex-shrink:0;position:relative;}",
      ".irm-info:hover{background:#3d3800;border-color:#ffd700;}",
      ".irm-tip{display:none;position:absolute;left:20px;top:-4px;",
      "width:320px;background:#0a0900;border:1px solid #3d3800;border-radius:8px;",
      "padding:12px 14px;font-size:11px;line-height:1.65;color:#c0b060;",
      "box-shadow:0 8px 24px rgba(0,0,0,.9);z-index:10;font-weight:400;font-style:normal;",
      "pointer-events:none;}",
      ".irm-info:hover .irm-tip{display:block;}",
      ".irm-tip strong{color:#ffd700;font-weight:700;}",
      ".irm-tip hr{border:none;border-top:1px solid #2a2600;margin:8px 0;}",
      ".irm-spin{display:inline-block;animation:irm-s 1s linear infinite;margin-right:5px;}",
      "@keyframes irm-s{to{transform:rotate(360deg)}}",
    ].join("");
    document.head.appendChild(styleEl);
  }

  // ───────────────────────────────────────────────────────────────
  // DOM helpers
  // ───────────────────────────────────────────────────────────────
  function el(tag, cls, attrs) {
    attrs = attrs || {};
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    Object.keys(attrs).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else e[k] = attrs[k];
    });
    return e;
  }

  function mkSel(cls, opts, val) {
    var s = el("select", cls);
    opts.forEach(function (o) {
      var opt = el("option", null, { value: o.v, text: o.l });
      if (o.v === val) opt.selected = true;
      s.appendChild(opt);
    });
    return s;
  }

  // ───────────────────────────────────────────────────────────────
  // Log
  // ───────────────────────────────────────────────────────────────
  var logEl = null;

  function log(msg, type) {
    if (!logEl) return;
    var cls = type === "error" ? "irm-err" : type === "success" ? "irm-ok" : type === "warn" ? "irm-warn" : null;
    var span = el("span", cls);
    span.textContent = "[" + new Date().toLocaleTimeString() + "] " + msg;
    logEl.innerHTML = "";
    logEl.appendChild(span);
  }

  // ───────────────────────────────────────────────────────────────
  // UI refs
  // ───────────────────────────────────────────────────────────────
  var wrapEl = null, tbodyEl = null, statusEl = null, accSelEl = null;

  // ───────────────────────────────────────────────────────────────
  // Build main panel
  // ───────────────────────────────────────────────────────────────
  function buildPanel() {
    if (wrapEl) wrapEl.remove();
    wrapEl = el("div", "irm-wrap");
    var panel = el("div", "irm-panel");
    wrapEl.appendChild(panel);

    /* ── Header */
    var hdr = el("div", "irm-hdr");
    hdr.appendChild(el("div", "irm-title", { text: "⚡ Instant Rules Manager" }));
    var verEl = el("div", null, { text: VERSION });
    verEl.style.cssText = "font-size:10px;color:#4a4420;font-weight:600;margin-left:6px;align-self:flex-end;padding-bottom:1px;";
    hdr.appendChild(verEl);
    hdr.appendChild(el("div", "irm-title-sep"));

    var ywA = el("a", "irm-yw", { href: YW_URL, target: "_blank", text: "by Yellow Web" });
    hdr.appendChild(ywA);

    var bmBtn = el("button", "irm-btn irm-btn-gh irm-btn-xs", { text: "📋 Copy as bookmark" });
    bmBtn.style.marginLeft = "10px";
    bmBtn.onclick = copyAsBookmark;
    hdr.appendChild(bmBtn);

    var closeBtn = el("button", "irm-close", { text: "×" });
    closeBtn.onclick = function () { wrapEl.remove(); };
    hdr.appendChild(closeBtn);
    panel.appendChild(hdr);

    /* ── Toolbar */
    var tb = el("div", "irm-tb");

    accSelEl = el("select", "irm-acc-sel");
    var plOpt = el("option", null, { value: "", text: "⏳ Loading accounts…" });
    plOpt.disabled = true; plOpt.selected = true;
    accSelEl.appendChild(plOpt);
    accSelEl.onchange = function () {
      if (accSelEl.value) switchAccount(accSelEl.value);
    };
    tb.appendChild(accSelEl);

    var newBtn = el("button", "irm-btn irm-btn-y", { text: "⚡ New Rule" });
    newBtn.onclick = function () { openModal(null); };
    tb.appendChild(newBtn);

    statusEl = el("div", "irm-st", { text: "Loading…" });
    tb.appendChild(statusEl);
    panel.appendChild(tb);

    /* ── Body */
    var body = el("div", "irm-body");

    var tw = el("div", "irm-tw");
    var tbl = el("table", "irm-tbl");
    var thead = el("thead");
    var hr = el("tr");
    ["Name", "Entity", "Time", "Type", "Trigger Condition", "Extra Filters", "Status", "Actions"].forEach(function (h) {
      hr.appendChild(el("th", null, { text: h }));
    });
    thead.appendChild(hr);
    tbl.appendChild(thead);

    tbodyEl = el("tbody");
    showEmpty("Loading…");
    tbl.appendChild(tbodyEl);
    tw.appendChild(tbl);
    body.appendChild(tw);

    logEl = el("div", "irm-log", { text: "Initializing…" });
    body.appendChild(logEl);
    panel.appendChild(body);

    document.body.appendChild(wrapEl);
  }

  function showEmpty(text) {
    tbodyEl.innerHTML = "";
    var row = el("tr");
    var td = el("td", "irm-empty", { text: text });
    td.colSpan = 8;
    row.appendChild(td);
    tbodyEl.appendChild(row);
  }

  // ───────────────────────────────────────────────────────────────
  // Render rules table
  // ───────────────────────────────────────────────────────────────
  function renderTable() {
    tbodyEl.innerHTML = "";
    if (!S.rules.length) { showEmpty("No trigger-based rules found."); return; }

    S.rules.forEach(function (rule) {
      var spec = rule.evaluation_spec;
      var trig = spec.trigger || {};
      var etF  = getF(spec, "entity_type");
      var tpF  = getF(spec, "time_preset");
      var isMilestone = trig.type === "STATS_MILESTONE";

      var row = el("tr");

      // Name
      var tdN = el("td"); tdN.title = rule.id; tdN.textContent = rule.name; row.appendChild(tdN);
      // Entity
      row.appendChild(el("td", null, { text: etF ? lbl(ENTITY_TYPES, etF.value) : "—" }));
      // Time
      row.appendChild(el("td", null, { text: tpF ? lbl(TIME_PRESETS, tpF.value) : "—" }));
      // Trigger type badge
      var tdTt = el("td");
      var typeBadge = el("span", "irm-badge " + (isMilestone ? "irm-tm" : "irm-tc"),
        { text: isMilestone ? "MILESTONE" : "CHANGE" });
      tdTt.appendChild(typeBadge); row.appendChild(tdTt);
      // Trigger condition
      row.appendChild(el("td", null, { text: fmtTrigger(spec) }));
      // Extra filters
      row.appendChild(el("td", null, { text: fmtFilters(spec) }));
      // Status
      var tdSt = el("td");
      tdSt.appendChild(el("span", "irm-badge " + (rule.status === "ENABLED" ? "irm-on" : "irm-off"),
        { text: rule.status === "ENABLED" ? "ON" : "OFF" }));
      row.appendChild(tdSt);
      // Actions
      var tdAct = el("td", "irm-act");

      var editBtn = el("button", "irm-btn irm-btn-n irm-btn-sm", { text: "✏" });
      editBtn.title = "Edit rule";
      editBtn.onclick = (function (r) { return function () { openModal(r); }; })(rule);
      tdAct.appendChild(editBtn);

      var togBtn = el("button", "irm-btn irm-btn-sm " + (rule.status === "ENABLED" ? "irm-btn-r" : "irm-btn-g"),
        { text: rule.status === "ENABLED" ? "⏸" : "▶" });
      togBtn.title = rule.status === "ENABLED" ? "Pause rule" : "Enable rule";
      togBtn.onclick = (function (r, b) { return function () { toggleRule(r, b); }; })(rule, togBtn);
      tdAct.appendChild(togBtn);

      var delBtn = el("button", "irm-btn irm-btn-r irm-btn-sm", { text: "🗑" });
      delBtn.title = "Delete rule";
      delBtn.onclick = (function (r) { return function () { confirmDelete(r); }; })(rule);
      tdAct.appendChild(delBtn);

      row.appendChild(tdAct);
      tbodyEl.appendChild(row);
    });
  }

  // ───────────────────────────────────────────────────────────────
  // Account dropdown
  // ───────────────────────────────────────────────────────────────
  function populateAccounts() {
    accSelEl.innerHTML = "";
    if (!S.accounts.length) {
      accSelEl.appendChild(el("option", null, { value: "", text: "No accounts found" }));
      return;
    }
    S.accounts.forEach(function (acc) {
      var cnt = acc.triggerCount;
      var cntStr = cnt === null ? "? trigger" : cnt + " trigger rule" + (cnt !== 1 ? "s" : "");
      var txt = acc.name + " (" + acc.id + ") — " + cntStr;
      var opt = el("option", null, { value: acc.id, text: txt });
      if (acc.id === S.accountId) opt.selected = true;
      accSelEl.appendChild(opt);
    });
  }

  async function switchAccount(id) {
    S.accountId = id;
    showEmpty("Loading rules…");
    statusEl.textContent = "Loading…";
    log("Loading trigger rules for " + id + "…");
    try {
      S.rules = await fetchTriggerRules(id);
      renderTable();
      var cnt = S.rules.length;
      statusEl.textContent = cnt + " trigger rule" + (cnt !== 1 ? "s" : "");
      log("Loaded " + cnt + " trigger-based rule(s).", "success");
      // Update the dropdown count for this account
      var acc = S.accounts.find(function (a) { return a.id === id; });
      if (acc) { acc.triggerCount = cnt; populateAccounts(); accSelEl.value = id; }
    } catch (e) {
      showEmpty("Error loading rules.");
      statusEl.textContent = "Error";
      log("Error: " + (e.message || e), "error");
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Toggle / Delete
  // ───────────────────────────────────────────────────────────────
  async function toggleRule(rule, btn) {
    var ns = rule.status === "ENABLED" ? "DISABLED" : "ENABLED";
    btn.disabled = true;
    log("Setting \"" + rule.name + "\" → " + ns + "…");
    try {
      var r = await apiToggle(rule.id, ns);
      if (r.error) throw new Error(r.error.message);
      rule.status = ns;
      renderTable();
      log("\"" + rule.name + "\" is now " + ns + ".", "success");
    } catch (e) {
      log("Error: " + (e.message || e), "error");
    }
    btn.disabled = false;
  }

  async function confirmDelete(rule) {
    if (!confirm("Delete rule \"" + rule.name + "\"?\nThis cannot be undone.")) return;
    log("Deleting \"" + rule.name + "\"…");
    try {
      var r = await apiDelete(rule.id);
      if (r.error) throw new Error(r.error.message);
      S.rules = S.rules.filter(function (x) { return x.id !== rule.id; });
      renderTable();
      var cnt = S.rules.length;
      statusEl.textContent = cnt + " trigger rule" + (cnt !== 1 ? "s" : "");
      var acc = S.accounts.find(function (a) { return a.id === S.accountId; });
      if (acc) { acc.triggerCount = cnt; populateAccounts(); accSelEl.value = S.accountId; }
      log("\"" + rule.name + "\" deleted.", "success");
    } catch (e) {
      log("Error: " + (e.message || e), "error");
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Create / Edit Modal
  // ───────────────────────────────────────────────────────────────
  function openModal(rule) {
    var isNew     = !rule;
    var spec      = (rule && rule.evaluation_spec) || {};
    var trig      = spec.trigger || {};
    var trigType  = trig.type || "STATS_CHANGE";
    var etVal     = (getF(spec, "entity_type") || {}).value || "ADSET";
    var tpVal     = (getF(spec, "time_preset")  || {}).value || "TODAY";
    var extra     = (spec.filters || []).filter(function (f) {
      return f.field !== "entity_type" && f.field !== "time_preset" && f.field !== "attribution_window";
    });
    var execTypeVal = (rule && rule.execution_spec && rule.execution_spec.execution_type) || "PAUSE";
    var statusVal   = (rule && rule.status) || "ENABLED";

    var overlay = el("div", "irm-mo");
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
    var m = el("div", "irm-mb");
    overlay.appendChild(m);

    m.appendChild(el("h3", null, { text: isNew ? "⚡ Create Trigger Rule" : "✏ Edit: " + rule.name }));

    /* Name */
    var fgN = el("div", "irm-fg");
    fgN.appendChild(el("label", "irm-lbl", { text: "Rule Name" }));
    var nameInp = el("input", "irm-inp", { type: "text", value: rule ? rule.name : "", placeholder: "e.g. Pause high-cost ad sets" });
    fgN.appendChild(nameInp);
    m.appendChild(fgN);

    /* Entity + Time row */
    var r2 = el("div", "irm-r2");

    var fgEt = el("div", "irm-fg");
    fgEt.appendChild(el("label", "irm-lbl", { text: "Apply to" }));
    var etSel = mkSel("irm-sel", ENTITY_TYPES, etVal);
    fgEt.appendChild(etSel); r2.appendChild(fgEt);

    var fgTp = el("div", "irm-fg");
    fgTp.appendChild(el("label", "irm-lbl", { text: "Time Range" }));
    var tpSel = mkSel("irm-sel", TIME_PRESETS, tpVal);
    fgTp.appendChild(tpSel); r2.appendChild(fgTp);

    m.appendChild(r2);

    /* Trigger section */
    m.appendChild(el("div", "irm-sec", { text: "Trigger" }));

    var fgTt = el("div", "irm-fg");
    var ttLblRow = el("div", "irm-lbl-row");
    ttLblRow.appendChild(el("span", "irm-lbl", { text: "Trigger Type" }));

    var infoIcon = el("i", "irm-info", { text: "i" });
    var tip = el("div", "irm-tip");
    tip.innerHTML = [
      "<strong>STATS_CHANGE</strong> — fires in real-time whenever the metric",
      " satisfies the condition at the moment of evaluation (latency ~7.5 min).",
      " Can fire repeatedly — every evaluation cycle where the condition holds.",
      "<br>Operators: <strong>&gt; &lt;</strong>",
      " &nbsp;·&nbsp; Time range: Today or Lifetime",
      "<br><em>Example: CPC &gt; $2 → pause. If CPC drops then rises again, fires again.</em>",
      "<hr>",
      "<strong>STATS_MILESTONE</strong> — fires each time the metric crosses",
      " a new multiple of the specified value. If value = 1000 impressions,",
      " it fires at 1000, then again at 2000, 3000, etc.",
      "<br>Operator: <strong>=</strong> (required) &nbsp;·&nbsp; Time range: <strong>Lifetime</strong> (forced)",
      "<br>FB minimums: impressions ≥ 1 000, spend ≥ 1 000 cents, results ≥ 5, clicks ≥ 10",
      "<br><em>Example: Spend = $50 → fires at $50, $100, $150… every $50 spent.</em>",
    ].join("");
    infoIcon.appendChild(tip);
    ttLblRow.appendChild(infoIcon);

    fgTt.appendChild(ttLblRow);
    var ttSel = mkSel("irm-sel", TRIGGER_TYPES, trigType);
    fgTt.appendChild(ttSel);
    m.appendChild(fgTt);

    /* Milestone info note */
    var msNote = el("div", "irm-note");
    msNote.innerHTML = "<strong>STATS_MILESTONE</strong> — fires when metric first reaches a value multiple. " +
      "Time range is forced to Lifetime. Use the <strong>= (exact)</strong> operator. " +
      "FB minimum thresholds: impressions ≥ 1 000, spend ≥ 1 000 cents, results ≥ 5.";

    function syncMilestoneUI() {
      var isMilestone = ttSel.value === "STATS_MILESTONE";
      msNote.style.display = isMilestone ? "block" : "none";
      if (isMilestone) { tpSel.value = "LIFETIME"; tpSel.disabled = true; }
      else { tpSel.disabled = false; }
    }
    ttSel.onchange = syncMilestoneUI;
    m.appendChild(msNote);
    syncMilestoneUI();

    /* Trigger condition */
    var fgTr = el("div", "irm-fg");
    fgTr.appendChild(el("label", "irm-lbl", { text: "Trigger Condition (Field / Operator / Value)" }));
    var trRow = el("div", "irm-cr");

    var trFld = mkSel("irm-sel", FIELDS, trig.field || "cost_per");
    trRow.appendChild(trFld);
    var trOp = mkSel("irm-sel", OPERATORS, trig.operator || "GREATER_THAN");
    trRow.appendChild(trOp);
    var trVal = el("input", "irm-inp", { type: "number", min: "0", step: "0.01", placeholder: "Value" });
    trVal.value = trig.field ? apiToDisplay(trig.field, trig.value || "0") : "";
    trRow.appendChild(trVal);
    trRow.appendChild(el("span")); // grid spacer

    trFld.onchange = function () { trVal.step = CURRENCY_FIELDS.has(trFld.value) ? "0.01" : "1"; };
    fgTr.appendChild(trRow);
    m.appendChild(fgTr);

    /* Extra filters */
    m.appendChild(el("div", "irm-sec", { text: "Additional Filters (optional, max 4)" }));
    var filtersCont = el("div");
    m.appendChild(filtersCont);

    var addFBtn = el("button", "irm-af", { text: "+ Add Filter Condition" });
    addFBtn.type = "button";
    m.appendChild(addFBtn);

    function addFilterRow(ef) {
      if (filtersCont.querySelectorAll(".irm-cr").length >= 4) {
        log("Maximum 4 additional filters.", "warn"); return;
      }
      var fr = el("div", "irm-cr");
      var ff = mkSel("irm-sel", FIELDS, ef ? ef.field : "spent");
      var fo = mkSel("irm-sel", OPERATORS, ef ? ef.operator : "GREATER_THAN");
      var fv = el("input", "irm-inp", { type: "number", min: "0", step: CURRENCY_FIELDS.has(ff.value) ? "0.01" : "1", placeholder: "Value" });
      if (ef) fv.value = apiToDisplay(ef.field, ef.value);
      var rm = el("button", "irm-rm", { text: "×" }); rm.type = "button"; rm.onclick = function () { fr.remove(); };
      ff.onchange = function () { fv.step = CURRENCY_FIELDS.has(ff.value) ? "0.01" : "1"; };
      [ff, fo, fv, rm].forEach(function (x) { fr.appendChild(x); });
      filtersCont.appendChild(fr);
    }
    addFBtn.onclick = function () { addFilterRow(null); };
    extra.forEach(addFilterRow);

    /* Action + Status row */
    var r3 = el("div", "irm-r2");

    var fgEx = el("div", "irm-fg");
    fgEx.appendChild(el("label", "irm-lbl", { text: "Action on trigger" }));
    var execSel = mkSel("irm-sel", EXEC_TYPES, execTypeVal);
    fgEx.appendChild(execSel); r3.appendChild(fgEx);

    var fgSt = el("div", "irm-fg");
    fgSt.appendChild(el("label", "irm-lbl", { text: "Status" }));
    var stSel = mkSel("irm-sel", [{ v: "ENABLED", l: "Enabled" }, { v: "DISABLED", l: "Disabled" }], statusVal);
    if (isNew) stSel.value = "ENABLED";
    fgSt.appendChild(stSel); r3.appendChild(fgSt);

    m.appendChild(r3);

    /* Footer */
    var mft = el("div", "irm-mft");
    mft.appendChild(el("div"));

    var mfr = el("div", "irm-mfr");
    var cancelBtn = el("button", "irm-btn irm-btn-gh", { text: "Cancel" });
    cancelBtn.onclick = function () { overlay.remove(); };
    mfr.appendChild(cancelBtn);

    var saveBtn = el("button", "irm-btn irm-btn-y", { text: isNew ? "⚡ Create Rule" : "💾 Save Changes" });
    saveBtn.onclick = function () {
      doSave(overlay, saveBtn, isNew, rule, {
        nameInp: nameInp, etSel: etSel, tpSel: tpSel, ttSel: ttSel,
        trFld: trFld, trOp: trOp, trVal: trVal,
        filtersCont: filtersCont, execSel: execSel, stSel: stSel,
      });
    };
    mfr.appendChild(saveBtn);
    mft.appendChild(mfr);
    m.appendChild(mft);

    document.body.appendChild(overlay);
    nameInp.focus();
  }

  // ───────────────────────────────────────────────────────────────
  // Save rule
  // ───────────────────────────────────────────────────────────────
  async function doSave(overlay, saveBtn, isNew, rule, f) {
    var name = f.nameInp.value.trim();
    if (!name)           { log("Rule name is required.", "error");      return; }
    if (!f.trVal.value)  { log("Trigger value is required.", "error"); return; }
    if (!S.accountId)    { log("No account selected.", "error");        return; }

    var evalSpec = {
      evaluation_type: "TRIGGER",
      trigger: {
        type:     f.ttSel.value,
        field:    f.trFld.value,
        value:    displayToApi(f.trFld.value, f.trVal.value),
        operator: f.trOp.value,
      },
      filters: [
        { field: "entity_type", value: f.etSel.value, operator: "EQUAL" },
        { field: "time_preset",  value: f.tpSel.value, operator: "EQUAL" },
      ],
    };

    f.filtersCont.querySelectorAll(".irm-cr").forEach(function (fr) {
      var inputs = fr.querySelectorAll("select,input[type=number]");
      var ff = inputs[0], fo = inputs[1], fv = inputs[2];
      if (ff && fo && fv && fv.value.trim()) {
        evalSpec.filters.push({ field: ff.value, operator: fo.value, value: displayToApi(ff.value, fv.value) });
      }
    });

    var execSpec = { execution_type: f.execSel.value };
    var status   = f.stSel.value;

    saveBtn.disabled = true;
    saveBtn.innerHTML = "<span class='irm-spin'>⚙</span>" + (isNew ? "Creating…" : "Saving…");
    log((isNew ? "Creating" : "Updating") + " rule \"" + name + "\"…");

    try {
      var res = isNew
        ? await apiCreate(S.accountId, name, evalSpec, execSpec, status)
        : await apiUpdate(rule.id, name, evalSpec, execSpec, status);

      if (res && res.error) throw new Error(res.error.message);
      overlay.remove();
      log("Rule \"" + name + "\" " + (isNew ? "created" : "updated") + ".", "success");
      await switchAccount(S.accountId);
    } catch (e) {
      log("Error: " + (e.message || e), "error");
      saveBtn.disabled = false;
      saveBtn.textContent = isNew ? "⚡ Create Rule" : "💾 Save Changes";
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Copy as Bookmark
  // Uses Function.toString() on the outer _IRM function —
  // the bookmarklet redefines _IRM and calls it.
  // ───────────────────────────────────────────────────────────────
  function copyAsBookmark() {
    try {
      var fnSrc = window._IRM.toString();
      var wrapped = "var _IRM=" + fnSrc + ";window._IRM=_IRM;_IRM();";
      var b64 = btoa(unescape(encodeURIComponent(wrapped)));
      var bookmarklet = "javascript:eval(\"(async()=>{\" + decodeURIComponent(escape(atob(\"" + b64 + "\"))) + \"})();\");";

      var copied = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(bookmarklet)
          .then(function () { alert("✅ Bookmarklet copied!\n\nCreate a new browser bookmark and paste this as its URL."); })
          .catch(fallback);
      } else {
        fallback();
      }

      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = bookmarklet;
        ta.style.cssText = "position:fixed;top:-9999px;";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        alert("✅ Bookmarklet copied!\n\nCreate a new browser bookmark and paste this as its URL.");
      }
    } catch (e) {
      alert("Error creating bookmarklet: " + e.message);
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Init
  // ───────────────────────────────────────────────────────────────
  async function init() {
    // Loading splash
    var splash = el("div");
    splash.style.cssText = [
      "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);",
      "padding:18px 32px;background:#111000;color:#ffd700;",
      "border-radius:10px;z-index:999999;",
      "font-family:-apple-system,sans-serif;font-size:15px;font-weight:800;",
      "box-shadow:0 8px 32px rgba(0,0,0,.9);border:2px solid #ffd700;letter-spacing:.3px;",
    ].join("");
    splash.textContent = "⚡ Instant Rules Manager — Loading…";
    document.body.appendChild(splash);

    try {
      buildPanel();

      S.accounts = await fetchAccounts();
      populateAccounts();
      log("Loaded " + S.accounts.length + " accounts.", "success");
      statusEl.textContent = S.accounts.length + " accounts";

      // Auto-select from FB page context
      var autoId = "";
      try {
        autoId = String(require("BusinessUnifiedNavigationContext").adAccountID).replace("act_", "");
      } catch (_) {}

      if (autoId && S.accounts.find(function (a) { return a.id === autoId; })) {
        accSelEl.value = autoId;
        switchAccount(autoId);
      } else if (S.accounts.length) {
        accSelEl.value = S.accounts[0].id;
        switchAccount(S.accounts[0].id);
      }
    } catch (e) {
      log("Error loading accounts: " + (e.message || e), "error");
      statusEl.textContent = "Error";
    } finally {
      splash.remove();
    }
  }

  init();
};

// Entry point — stored globally for bookmarklet self-reference
window._IRM = _IRM;
_IRM();
