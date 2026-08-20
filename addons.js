/*
 * Bazar Dzair — نظام الإضافات (Integrations Runtime)
 * ===================================================
 * يُحمَّل من <head> في index.html و product.html و admin.html.
 * يقرأ إعدادات الإضافات من LocalStorage (المصدر الأساسي) ثم من
 * Firestore (settings/addons) كنسخة احتياطية، ويركّب أكواد التتبع
 * الحقيقية مرة واحدة، ويوفّر طبقة أحداث موحّدة تُرسل لكل خدمة مفعّلة.
 *
 * الخدمات المدعومة: Meta Pixel, TikTok Pixel, Google Analytics 4,
 * Google Tag Manager, Snapchat Pixel, Pinterest Tag, Google Sheets,
 * و Google Search Console (meta).
 *
 * الضمانات:
 * - لا يُحمَّل أي كود إلا إذا كانت الإضافة مفعّلة ولها معرّف صالح.
 * - منع التكرار: كل سكربت يُركّب مرة واحدة عبر معرفات فريدة + فحص DOM.
 * - منع تكرار الحدث عبر نافذة زمنية + تتبّع حسب معرف الطلب (persistent).
 * - فصل تام بين الأحداث: لا يُرسل حدث إلا عند حدوثه فعليًا في المتجر.
 * - أخطاء التتبع لا تُكسِر المتجر أبدًا (try/catch شامل).
 */
