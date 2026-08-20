/*
 * Bazar Dzair — مركز الإضافات (Addons runtime injector)
 * -----------------------------------------------------
 * يُحمَّل من <head> في index.html و product.html.
 * يقرأ إعدادات الإضافات من Firestore (settings/addons) ويركّب أكواد
 * Google Analytics / GTM / Meta Pixel / TikTok / Snapchat / Pinterest
 * و Google Search Console meta في المتجر الحقيقي.
 *
 * الضمانات المعمارية:
 * - لا يُحمَّل أي كود إطلاقًا إلا إذا كانت الإضافة مفعّلة AND لها معرّف صالح.
 * - كل كود يُركّب مرة واحدة فقط في الصفحة (guards عبر معرفات مميزة + فحص DOM).
 * - حفظ الإعدادات مرات عديدة في الشكل لا يكرّر شيئًا، لأن المعرّف يُحفظ
 *   في مستند واحد (settings/addons) ويُستبدل، والتحميل نفسه محمي بعدم التكرار.
 * - Google Search Console meta يوضع في <head> الفعلي وليس في صفحة الإدارة.
 * - لا تُستخدم مفاتيح سرية في الواجهة الأمامية.
 */
(function () {
  if (window.__bazarAddonsLoaded) return;
  window.__bazarAddonsLoaded = true;

  var BASE = "https://firestore.googleapis.com/v1/projects/bazar-dzair-33816/databases/(default)/documents/";

  function val(v) {
    if (!v) return null;
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.arrayValue) return (v.arrayValue.values || []).map(val);
    if (v.mapValue) return mapData(v);
    return null;
  }
  function mapData(doc) {
    var out = {};
    var f = (doc && doc.fields) || {};
    Object.keys(f).forEach(function (k) { out[k] = val(f[k]); });
    return out;
  }

  var head = document.getElementsByTagName("head")[0] || document.documentElement;

  // إدراج عنصر في أول <head> (يُعيّر ترتيب الوضع لوائح الأكشذد).
  function prepend(el) {
    if (head.firstChild) head.insertBefore(el, head.firstChild);
    else head.appendChild(el);
  }
  function append(el) {
    head.appendChild(el);
  }

  // حقن سكربت خارجي مرة واحدة فقط (id فريد).
  function external(id, src) {
    if (document.getElementById(id)) return false;
    var s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.async = true;
    append(s);
    return true;
  }

  // حقن كود inline مرة واحدة فقط.
  function inline(id, code) {
    if (document.getElementById(id)) return;
    var s = document.createElement("script");
    s.id = id;
    s.text = code;
    append(s);
  }

  // قراءة إعدادات الإضافات من Firestore
  var addons = {};
  var started = false;

  function install() {
    var a = Object.assign({}, addons);
    function on(x) { return !!(x && x.enabled === true); }
    var id = function (x) { return typeof x === "string" ? x.trim() : ""; };

    var claimed = {};
    function claim(k) {
      if (claimed[k]) return false;
      claimed[k] = true;
      return true;
    }

    // -------- Google Analytics (GA4) --------
    if (on(a.googleAnalytics) && /^(G|UA|AW|GT)-[A-Za-z0-9-]{6,}$/.test(id(a.googleAnalytics.id))) {
      var gid = id(a.googleAnalytics.id);
      if (claim("ga")) {
        external("bazar_ga_script", "https://www.googletagmanager.com/gtag/js?id=" + gid);
        inline("bazar_ga_cfg", [
          "window.dataLayer=window.dataLayer||[];",
          "function gtag(){dataLayer.push(arguments);}",
          "gtag('js',new Date());",
          "gtag('config','" + gid.replace(/"/g, "") + "');"
        ].join(""));
      }
    }

    // -------- Google Tag Manager --------
    if (on(a.googleTagManager) && /^GTM-[A-Za-z0-9]+$/.test(id(a.googleTagManager.id))) {
      var gtm = id(a.googleTagManager.id);
      if (claim("gtm")) {
        inline("bazar_gtm_cfg", [
          "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});",
          "var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';",
          "j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);",
          "})(window,document,'script','dataLayer','" + gtm.replace(/"/g, "") + "');"
        ].join(""));
        inline("bazar_gtm_noscript", "var nos=document.createElement('noscript');" +
          "nos.innerHTML='<iframe src=\"https://www.googletagmanager.com/ns.html?id=" + gtm + "\" height=\"0\" width=\"0\" style=\"display:none;visibility:hidden\"></iframe>';" +
          "document.body&&document.body.appendChild(nos);");
      }
    }

    // -------- Meta Pixel --------
    if (on(a.metaPixel) && /^[0-9]{8,20}$/.test(id(a.metaPixel.id))) {
      var mp = id(a.metaPixel.id);
      if (claim("meta")) {
        inline("meta_pixel_base", [
          "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments);};",
          "if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.queue=[];}",
          "}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js','fbq');",
          "window._bdzpMetaLoaded=!0;",
          "fbq('init','" + mp + "');fbq('track','PageView');"
        ].join(""));
      }
    }

    // -------- TikTok Pixel --------
    if (on(a.tiktokPixel) && /^[0-9]{10,25}$/.test(id(a.tiktokPixel.id))) {
      var tk = id(a.tiktokPixel.id);
      if (claim("tiktok")) {
        inline("tiktok_pixel_base", [
          "!function (w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];",
          "ttq.method=ttq.method||function(m){return this.push(m);};",
          "ttq.page=ttq.page||function(){return ttq.method('page',arguments);};",
          "ttq.load=ttq.load||function(){return ttq.method('load',arguments);};",
          "ttq.instance=ttq.instance||function(){return ttq.method('instance',arguments);};",
          "}(window,document,'ttq');",
          "if(window.__bazarTiktokN===undefined){window.__bazarTiktokN=!0;}"
        ].join(""));
        if (external("ttq_script", "https://analytics.tiktok.com/i18n/pixel/start.js?id=" + tk)) {
          inline("ttq_init", "ttq.instance && ttq.instance.onload();");
        }
      }
    }

    // -------- Snapchat Pixel --------
    if (on(a.snapchatPixel) && /^[0-9]{8,25}$/.test(id(a.snapchatPixel.id))) {
      var sc = id(a.snapchatPixel.id);
      if (claim("snap")) {
        if (external("snap_script", "https://tr.snapchat.com/counter.js")) {
          inline("snap_pixel_cfg", "window._snaptrLoaded=!0;");
        }
      }
    }

    // -------- Pinterest Tag --------
    if (on(a.pinterestTag) && /^[0-9]{5,20}$/.test(id(a.pinterestTag.id))) {
      var pt = id(a.pinterestTag.id);
      if (claim("pin")) {
        external("pinterest_core", "https://s.pinimg.com/ct/core.js");
        inline("pinterest_base", [
          "(function(){if(window.pintrk)return;window.pintrk=function(){window.pintrk.queue=window.pintrk.queue||[];window.pintrk.queue.push(arguments);return window.pintrk;};window.pintrk.q='__bazarPinInit';}());",
          "(function(){pintrk('load','page',{tag:'"+pt+"'});}());"
        ].join(""));
      }
    }

    // -------- Google Search Console (meta) --------
    if (on(a.searchConsole) && id(a.searchConsole.id)) {
      var vcode = id(a.searchConsole.id);
      var existing = false;
      var metas = (document.getElementsByTagName("meta") && document.querySelectorAll('meta[name="google-site-verification"]')) || [];
      for (var k = 0; k < metas.length; k++) if (metas[k].content === vcode) existing = true;
      if (!existing) {
        var m = document.createElement("meta");
        m.name = "google-site-verification";
        m.content = vcode;
        prepend(m);
      }
    }

    window.__bazarAddons = a;

    // -------- Event dispatcher (مُستدعى من صفحات المتجر) --------
    // يرسل الحدث إلى كل بكسل نشط لديه معرّف. لا يُرسل أحداثًا لوظائف غير موجودة.
    window.bazarTrackEvent = function (eventName, data) {
      var cfg = window.__bazarAddons || {};
      data = data || {};
      function on(x) { return !!(x && x.enabled === true); }
      var rawId = function (x) { return typeof x === "string" ? x.trim() : ""; };
      try {
        if (on(cfg.metaPixel) && /^[0-9]{8,20}$/.test(rawId(cfg.metaPixel.id))) {
          var mpd = {};
          if (eventName === "ViewContent" && data.content_name) {
            mpd = { content_name: data.content_name, content_category: data.category || "", value: Number(data.price || 0) || undefined, currency: "DZD" };
          } else if (eventName === "AddToCart") {
            mpd = { content_name: data.content_name || "", content_category: data.category || "", value: Number(data.price || 0) || undefined, currency: "DZD" };
          } else if (eventName === "InitiateCheckout" || eventName === "Purchase") {
            mpd = { content_name: data.content_name || "", value: Number(data.total || data.price || 0) || undefined, currency: "DZD" };
          }
          if (window.fbq) fbq("track", eventName, mpd);
        }
        if (on(cfg.tiktokPixel)) {
          var ev = eventName === "PageView" ? "page_view" : eventName === "ViewContent" ? "view_content" : eventName === "AddToCart" ? "add_to_cart" : eventName === "InitiateCheckout" ? "initiate_checkout" : eventName === "Purchase" ? "complete_payment" : null;
          if (ev && window.ttq) {
            try { ttq.instance("load"); ttq(ev, { contents: [{ id: data.id || "", quantity: Number(data.qty || 1), price: Number(data.price || 0) }], value: Number(data.total || data.price || 0), currency: "DZD" }); } catch (e) {}
          }
        }
      } catch (e) { /* tracking errors must never break the store */ }
    };
  }

  function startLoad() {
    if (started) return;
    started = true;
    try {
      var req = new XMLHttpRequest();
      req.open("GET", BASE + "settings/addons", true);
      req.setRequestHeader("Accept", "application/json");
      req.onreadystatechange = function () {
        if (req.readyState === 4) {
          if (req.status === 200) {
            try { addons = mapData(JSON.parse(req.responseText)); } catch (e) {}
          }
          install();
        }
      };
      req.send();
    } catch (e) {
      install();
    }
  }

  startLoad();
})();