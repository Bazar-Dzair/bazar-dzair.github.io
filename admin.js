/* Bazar Dzair — لوحة تحكم الإضافات (admin.js) */
(function () {
  "use strict";
  var ADMINS = {
    metaPixel:    { label: "Meta Pixel",    sub: "Facebook / Instagram",      emoji: "🅵", hint: "من لوحة Meta Events Manager — معرّف Pixel رقمي" },
    tiktokPixel:  { label: "TikTok Pixel",  sub: "TikTok Ads",                emoji: "🎵", hint: "TikTok Pixel ID من TikTok Ads Manager" },
    googleAnalytics: { label: "Google Analytics", sub: "GA4 Measurement ID",  emoji: "📊", placeholder: "G-XXXXXXXX" },
    googleTagManager: { label: "Google Tag Manager", sub: "Container ID",     emoji: "🏷️", placeholder: "GTM-XXXXXXX", hint: "يُحمَّل مرة واحدة مع dataLayer ونظام أحداث حقيقي يغذّي الـ tags" },
    snapchatPixel:{ label: "Snapchat Pixel", sub: "Snap Pixel",                emoji: "👻", hint: "Snap Pixel ID من Snap Ads Manager" },
    pinterestTag: { label: "Pinterest Tag",  sub: "Conversion Tag",            emoji: "📌", hint: "Pinterest Tag ID من Pinterest Analytics" },
    googleSheets: { label: "Google Sheets",  sub: "إرسال الطلبات",             emoji: "📋" }
  };
  var ORDER = ["metaPixel", "tiktokPixel", "googleAnalytics", "googleTagManager", "snapchatPixel", "pinterestTag", "googleSheets"];
  var STATUS_LABELS = { off: "غير مفعّلة", "needs-config": "تحتاج إعداد", connected: "متصلة", error: "خطأ", init: "…" };
  var CONN_CLASS = { off: "off", "needs-config": "needs", connected: "connected", error: "error", init: "init" };

  var settings = null;

  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function label(key) { return ADMINS[key] ? ADMINS[key].label : key; }
  function toast(msg, type) {
    var t = $("toast"); if (!t) return;
    t.textContent = msg; t.className = "";
    t.classList.add("toast", "show", type || "");
    clearTimeout(window.__toastT);
    window.__toastT = setTimeout(function () { t.classList.remove("show"); }, 3200);
  }

  function defaults() {
    return {
      metaPixel: { enabled: false, id: "" }, tiktokPixel: { enabled: false, id: "" },
      googleAnalytics: { enabled: false, id: "" }, googleTagManager: { enabled: false, id: "" },
      snapchatPixel: { enabled: false, id: "" }, pinterestTag: { enabled: false, id: "" },
      googleSheets: { enabled: false, endpoint: "", sheetId: "", sheetName: "", fields: [] },
      searchConsole: { enabled: false, id: "" },
      _meta: { updatedAt: "", adminPassword: "" }
    };
  }
  function merge(base, over) {
    var d = defaults();
    ORDER.concat(["searchConsole"]).forEach(function (k) { d[k] = Object.assign({}, d[k], base[k] || {}, over[k] || {}); });
    d.googleSheets = Object.assign({}, d.googleSheets, base.googleSheets || {}, over.googleSheets || {});
    d._meta = Object.assign({}, d._meta, base._meta || {}, over._meta || {});
    return d;
  }
  function runtimeSettings() { return (window.BazarIntegrations && window.BazarIntegrations.getSettings()) || defaults(); }
  function normalize() { if (!settings) settings = merge(defaults(), runtimeSettings()); return settings; }

  /* ---------- البوابة ---------- */
  function gateOn() { document.body.classList.add("gating"); $("gate").style.display = "flex"; }
  function gateOff() { document.body.classList.remove("gating"); $("gate").style.display = "none"; }
  function gateSubmit() {
    var pass = ($("gatePass").value || "").trim();
    var stored = (settings._meta && settings._meta.adminPassword) || "bazar2024";
    if (pass === stored) { gateOff(); renderAll(); }
    else toast("كلمة مرور غير صحيحة", "err");
  }

  function statusFor(key) {
    var st = (window.BazarIntegrations && window.BazarIntegrations.getStatus()) || {};
    var s = st[key]; return s ? s.state : "off";
  }

  /* ---------- الرسم ---------- */
  function renderAll() { renderGlobal(); renderCards(); refreshDebug(); }
  function renderGlobal() {
    var on = ORDER.filter(function (k) { var s = settings[k]; return s && s.enabled === true; }).length;
    $("globalStatus").innerHTML = '<span class="conn-pill init"><span class="dot"></span>' + on + " مفعّلة من 7</span>";
  }
  function renderCards() {
    var wrap = $("cards"); if (!wrap) return;
    wrap.innerHTML = "";
    ORDER.forEach(function (key) { wrap.appendChild(buildCard(key)); });
  }

  function buildCard(key) {
    var cfg = ADMINS[key], sv = settings[key];
    var card = document.createElement("section");
    card.className = "card"; card.dataset.svc = key;

    var st = statusFor(key);
    var pill = '<span class="conn-pill ' + (CONN_CLASS[st] || "init") + '"><span class="dot"></span>' + esc(STATUS_LABELS[st] || st) + "</span>";
    var toggle = '<label class="switch"><input type="checkbox" class="bzdp-toggle"' + (sv.enabled ? " checked" : "") + ' aria-label="' + esc(cfg.label) + '"><span class="slider"></span></label>';

    var head = document.createElement("div");
    head.className = "card-head";
    head.innerHTML = '<div class="card-title"><span class="logo">' + esc(cfg.emoji) + "</span><div><h3>" + esc(cfg.label) + '</h3><small>' + esc(cfg.sub) + "</small></div></div>";
    head.innerHTML += '<span>' + pill + "</span><span>" + toggle + "</span>";

    var fields = document.createElement("div");
    fields.className = "fields";
    if (key === "googleSheets") {
      fields.appendChild(inputField(key, "endpoint", "Webhook URL (Google Apps Script)", sv.endpoint, "https://script.google.com/macros/s/…/exec"));
      var gs = document.createElement("div"); gs.className = "gs-row";
      gs.innerHTML = inputHTML(key, "sheetId", "Google Sheets ID", sv.sheetId, "من رابط الجدول (1xxx…)") +
        inputHTML(key, "sheetName", "اسم الـ Sheet", sv.sheetName, "Orders");
      fields.appendChild(gs);
      fields.appendChild(inputField(key, "fields", "أعمدة محددة (اختياري) مفصولة بفاصلة", (sv.fields || []).join(","), "customerName,customerPhone,wilaya,address,total"));
    } else {
      fields.appendChild(inputField(key, "id", cfg.label + " ID", sv.id, cfg.placeholder || cfg.hint || ""));
    }

    var hint = document.createElement("div");
    hint.className = "info-note"; hint.textContent = cfg.hint || cfg.placeholder || "";

    var actions = document.createElement("div");
    actions.className = "actions";
    actions.innerHTML = '<button class="btn btn-dark" data-act="save" data-sv="' + key + '">💾 حفظ</button>' +
      '<button class="btn btn-test" data-act="test" data-sv="' + key + '">🎯 اختبار الاتصال</button>';

    var res = document.createElement("div"); res.id = "test_" + key; res.className = "test-result";

    card.appendChild(head); card.appendChild(fields); card.appendChild(hint); card.appendChild(actions); card.appendChild(res);
    return card;
  }
  function inputHTML(sv, id, lbl, val, ph) {
    return '<div><label class="label">' + esc(lbl) + "</label><input data-sv=\"" + sv + "\" data-id=\"" + id + "\" value=\"" + esc(val) + '" placeholder="' + esc(ph) + '"></div>';
  }
  function inputField(sv, id, lbl, val, ph) {
    var d = document.createElement("div"); d.className = "field-row";
    d.innerHTML = '<div class="grow"><label class="label">' + esc(lbl) + '</label><input data-sv="' + sv + '" data-id="' + id + '" value="' + esc(val) + '" placeholder="' + esc(ph) + '"></div>';
    return d;
  }

  /* ---------- أحداث الإدخال ---------- */
  function applyInput(el) {
    var sv = el.dataset.sv, id = el.dataset.id;
    if (!sv || !id || !settings[sv]) return;
    if (id === "fields") settings[sv][id] = el.value.split(/[,؛]/).map(function (x) { return x.trim(); }).filter(Boolean);
    else settings[sv][id] = el.value.trim();
  }
  function applyToggle(el) {
    var card = el.closest(".card"); if (!card) return;
    var sv = card.dataset.svc; if (!settings[sv]) return;
    settings[sv].enabled = el.checked;
  }

  /* ---------- حفظ ---------- */
  function persist() {
    var localOnly = false;
    if (window.BazarIntegrations && window.BazarIntegrations.saveSettings) {
      window.BazarIntegrations.saveSettings(JSON.parse(JSON.stringify(settings)));
    } else {
      settings._bz = true;
      localStorage.setItem("bazar_addon_settings", JSON.stringify(settings));
      localOnly = true;
    }
    return localOnly;
  }
  function save() { var loc = persist(); renderAll(); toast(loc ? "حُفظت الإعدادات محليًا على هذا المتصفح" : "✅ حُفظت جميع الإعدادات وطُبّقت", "ok"); }

  /* ---------- عملية تثبيت ---------- */
  function runTest(key) {
    var res = $("test_" + key); if (!res) return;
    if (!window.BazarIntegrations || !window.BazarIntegrations.testConnection) { res.className = "test-result show err"; res.textContent = "النظام غير جاهز بعد، أعد فتح الصفحة"; return; }
    res.className = "test-result show info"; res.textContent = "جاري الاختبار…";
    window.BazarIntegrations.testConnection(key).then(function (r) {
      var lines = (r.results || []).join("\n");
      if (r.ok) { res.className = "test-result show ok"; res.innerHTML = "✅ اختبار ناجح" + (r.ms ? " (" + r.ms + "ms)" : "") + "\n" + esc(lines); toast(label(key) + " متصل ✓", "ok"); }
      else { res.className = "test-result show err"; res.innerHTML = "❌ فشل الاختبار\n" + esc(lines) + (r.error ? "\nالسبب: " + esc(r.error) : ""); toast(label(key) + ": فشل الفحص", "err"); }
      refreshPill(key);
    }).catch(function (e) { res.className = "test-result show err"; res.innerHTML = "❌ خطأ: " + esc(String(e && e.message || e)); refreshPill(key); });
  }
  function refreshPill(key) {
    var card = document.querySelector('.card[data-svc="' + key + '"]');
    if (!card) return;
    var pill = card.querySelector(".conn-pill"); if (!pill) return;
    var st = statusFor(key);
    pill.className = "conn-pill " + (CONN_CLASS[st] || "init");
    pill.innerHTML = '<span class="dot"></span>' + esc(STATUS_LABELS[st] || st);
  }

  function refreshDebug() {
    var body = $("debugBody"); if (!body) return;
    var entries = (window.BazarIntegrations && window.BazarIntegrations.getDebug()) || [];
    if (!entries.length) { body.innerHTML = '<div class="debug-empty">لا توجد أحداث بعد — نفّذ إجراءً فعليًا في المتجر ثم ارجع.</div>'; return; }
    body.innerHTML = entries.slice(0, 60).map(function (e) {
      var tm = new Date(e.t).toLocaleTimeString("ar");
      var cls = e.ok ? "ok" : "err";
      return '<div class="debug-row"><div class="svc">' + esc(e.service) + '</div><div class="ev">' + esc(e.event) + '</div><span class="stk ' + cls + '">' + (e.ok ? "✓" : "✗") + "</span><div>" + esc(e.detail || "") + '<div class="small">' + esc(tm) + "</div></div></div>";
    }).join("");
  }
  function clearDebug() { if (window.BazarIntegrations) window.BazarIntegrations.clearDebug(); refreshDebug(); toast("تم مسح السجل", "ok"); }

  /* ---------- أحداث ---------- */
  function installEvents() {
    document.addEventListener("input", function (e) { var t = e.target; if (t && t.dataset && t.dataset.sv) applyInput(t); });
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains("bzdp-toggle")) { applyToggle(t); return; }
      var btn = t.closest && t.closest("[data-act]");
      if (!btn) return;
      var act = btn.dataset.act, sv = btn.dataset.sv;
      if (act === "save") { save(); }
      else if (act === "test") { runTest(sv); }
    });
    var addonsLink = document.querySelector('.menu a[href="#addons"]');
    if (addonsLink) addonsLink.addEventListener("click", function (e) { e.preventDefault(); });
    document.addEventListener("click", function (e) {
      var lg = e.target.closest && e.target.closest("#logoutBtn");
      if (lg) { gateOn(); $("gatePass").value = ""; }
    });
    if ($("menuBtn")) $("menuBtn").addEventListener("click", function () { $("sidebar").classList.toggle("open"); });
    // ربط تحديث سجل الأحداث مباشرة من الـ runtime
    if (window.BazarIntegrations) {
      window.onBdzpDebugChange = function () { refreshDebug(); };
    }
  }

  /* ---------- بدء ---------- */
  setTimeout(function () {
    normalize();
    if (!(settings._meta && settings._meta.updatedAt)) {
      settings._meta = settings._meta || {};
      settings._meta.adminPassword = settings._meta.adminPassword || "bazar2024";
      settings._meta.updatedAt = new Date().toISOString();
    }
    installEvents();
    gateOn();
    // لا نرسم البطاقات قبل البوابة؛ نرسم عند الدخول فقط لمنع تسريب الإعدادات.
  }, 250);
  function normalize() { settings = merge(defaults(), runtimeSettings()); }

  /* إجراءات عامة للـ onclick */
  window.gateSubmit = gateSubmit;
  window.saveAll = save;
  window.refreshDebug = refreshDebug;
  window.clearDebugLog = clearDebug;
})();