(function () {
  if (window.__bazarIntegrationsLoaded) return;
  window.__bazarIntegrationsLoaded = true;

  var LS_KEY = "bazar_addon_settings";
  var LS_ORDERS = "bazar_orders_log";
  var LS_DEBUG = "bazar_integration_debug";
  var FIRESTORE_BASE = "https://firestore.googleapis.com/v1/projects/bazar-dzair-33816/databases/(default)/documents/";

  var ns = {
    settings: null,
    status: {},
    ready: false,
    getSettings: function () { return ns.settings; },
    getStatus: function () { return ns.status; },
    getDebug: function () { return getDebug(); },
    clearDebug: function () { clearDebug(); }
  };

  /* ---------- أدوات مساعدة ---------- */
  function $(id) { return document.getElementById(id); }
  function isStr(x) { return typeof x === "string"; }
  function trimmed(x) { return isStr(x) ? x.trim() : ""; }
  function enabled(o) { return !!(o && o.enabled === true); }
  function validId(v, re) { var t = trimmed(v); return t ? re.test(t) : false; }

  var head = document.getElementsByTagName("head")[0] || document.documentElement;
  function appendToHead(el) {
    if (head.firstChild) head.insertBefore(el, head.firstChild);
    else head.appendChild(el);
  }

  function externalScript(id, src) {
    if ($(id)) return { loaded: true, created: false };
    var s = document.createElement("script");
    s.id = id; s.src = src; s.async = true;
    s.setAttribute("data-bdzp-inject", "1");
    head.appendChild(s);
    return { loaded: false, created: true, el: s };
  }
  function inlineScript(id, code) {
    if ($(id)) return { loaded: true, created: false };
    var s = document.createElement("script");
    s.id = id; s.text = code; s.setAttribute("data-bdzp-inject", "1");
    head.appendChild(s);
    return { loaded: false, created: true };
  }
  function metaTag(id, name, content, prop) {
    if ($("meta_" + id)) return false;
    var m = document.createElement("meta");
    m.id = "meta_" + id;
    if (prop) m.setAttribute("property", prop); else m.setAttribute("name", name);
    m.content = content;
    head.appendChild(m);
    return true;
  }

  /* ---------- LocalStorage JSON آمن ---------- */
  function lsGet(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  /* ---------- سجل الأحداث / Debug ---------- */
  function getDebug() {
    var d = lsGet(LS_DEBUG);
    return Array.isArray(d) ? d.slice(0, 200) : [];
  }
  function clearDebug() { lsSet(LS_DEBUG, []); refreshDebugBinding(); }
  function logDebug(service, event, ok, detail) {
    var entry = {
      t: new Date().toISOString(),
      service: service,
      event: event,
      ok: !!ok,
      detail: detail || ""
    };
    var d = getDebug();
    d.unshift(entry);
    lsSet(LS_DEBUG, d.slice(0, 200));
    refreshDebugBinding();
    return entry;
  }
  function refreshDebugBinding() {
    if (typeof window.onBdzpDebugChange === "function") {
      try { window.onBdzpDebugChange(getDebug()); } catch (e) {}
    }
  }

  /* ---------- منع التكرار ---------- */
  var recentEvents = {}; // key -> timestamp
  function dedupe(key, ttlMs) {
    if (!key) return true;
    var now = Date.now();
    if (recentEvents[key] && (now - recentEvents[key]) < ttlMs) return false;
    recentEvents[key] = now;
    return true;
  }
  function resetRecentEvents() { recentEvents = {}; }

  // منع إرسال الطلب (Purchase) مرتين لنفس الطلب — تخزين دائم.
  var orderSentSet = null;
  function getOrderSentSet() {
    if (orderSentSet) return orderSentSet;
    orderSentSet = new Set(lsGet("bazar_order_sent") || []);
    return orderSentSet;
  }
  function orderAlreadySent(orderId) {
    if (!orderId) return false;
    return getOrderSentSet().has(String(orderId));
  }
  function markOrderSent(orderId) {
    if (!orderId) return;
    var s = getOrderSentSet();
    s.add(String(orderId));
    try { localStorage.setItem("bazar_order_sent", JSON.stringify(Array.from(s))); } catch (e) {}
  }

  /* ---------- قراءة الإعدادات ---------- */
  function defaultSettings() {
    return {
      metaPixel: { enabled: false, id: "" },
      tiktokPixel: { enabled: false, id: "" },
      googleAnalytics: { enabled: false, id: "" },
      googleTagManager: { enabled: false, id: "" },
      snapchatPixel: { enabled: false, id: "" },
      pinterestTag: { enabled: false, id: "" },
      googleSheets: { enabled: false, endpoint: "", sheetId: "", sheetName: "", fields: [] },
      searchConsole: { enabled: false, id: "" },
      _meta: { updatedAt: "", adminPassword: "" }
    };
  }
  function sanitizeSettings(raw) {
    var d = defaultSettings();
    raw = raw || {};
    function pick(key) {
      var s = raw[key] || {};
      return { enabled: !!s.enabled, id: trimmed(s.id) };
    }
    d.metaPixel = pick("metaPixel");
    d.tiktokPixel = pick("tiktokPixel");
    d.googleAnalytics = pick("googleAnalytics");
    d.googleTagManager = pick("googleTagManager");
    d.snapchatPixel = pick("snapchatPixel");
    d.pinterestTag = pick("pinterestTag");
    d.searchConsole = pick("searchConsole");
    var gs = raw.googleSheets || {};
    d.googleSheets = {
      enabled: !!gs.enabled,
      endpoint: trimmed(gs.endpoint),
      sheetId: trimmed(gs.sheetId),
      sheetName: trimmed(gs.sheetName),
      fields: Array.isArray(gs.fields) ? gs.fields.slice() : []
    };
    d._meta = raw._meta || d._meta;
    return d;
  }

  /* ---------- حلّال قيم Firestore ---------- */
  function fsValue(v) {
    if (!v) return null;
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.nullValue !== undefined) return null;
    if (v.arrayValue) return (v.arrayValue.values || []).map(fsValue);
    if (v.mapValue) return fsMap(v.mapValue.fields);
    return null;
  }
  function fsMap(fields) {
    var out = {}; fields = fields || {};
    Object.keys(fields).forEach(function (k) { out[k] = fsValue(fields[k]); });
    return out;
  }

  function loadFromLocalStorage() {
    var local = lsGet(LS_KEY);
    if (local && local._bz !== true) {
      local._bz = true;
      lsSet(LS_KEY, local);
    }
    return local;
  }
  function fetchRemote(force) {
    if (force === false && lsGet(LS_KEY)) return;
    try {
      var req = new XMLHttpRequest();
      req.open("GET", FIRESTORE_BASE + "settings/addons", true);
      req.setRequestHeader("Accept", "application/json");
      req.onreadystatechange = function () {
        if (req.readyState !== 4) return;
        if (req.status === 200) {
          try {
            var doc = JSON.parse(req.responseText);
            var remote = fsMap((doc && doc.fields) || {});
            // الدمج: القيم المحلية تُعطى أولوية إذا وُجدت، وإلا نستخدم البعيدة.
            var local = lsGet(LS_KEY);
            var merged = remote;
            if (local) {
              ["metaPixel", "tiktokPixel", "googleAnalytics", "googleTagManager", "snapchatPixel", "pinterestTag", "googleSheets", "searchConsole", "_meta"].forEach(function (k) {
                if (local[k] && JSON.stringify(local[k]) !== JSON.stringify(remote[k])) merged[k] = local[k];
              });
            }
            ns.settings = sanitizeSettings(merged);
          } catch (e) { ns.settings = sanitizeSettings(lsGet(LS_KEY)); }
        } else {
          ns.settings = sanitizeSettings(lsGet(LS_KEY));
        }
        ns.ready = true;
        install();
      };
      req.send();
    } catch (e) {
      ns.settings = sanitizeSettings(lsGet(LS_KEY));
      ns.ready = true;
      install();
    }
  }

  /* ---------- تثبيت الأكواد (مرة واحدة لكل خدمة) ---------- */
  var claimed = {};
  function claim(k) { if (claimed[k]) return false; claimed[k] = true; return true; }

  var loadLog = {}; // service -> {loaded, idDetected, scriptLoaded, eventLayerReady, error}

  var RE_GA = /^(G|UA|AW|GT)-[A-Za-z0-9-]{4,}$/;
  var RE_GTM = /^GTM-[A-Za-z0-9]{3,}$/;
  var RE_META = /^[0-9]{8,20}$/;
  var RE_TIKTOK = /^[0-9]{10,25}$/;
  var RE_SNAP = /^[0-9]{6,25}$/;
  var RE_PIN = /^[0-9]{5,20}$/;

  function setStatus(key, state, detail) {
    ns.status[key] = { state: state, detail: detail || "", at: new Date().toISOString() };
  }
  // لا نتجاوز حالة "متصلة/خطأ" المحققة سابقًا عند إعادة التركيب للحفاظ على نتيجة الفحص.
  function setStatusInit(key, detail) {
    var cur = ns.status[key];
    if (cur && (cur.state === "connected" || cur.state === "error")) return;
    setStatus(key, "init", detail || "Loaded — اضغط اختبار الاتصال للتحقق");
  }

  function install() {
    var a = ns.settings || {};
    var on = enabled;

    // ---------- Meta Pixel ----------
    if (on(a.metaPixel) && validId(a.metaPixel.id, RE_META)) {
      if (claim("meta")) {
        loadLog.meta = { id: trimmed(a.metaPixel.id) };
        inlineScript("bzdp_meta_base", [
          "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments);};",
          "if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.queue=[];}",
          "(window,document,'script','https://connect.facebook.net/en_US/fbevents.js','fbq');",
          "fbq('init','" + trimmed(a.metaPixel.id).replace(/"/g, "") + "');"
        ].join(""));
        loadLog.meta.scriptLoaded = true;
        loadLog.meta.eventLayerReady = !!window.fbq;
        setStatusInit("metaPixel", "Script loaded: " + (window.fbq ? "fbq ready" : "loading"));
      }
    } else if (on(a.metaPixel)) {
      setStatus("metaPixel", "needs-config", "Meta Pixel ID غير صالح");
    } else {
      setStatus("metaPixel", "off", "");
    }

    // ---------- TikTok Pixel ----------
    if (on(a.tiktokPixel) && validId(a.tiktokPixel.id, RE_TIKTOK)) {
      if (claim("tiktok")) {
        loadLog.tiktok = { id: trimmed(a.tiktokPixel.id) };
        inlineScript("bzdp_ttq_base", [
          "!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];",
          "ttq.method=ttq.method||function(m){return this.push(m);};",
          "ttq.page=ttq.page||function(){return ttq.method('page',arguments);};",
          "ttq.load=ttq.load||function(){return ttq.method('load',arguments);};",
          "ttq.instance=ttq.instance||function(){return ttq.method('instance',arguments);};",
          "}(window,document,'ttq');"
        ].join(""));
        if (externalScript("bzdp_ttq_src", "https://analytics.tiktok.com/i18n/pixel/start.js?id=" + trimmed(a.tiktokPixel.id)).created) {
          inlineScript("bzdp_ttq_init", "try{ttq.load();ttq.instance('load');}catch(e){}");
        }
        loadLog.tiktok.scriptLoaded = true;
        loadLog.tiktok.eventLayerReady = !!window.ttq;
        setStatusInit("tiktokPixel", "Script loaded: " + (window.ttq ? "ttq ready" : "loading"));
      }
    } else if (on(a.tiktokPixel)) {
      setStatus("tiktokPixel", "needs-config", "TikTok Pixel ID غير صالح");
    } else {
      setStatus("tiktokPixel", "off", "");
    }

    // ---------- Google Analytics 4 ----------
    if (on(a.googleAnalytics) && validId(a.googleAnalytics.id, RE_GA)) {
      if (claim("ga")) {
        loadLog.ga = { id: trimmed(a.googleAnalytics.id) };
        var gid = trimmed(a.googleAnalytics.id).replace(/"/g, "");
        externalScript("bzdp_ga_src", "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(gid));
        inlineScript("bzdp_ga_cfg", [
          "window.dataLayer=window.dataLayer||[];",
          "window.gtag=window.gtag||function(){dataLayer.push(arguments);}",
          "gtag('js',new Date());",
          "gtag('config','" + gid + "');"
        ].join(""));
        loadLog.ga.scriptLoaded = true;
        loadLog.ga.eventLayerReady = typeof window.gtag === "function";
        setStatusInit("googleAnalytics", "GA4 script loaded: " + (loadLog.ga.eventLayerReady ? "gtag ready" : "loading"));
      }
    } else if (on(a.googleAnalytics)) {
      setStatus("googleAnalytics", "needs-config", "Measurement ID غير صالح (مثال: G-XXXXXX)");
    } else {
      setStatus("googleAnalytics", "off", "");
    }

    // ---------- Google Tag Manager ----------
    if (on(a.googleTagManager) && validId(a.googleTagManager.id, RE_GTM)) {
      if (claim("gtm")) {
        loadLog.gtm = { id: trimmed(a.googleTagManager.id) };
        var gtm = trimmed(a.googleTagManager.id).replace(/"/g, "");
        inlineScript("bzdp_gtm_cfg", [
          "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});",
          "var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';",
          "j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);",
          "})(window,document,'script','dataLayer','" + gtm + "');"
        ].join(""));
        inlineScript("bzdp_gtm_noscript", "if(document.body){var no=document.createElement('noscript');no.innerHTML='<iframe src=\"https://www.googletagmanager.com/ns.html?id=" + gtm + "\" height=\"0\" width=\"0\" style=\"display:none;visibility:hidden\"></iframe>';document.body.appendChild(no);}");
        loadLog.gtm.scriptLoaded = true;
        loadLog.gtm.eventLayerReady = !!(window.dataLayer && window.dataLayer.push);
        setStatusInit("googleTagManager", "GTM script loaded: dataLayer ready");
      }
    } else if (on(a.googleTagManager)) {
      setStatus("googleTagManager", "needs-config", "GTM Container ID غير صالح (مثال: GTM-XXXX)");
    } else {
      setStatus("googleTagManager", "off", "");
    }

    // ---------- Snapchat Pixel ----------
    if (on(a.snapchatPixel) && validId(a.snapchatPixel.id, RE_SNAP)) {
      if (claim("snap")) {
        loadLog.snap = { id: trimmed(a.snapchatPixel.id) };
        inlineScript("bzdp_snap_base", [
          "!function(w,d,e,s){var t=w[e]=w[e]||{},n=w.snaptr=w.snaptr||function(){n.handleRequest?window.snaptr(n.loadEvents?function(){n.loadEvents();}():{events:[],args:arguments}):n.queue.push(arguments)};",
          "if(!t.loadEvents){(t.loadEvents=function(){if(n.loaded)return;n.loaded=!0;try{var b=d.getElementsByTagName('script')[0],c=d.createElement('script');c.async=!0;c.src=s;b.parentNode.insertBefore(c,b);}catch(e){}})();}",
          "n.queue=[];t.events={};t.views={};",
          "}(window,document,'snaptr','https://sc-static.net/sc/snaptr.js');"
        ].join(""));
        inlineScript("bzdp_snap_init", "try{snaptr('init','" + trimmed(a.snapchatPixel.id).replace(/"/g, "") + "');}catch(e){}");
        loadLog.snap.scriptLoaded = true;
        loadLog.snap.eventLayerReady = typeof window.snaptr === "function";
        setStatusInit("snapchatPixel", "Snap Pixel loaded: " + (loadLog.snap.eventLayerReady ? "snaptr ready" : "loading"));
      }
    } else if (on(a.snapchatPixel)) {
      setStatus("snapchatPixel", "needs-config", "Snap Pixel ID غير صالح");
    } else {
      setStatus("snapchatPixel", "off", "");
    }

    // ---------- Pinterest Tag ----------
    if (on(a.pinterestTag) && validId(a.pinterestTag.id, RE_PIN)) {
      if (claim("pin")) {
        loadLog.pin = { id: trimmed(a.pinterestTag.id) };
        externalScript("bzdp_pin_src", "https://s.pinimg.com/ct/core.js");
        inlineScript("bzdp_pin_base", [
          "(function(){if(window.pintrk)return;var q=window.pintrk=function(){q.queue=q.queue||[];q.queue.push(arguments);return q;};q.queue=q.queue||[];}());",
          "(function(){window.pintrk('load','page',{tag:'" + trimmed(a.pinterestTag.id).replace(/"/g, "") + "'});}());"
        ].join(""));
        loadLog.pin.scriptLoaded = true;
        loadLog.pin.eventLayerReady = typeof window.pintrk === "function";
        setStatusInit("pinterestTag", "Pinterest Tag loaded: " + (loadLog.pin.eventLayerReady ? "pintrk ready" : "loading"));
      }
    } else if (on(a.pinterestTag)) {
      setStatus("pinterestTag", "needs-config", "Pinterest Tag ID غير صالح");
    } else {
      setStatus("pinterestTag", "off", "");
    }

    // ---------- Google Search Console (meta) ----------
    if (on(a.searchConsole) && trimmed(a.searchConsole.id)) {
      metaTag("gsv", "google-site-verification", trimmed(a.searchConsole.id));
      setStatus("searchConsole", "connected", "Meta verification installed");
    } else {
      setStatus("searchConsole", "off", "");
    }

    // Google Sheets — لا حاجة لتحميل سكربت، يُرسل عبر fetch عند الطلبات.
    if(on(a.googleSheets)){ setStatusInit("googleSheets", trimmed(a.googleSheets.endpoint) ? "Webhook Present — اضغط اختبار الاتصال" : "لا يوجد Webhook URL"); } else setStatus("googleSheets","off","");

    emitPageView();
  }

  /* ---------- توحيد أسماء الأحداث ---------- */
  function canonicalEvent(ev) {
    var s = String(ev || "").toLowerCase().replace(/[^a-z_]/g, "");
    var map = {
      pageview: "page_view", page_view: "page_view",
      viewcontent: "view_item", view_item: "view_item",
      addtocart: "add_to_cart", add_to_cart: "add_to_cart",
      initiatecheckout: "begin_checkout", begin_checkout: "begin_checkout",
      purchase: "purchase", complete_payment: "purchase"
    };
    return map[s] || s || "unknown";
  }

  /* ---------- طبقة إرسال الأحداث الموحّدة ---------- */
  function toItems(data) {
    data = data || {};
    var items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0 && data.product_id) {
      items = [{
        item_id: data.product_id,
        item_name: data.content_name || data.product_name || "",
        price: Number(data.price || 0),
        quantity: Number(data.qty || data.quantity || 1),
        item_category: data.category || ""
      }];
    }
    return items;
  }

  function dispatch(triggerKey, eventCanonical, data, force) {
    var a = ns.settings || {};
    data = data || {};
    var items = toItems(data);
    var value = Number(data.value != null ? data.value : (data.total != null ? data.total : data.price || 0)) || 0;

    if (!force && !dedupe(triggerKey, 2500)) return; // منع التكرار داخل نافذة قصيرة

    // ----- Meta Pixel -----
    if (enabled(a.metaPixel) && validId(a.metaPixel.id, RE_META) && window.fbq) {
      try {
        var mpKey = eventCanonical + "|" + data.product_id + "|" + data.qty;
        if (dedupe("meta_" + mpKey, 5000)) {
          var mpEvent = metaEvent(eventCanonical);
          var mpData = {
            content_name: data.content_name || data.product_name || "",
            content_category: data.category || "",
            content_ids: data.product_id ? [String(data.product_id)] : undefined,
            value: value, currency: "DZD", num_items: items.reduce(function (s, i) { return s + Number(i.quantity || 1); }, 0)
          };
          if (eventCanonical === "purchase" && data.transaction_id) { mpData.transaction_id = data.transaction_id; mpData.value = value; }
          fbq("track", mpEvent, mpData);
          logDebug("Meta Pixel", mpEvent, true, "value=" + value);
        }
      } catch (e) { setStatus("metaPixel","error","Dispatch error"); logDebug("Meta Pixel", eventCanonical, false, String(e && e.message || e)); }
    }

    // ----- TikTok -----
    if (enabled(a.tiktokPixel) && window.ttq) {
      try {
        var tkEvent = tiktokEvent(eventCanonical);
        if (tkEvent && dedupe("tiktok_" + tkEvent + "|" + data.product_id + "|" + data.qty, 5000)) {
          ttq(tkEvent, {
            contents: items.map(function (i) { return { content_id: i.item_id, content_name: i.item_name, quantity: Number(i.quantity || 1), price: Number(i.price || 0) }; }),
            value: value, currency: "DZD",
            content_type: "product"
          });
          if (eventCanonical === "purchase" && data.transaction_id) ttq("complete_payment", { order_id: data.transaction_id, value: value, currency: "DZD", contents: items });
          logDebug("TikTok Pixel", tkEvent, true, "value=" + value);
        }
      } catch (e) { setStatus("tiktokPixel","error","Dispatch error"); logDebug("TikTok Pixel", eventCanonical, false, String(e && e.message || e)); }
    }

    // ----- Google Analytics 4 -----
    if (enabled(a.googleAnalytics) && typeof window.gtag === "function") {
      try {
        var gaMap = { page_view: "page_view", view_item: "view_item", add_to_cart: "add_to_cart", begin_checkout: "begin_checkout", purchase: "purchase" };
        var gaEv = gaMap[eventCanonical];
        if (gaEv && dedupe("ga_" + gaEv + "|" + data.product_id + "|" + data.qty, 5000)) {
          if (gaEv === "page_view") {
            gtag("event", "page_view", { page_title: document.title, page_location: location.href, page_path: location.pathname });
          } else if (gaEv === "view_item") {
            gtag("event", "view_item", { currency: "DZD", value: value, items: items });
          } else if (gaEv === "add_to_cart") {
            gtag("event", "add_to_cart", { currency: "DZD", value: value, items: items });
          } else if (gaEv === "begin_checkout") {
            gtag("event", "begin_checkout", { currency: "DZD", value: value, items: items });
          } else if (gaEv === "purchase") {
            gtag("event", "purchase", { transaction_id: data.transaction_id || "", currency: "DZD", value: value, shipping: Number(data.shipping || 0), items: items, affiliation: data.source || "Bazar Dzair" });
          }
          logDebug("Google Analytics", gaEv, true, "value=" + value);
        }
      } catch (e) { setStatus("googleAnalytics","error","Dispatch error"); logDebug("Google Analytics", eventCanonical, false, String(e && e.message || e)); }
    }

    // ----- Google Tag Manager (dataLayer) -----
    if (enabled(a.googleTagManager) && window.dataLayer && window.dataLayer.push) {
      try {
        var dlMap = { page_view: "page_view", view_item: "view_item", add_to_cart: "add_to_cart", begin_checkout: "begin_checkout", purchase: "purchase" };
        var dlEv = dlMap[eventCanonical];
        if (dlEv && dedupe("gtm_" + dlEv + "|" + data.product_id + "|" + data.qty, 5000)) {
          window.dataLayer.push({
            event: dlEv,
            ecommerce: {
              currency: "DZD",
              value: value,
              items: items
            },
            transaction_id: data.transaction_id || "",
            shipping: Number(data.shipping || 0)
          });
          logDebug("GTM", dlEv, true, "dataLayer.push");
        }
      } catch (e) { setStatus("googleTagManager","error","Dispatch error"); logDebug("GTM", eventCanonical, false, String(e && e.message || e)); }
    }

    // ----- Snapchat Pixel -----
    if (enabled(a.snapchatPixel) && typeof window.snaptr === "function") {
      try {
        var snapEv = snapEvent(eventCanonical);
        if (snapEv && dedupe("snap_" + snapEv + "|" + data.product_id + "|" + data.qty, 5000)) {
          var sd = { item_ids: items.map(function (i) { return String(i.item_id !== undefined ? i.item_id : ""); }) };
          if (eventCanonical !== "page_view") { sd.price = value; sd.currency = "DZD"; }
          snaptr("track", snapEv, sd);
          logDebug("Snapchat", snapEv, true, "value=" + value);
        }
      } catch (e) { setStatus("snapchatPixel","error","Dispatch error"); logDebug("Snapchat", eventCanonical, false, String(e && e.message || e)); }
    }

    // ----- Pinterest Tag -----
    if (enabled(a.pinterestTag) && typeof window.pintrk === "function") {
      try {
        var pinEv = pinterestEvent(eventCanonical);
        if (pinEv && dedupe("pin_" + pinEv + "|" + data.product_id + "|" + data.qty, 5000)) {
          var pd = {
            currency: "DZD", value: value,
            product_id: data.product_id ? [String(data.product_id)] : undefined,
            line_items: items.map(function (i) { return { product_id: i.item_id, product_name: i.item_name, product_price: Number(i.price || 0), product_quantity: Number(i.quantity || 1) }; })
          };
          if (eventCanonical === "purchase" && data.transaction_id) pd.order_id = data.transaction_id;
          pintrk("track", pinEv, pd);
          logDebug("Pinterest", pinEv, true, "value=" + value);
        }
      } catch (e) { setStatus("pinterestTag","error","Dispatch error"); logDebug("Pinterest", eventCanonical, false, String(e && e.message || e)); }
    }
  }

  /* ---------- خرائط الأحداث لكل خدمة ---------- */
  function metaEvent(c) {
    return { page_view: "PageView", view_item: "ViewContent", add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout", purchase: "Purchase" }[c] || null;
  }
  function tiktokEvent(c) {
    return { page_view: "page_view", view_item: "view_content", add_to_cart: "add_to_cart", begin_checkout: "initiate_checkout", purchase: "complete_payment" }[c] || null;
  }
  function snapEvent(c) {
    return { page_view: "PAGE_VIEW", view_item: "VIEW_CONTENT", add_to_cart: "ADD_CART", begin_checkout: "START_CHECKOUT", purchase: "PURCHASE" }[c] || null;
  }
  function pinterestEvent(c) {
    return { page_view: "signup", view_item: "viewcategory", add_to_cart: "addtocart", begin_checkout: "checkout", purchase: "checkout" }[c] || null;
  }

  function emitPageView() {
    if (!ns.ready) return;
    setTimeout(function () {
      dispatch("pageview_once", "page_view", { value: 0, product_id: "" }, true);
    }, 600);
  }

  /* ---------- Google Sheets ---------- */
  function buildPayload(order) {
    order = order || {};
    var items = Array.isArray(order.items) ? order.items : [];
    return {
      "Order ID": order.orderId || order.transaction_id || "",
      "التاريخ": order.date || new Date().toISOString(),
      "اسم الزبون": order.customerName || order.name || "",
      "رقم الهاتف": order.customerPhone || order.phone || "",
      "الولاية": order.wilaya || "",
      "البلدية / العنوان": order.address || "",
      "المنتجات": items.map(function (i) { return i.item_name || i.name || ""; }).join(" | "),
      "الكمية": items.reduce(function (s, i) { return s + Number(i.quantity || 1); }, 0),
      "السعر": items.reduce(function (s, i) { return s + Number(i.quantity || 1) * Number(i.price || 0); }, 0),
      "الشحن": Number(order.shipping || 0),
      "الإجمالي": Number(order.total || order.value || 0),
      "حالة الطلب": order.status || "جديد",
      "مصدر الطلب": order.source || "Bazar Dzair",
      "رابط المنتج": order.productUrl || ""
    };
  }
  function createOrderRecord(order) {
    var log = lsGet(LS_ORDERS);
    if (!Array.isArray(log)) log = [];
    log.unshift(order);
    lsSet(LS_ORDERS, log.slice(0, 100));
  }
  function sendToGoogleSheets(order) {
    var gs = (ns.settings || {}).googleSheets || {};
    return new Promise(function (resolve) {
      if (!enabled(gs) || !trimmed(gs.endpoint)) { resolve({ ok: false, error: "Google Sheets غير مفعّل أو لا يوجد Webhook" }); return; }
      var payload = buildPayload(order);
      // أعمدة مخصّصة إن حُدّدت
      if (Array.isArray(gs.fields) && gs.fields.length) {
        var pick = {};
        var mapAlias = {
          orderId: "Order ID", customerName: "اسم الزبون", customerPhone: "رقم الهاتف",
          wilaya: "الولاية", address: "البلدية / العنوان", total: "الإجمالي", shipping: "الشحن", status: "حالة الطلب"
        };
        gs.fields.forEach(function (f) {
          var real = mapAlias[f] || f;
          if (payload[real] !== undefined) pick[real] = payload[real];
        });
        resolveWith(pick);
      } else {
        resolveWith(payload);
      }
      function resolveWith(body) {
        try {
          fetch(trimmed(gs.endpoint), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          }).then(function (r) {
            if (r.ok) { logDebug("Google Sheets", "order", true, (order.orderId || "") + " ✓"); resolve({ ok: true }); }
            else { r.text().then(function (t) { var err = "HTTP " + r.status + " " + String(t || "").slice(0, 200); logDebug("Google Sheets", "order", false, err); resolve({ ok: false, error: err }); }); }
          }).catch(function (e) { var err = String(e && e.message || e); logDebug("Google Sheets", "order", false, err); resolve({ ok: false, error: err }); });
        } catch (e) { var err = String(e && e.message || e); logDebug("Google Sheets", "order", false, err); resolve({ ok: false, error: err }); }
      }
    });
  }

  /* ---------- إرسال أمر كامل + Purchase (يُستدعى بعد نجاح إنشاء الطلب) ---------- */
  function sendOrder(order) {
    order = order || {};
    if (!order.orderId) order.orderId = "BDZ-" + Date.now() + "-" + Math.floor(Math.random() * 900 + 100);
    if (!order.date) order.date = new Date().toISOString();
    if (order.total == null && order.value != null) order.total = order.value;

    // منع إرسال نفس الطلب مرتين (Purchase أو Sheets)
    if (orderAlreadySent(order.orderId)) return Promise.resolve({ ok: true, deduped: true });
    markOrderSent(order.orderId);

    createOrderRecord(order);

    var tasks = [];
    // إرسال إلى Google Sheets أولًا
    tasks.push(sendToGoogleSheets(order).then(function (res) {
      order._sheets = res;
      return res;
    }));

    // إطلاق Purchase
    tasks.push(new Promise(function (resolve) {
      dispatch("purchase_" + order.orderId, "purchase", {
        transaction_id: order.orderId, value: order.total, total: order.total,
        shipping: order.shipping, items: order.items, content_name: order.customerName, source: order.source
      }, true);
      resolve({ ok: true });
    }));

    return Promise.all(tasks).then(function () {
      return { ok: true, orderId: order.orderId, sheets: order._sheets };
    });
  }

  /* ---------- اختبار الاتصال (فحص حقيقي) ---------- */
  function reachable(url) {
    return fetch(url, { method: "HEAD", mode: "no-cors", cache: "no-store" }).then(function () { return true; }).catch(function () { return false; });
  }

  function testConnection(serviceKey) {
    var a = ns.settings || {};
    var cfg = a[serviceKey] || {};
    var t0 = Date.now();
    return new Promise(function (resolve) {
      var base = { service: serviceKey, id: trimmed(cfg.id), at: new Date().toISOString() };
      var done = false;
      function r2(res) {
        if (!done) {
          done = true;
          if (res.ok) setStatus(serviceKey, "connected", res.error ? "" : "تم التحقق ✓");
          else setStatus(serviceKey, "error", res.error || "فشل الفحص");
        }
        resolve(res);
        return res;
      }

      if (!enabled(cfg)) { resolve(Object.assign({}, base, { ok: false, error: "الإضافة غير مفعّلة", results: ["Addon disabled"] })); return; }

      var id = trimmed(cfg.id);
      var checkId = function (re, sample) { if (!id) return "ID فارغ"; return re.test(id) ? "ID detected ✓" : ("ID غير صالح — مثال: " + sample); };
      var scriptSrc = null;

      switch (serviceKey) {
        case "metaPixel":
          if (!validId(id, RE_META)) return r2(Object.assign({}, base, { ok: false, error: checkId(RE_META, "1234567890") }));
          scriptSrc = "https://connect.facebook.net/en_US/fbevents.js";
          break;
        case "tiktokPixel":
          if (!validId(id, RE_TIKTOK)) return r2(Object.assign({}, base, { ok: false, error: checkId(RE_TIKTOK, "1234567890") }));
          scriptSrc = "https://analytics.tiktok.com/i18n/pixel/start.js";
          break;
        case "googleAnalytics":
          if (!validId(id, RE_GA)) return r2(Object.assign({}, base, { ok: false, error: checkId(RE_GA, "G-XXXXXXX") }));
          scriptSrc = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
          break;
        case "googleTagManager":
          if (!validId(id, RE_GTM)) return r2(Object.assign({}, base, { ok: false, error: checkId(RE_GTM, "GTM-XXXX") }));
          scriptSrc = "https://www.googletagmanager.com/gtm.js?id=" + encodeURIComponent(id);
          break;
        case "snapchatPixel":
          if (!validId(id, RE_SNAP)) return r2(Object.assign({}, base, { ok: false, error: checkId(RE_SNAP, "1234567890") }));
          scriptSrc = "https://sc-static.net/sc/snaptr.js";
          break;
        case "pinterestTag":
          if (!validId(id, RE_PIN)) return r2(Object.assign({}, base, { ok: false, error: checkId(RE_PIN, "2612345678") }));
          scriptSrc = "https://s.pinimg.com/ct/core.js";
          break;
        case "googleSheets":
          if (!trimmed(cfg.endpoint)) return r2(Object.assign({}, base, { ok: false, error: "لا يوجد Webhook URL", results: ["No endpoint configured"] }));
          return reachable(trimmed(cfg.endpoint)).then(function (ok) {
            if (ok) r2(Object.assign({}, base, { ok: true, ms: Date.now() - t0, results: ["Webhook reachable ✓", "ID: " + (cfg.sheetId || "—"), "Sheet: " + (cfg.sheetName || "—")] }));
            else r2(Object.assign({}, base, { ok: false, error: "تعذّر الوصول إلى Webhook (قد يحتاج Apps Script Web App)", results: ["Endpoint not reachable via HEAD"] }));
          });
        default:
          return r2(Object.assign({}, base, { ok: true, results: [] }));
      }

      // خدمات البكسلات: تحقّق من قابلية الوصول وأيضًا وجود النافذة العالمية
      var globals = {
        metaPixel: window.fbq, tiktokPixel: window.ttq, googleAnalytics: window.gtag,
        googleTagManager: window.dataLayer, snapchatPixel: window.snaptr, pinterestTag: window.pintrk
      };
      var globText = {
        metaPixel: "fbq", tiktokPixel: "ttq", googleAnalytics: "gtag", googleTagManager: "dataLayer", snapchatPixel: "snaptr", pinterestTag: "pintrk"
      };
      reachable(scriptSrc).then(function (netOk) {
        var results = [];
        results.push("ID detected ✓");
        results.push("Script reachable: " + (netOk ? "✓" : "⚠️"));
        results.push("Global " + globText[serviceKey] + ": " + (globals[serviceKey] ? "✓" : "—"));
        results.push("Event layer ready: " + (globals[serviceKey] ? "✓" : "—"));
        var ok = netOk;
        r2(Object.assign({}, base, { ok: ok, ms: Date.now() - t0, results: results, error: ok ? "" : "Script غير قابل للوصول من هذه الشبكة" }));
      });
    });
  }

  /* ---------- حفظ الإعدادات ---------- */
  function saveSettings(newSettings) {
    var s = sanitizeSettings(newSettings);
    s._meta = s._meta || {};
    s._meta.updatedAt = new Date().toISOString();
    // eslint-disable-next-line no-underscore-dangle
    s._bz = true;
    lsSet(LS_KEY, s);
    ns.settings = s;
    // محاولة الحفظ عن بُعد في Firestore (إن سمجت القواعد)، بدون كسر لو حدث فشل.
    firestoreSave(s);
    resetRecentEvents();
    install();
    return s;
  }
  function firestoreSave(s) {
    try {
      var fields = {};
      ["metaPixel", "tiktokPixel", "googleAnalytics", "googleTagManager", "snapchatPixel", "pinterestTag", "searchConsole"].forEach(function (k) {
        fields[k] = { mapValue: { fields: { enabled: { booleanValue: !!s[k].enabled }, id: { stringValue: trimmed(s[k].id) } } } };
      });
      fields.googleSheets = { mapValue: { fields: {
        enabled: { booleanValue: !!s.googleSheets.enabled },
        endpoint: { stringValue: trimmed(s.googleSheets.endpoint) },
        sheetId: { stringValue: trimmed(s.googleSheets.sheetId) },
        sheetName: { stringValue: trimmed(s.googleSheets.sheetName) },
        fields: { arrayValue: { values: (s.googleSheets.fields || []).map(function (f) { return { stringValue: String(f) }; }) } }
      } } };
      if (s._meta) fields._meta = { mapValue: { fields: { updatedAt: { stringValue: s._meta.updatedAt || "" }, adminPassword: { stringValue: trimmed(s._meta.adminPassword) } } } };
      fetch(FIRESTORE_BASE + "settings/addons?updateMask.fieldPaths=enabled&updateMask.fieldPaths=id", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: fields })
      }).then(function (r) {
        if (r.ok) logDebug("Settings", "save", true, "Firestore synced");
        else r.text().then(function (t) { logDebug("Settings", "save", false, "Firestore: HTTP " + r.status + " (محفوظ محليًا)" + String(t || "").slice(0, 120)); });
      }).catch(function (e) { logDebug("Settings", "save", false, "Firestore save failed (محفوظ محليًا)"); });
    } catch (e) {}
  }

  /* ---------- واجهة عامة ---------- */
  window.bazarTrackEvent = function (eventName, data) {
    var c = canonicalEvent(eventName);
    dispatch("store_" + c + "|" + (data && data.product_id != null ? data.product_id : "") + "|" + Date.now(), c, data || {}, false);
  };
  window.bazarSendOrder = function (order) { return sendOrder(order); };
  window.bazarTestConnection = function (key) { return testConnection(key); };
  window.bazarSaveSettings = function (s) { return saveSettings(s); };

  // for admin page
  window.BazarIntegrations = ns;

  // ---------- تهيئة ----------
  var local = loadFromLocalStorage();
  if (local) {
    ns.settings = sanitizeSettings(local);
    ns.ready = true;
    install();
    // تحديث النائي في الخلفية (لكن لا نستبدل المحلي)
    fetchRemote(false);
  } else {
    fetchRemote(true);
  }
})();
