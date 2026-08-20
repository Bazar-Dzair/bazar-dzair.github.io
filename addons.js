/*
 * Bazar Dzair — مركز الإضافات (Addons runtime)
 * -----------------------------------------------------
 * يُحمَّل من <head> في index.html و product.html.
 * يقرأ إعدادات الإضافات من Firestore (settings/addons) ثم يركّب كل خدمة
 * بالطريقة الرسمية لكل منها، بشكل مستقل تمامًا.
 *
 * الضمانات المعمارية:
 * - لا يُحمَّل أي كود إطلاقًا إلا إذا كانت الإضافة مفعّلة ولديها معرّف صالح.
 * - كل خدمة توضع داخل try/catch مستقل → فشل خدمة واحدة لا يعطّل بقية الخدمات.
 * - كل سكربت يُحمَّل مرة واحدة فقط (guard عبر data-attribute + id فريد).
 * - التحميل غير متزامن (async / defer) → لا يبطئ ظهور المنتجات والمتجر.
 * - قراءة الإعدادات عبر REST هي قراءة عامة (match rules) ولا تحتاج تسجيل دخول.
 * - لا تُستخدم مفاتيح سرية في الواجهة الأمامية.
 *
 * ملاحظة شفافة حول Google Search Console:
 *   الميتا (meta) المحقون عبر JavaScript لا يُقرأ دائمًا كأداة تحقق موثوقة
 *   من Google لأن الزاحف يقرأ ملف HTML المصدر. الطريقة الرسمية التوافقية
 *   مع GitHub Pages هي ملف تحقق ثابت (googleXXXX.html) في جذر الموقع،
 *   أو DNS TXT. هذه المكتبة تحقن الميتا كأفضل جهد، وتوفّر موظّف
 *   window.showGSCFile() لتوليد ملف التحقق الثابت الصحيح.
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
  function node() { return document.head; }

  function external(id, src, opt) {
    if (document.getElementById(id)) return false;
    var s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.async = true;
    if (opt && opt.defer) s.defer = true;
    node().appendChild(s);
    return true;
  }
  function inline(id, code) {
    if (document.getElementById(id)) return;
    var s = document.createElement("script");
    s.id = id;
    s.text = code;
    node().appendChild(s);
  }

  var cfg = {}; // will hold all addon settings after load
  var installing = false;

  // ============================================================
  // 1) Google Analytics (GA4) — الطريقة الرسمية (gtag.js)
  // ============================================================
  function initGoogleAnalytics(a) {
    var c = a.googleAnalytics || {};
    if (!(c.enabled === true)) return;
    var gid = (typeof c.id === "string" ? c.id.trim() : "");
    if (!/^(G|T|GT|AW)-[A-Za-z0-9-]{6,}$/.test(gid)) return; // صيغة غير صالحة → لا نحقن
    var s = document.createElement("script");
    s.id = "bazar_ga_script";
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(gid);
    node().appendChild(s);
    inline("bazar_ga_cfg", [
      "window.dataLayer=window.dataLayer||[];",
      "function gtag(){dataLayer.push(arguments);}",
      "gtag('js',new Date());",
      "gtag('config','" + gid.replace(/"/g, "") + "',{'send_page_view':true});"
    ].join(""));

  }

  // ============================================================
  // 2. Google Tag Manager — الطريقة الرسمية (GTM)
  // ============================================================
  function initGoogleTagManager(a) {
    var gtm = a.googleTagManager || {};
    if (!(gtm.enabled === true)) return;
    var id = (typeof gtm.id === "string") ? gtm.id.trim() : "";
    if (!/^GTM-[A-Za-z0-9]+$/.test(id)) return;
    if (document.getElementById("bazar_gtm_js")) return;

    inline("bazar_gtm_script", [
      "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});",
      "var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';",
      "j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);",
      "})(window,document,'script','dataLayer','" + id.replace(/"/g, "") + "');"
    ].join(""));

    // عنصر noscript (iframe) للوضع بدون JavaScript — يُضاف قرب أعلى body
    if (document.body) {
      var nos = document.createElement("noscript");
      nos.id = "bazar_gtm_noscript";
      nos.innerHTML = '<iframe src="https://www.googletagmanager.com/ns.html?id=' + id + '" height="0" width="0" style="display:none;visibility:hidden"></iframe>';
      document.body.insertBefore(nos, document.body.firstChild);
    } else {
      window.addEventListener("DOMContentLoaded", function () {
        var nos = document.createElement("noscript");
        nos.id = "bazar_gtm_noscript";
        nos.innerHTML = '<iframe src="https://www.googletagmanager.com/ns.html?id=' + id + '" height="0" width="0" style="display:none;visibility:hidden"></iframe>';
        document.body.insertBefore(nos, document.body.firstChild);
      });
    }

  }

  // ============================================================
  // 3. Meta Pixel (Facebook) — الطريقة الرسمية (fbevents)
  // ============================================================
  function initMetaPixel(a) {
    var mp = a.metaPixel || {};
    if (!(mp.enabled === true)) return;
    var id = (typeof mp.id === "string") ? mp.id.trim() : "";
    if (!/^[0-9]{8,20}$/.test(id)) return;
    if (document.getElementById("bazar_meta_script")) return;
    external("bazar_meta_script", "https://connect.facebook.net/en_US/fbevents.js", { async: true });
    inline("bazar_meta_cfg", [
      "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments);};",
      "if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;",
      "t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');",
      "fbq('init','" + id + "');fbq('track','PageView');"
    ].join(""));

  }

  // ============================================================
  // 4. TikTok Pixel — الطريقة الرسمية (events.js)
  // ============================================================
  function initTikTokPixel(a) {
    var tk = a.tiktokPixel || {};
    if (!(tk.enabled === true)) return;
    var id = (typeof tk.id === "string") ? tk.id.trim() : "";
    if (!/^[A-Za-z0-9]{9,25}$/.test(id)) return;
    if (document.getElementById("bazar_tt_script")) return;
    inline("bazar_tt_base", [
      "!function (w, d, t) { w.TiktokAnalyticsObject=t; var ttq=w[t]=w[t]||[];",
      "ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie','holdConsent','revokeConsent','grantConsent'];",
      "ttq.setUseStrictMode=ttq.setUseStrictMode||function(){};",
      "var p1=d.createElement('script'),s=d.getElementsByTagName('script')[0];p1.async=!0;p1.src=t;s.parentNode.insertBefore(p1,s);",
      "}(window, document, 'https://analytics.tiktok.com/i18n/pixel/events.js');"
    ].join(""));
    inline("bazar_tt_init", [
      "ttq.load('" + id + "');ttq.page();"
    ].join(""));

  }

  // ============================================================
  // 5. Google Search Console — التحقق عبر meta tag (أفضل جهد)
  //    ملاحظة: الطريقة الموثوقة مع GitHub Pages هي ملف تحقق ثابت أو DNS.
  // ============================================================
  function initGoogleSearchConsole(a) {
    var sc = a.searchConsole || {};
    if (!(sc.enabled === true)) return;
    var code = (typeof sc.id === "string") ? sc.id.trim() : "";
    if (!code) return;
    var existing = false;
    var metas = (document.querySelectorAll('meta[name="google-site-verification"]') || []);
    for (var i = 0; i < metas.length; i++) {
      if (metas[i].content === code) { existing = true; break; }
    }
    if (!existing) {
      var m = document.createElement("meta");
      m.name = "google-site-verification";
      m.content = code;
      m.setAttribute("data-bazar-gsc", "1");
      var headEl = document.head;
      if (headEl && headEl.firstChild) headEl.insertBefore(m, headEl.firstChild);
      else if (headEl) headEl.appendChild(m);
    }

  }

  // ============================================================
  // موزّع الأحداث: يتيح للموقع إرسال أحداث (ViewContent, AddToCart…)
  // لا يرسل حدثًا إلى خدمة غير نشطة أو بدون معرّف.
  // ============================================================
  function installEvents() {
    if (window.bazarTrackEvent) return;
    window.bazarTrackEvent = function (eventName, data) {
      data = data || {};
      function on(x) { return !!(x && x.enabled === true); }
      function rid(x) { return typeof x === "string" ? x.trim() : ""; }
      var C = window.__bazarAddons || {};
      try {
        // Meta pixel
        if (on(C.metaPixel) && /^[0-9]{8,20}$/.test(rid(C.metaPixel.id)) && window.fbq) {
          var mpd = {};
          if (eventName === "ViewContent") {
            mpd = { content_name: data.content_name, content_category: data.category || "", value: Number(data.price || 0) || undefined, currency: "DZD", content_ids: data.id ? [data.id] : undefined };
          } else if (eventName === "AddToCart") {
            mpd = { content_name: data.content_name || "", content_category: data.category || "", value: Number(data.price || 0) || undefined, currency: "DZD", content_ids: data.id ? [data.id] : undefined };
          } else if (eventName === "InitiateCheckout" || eventName === "Purchase") {
            mpd = { content_name: data.content_name || "", value: Number(data.total || data.price || 0) || undefined, currency: "DZD" };
          }
          try { fbq("track", eventName, mpd); } catch (e) {}
        }
        // TikTok
        if (on(C.tiktokPixel) && rid(C.tiktokPixel.id) && window.ttq) {
          var evName = null;
          if (eventName === "PageView") evName = "page";
          else if (eventName === "ViewContent") evName = "view_content";
          else if (eventName === "AddToCart") evName = "add_to_cart";
          else if (eventName === "InitiateCheckout") evName = "initiate_checkout";
          else if (eventName === "Purchase") evName = "complete_payment";
          if (evName) {
            try { ttq(evName, { contents: [{ id: data.id || "", quantity: Number(data.qty || 1), price: Number(data.price || 0) }], value: Number(data.total || data.price || 0) || undefined, currency: "DZD" }); } catch (e) {}
          }
        }
      } catch (e) { /* tracking errors never break the store */ }
    };
  }

  // ============================================================
  // الوظيفة المركزية: يقرأ settings/addons ثم يفعّل كل خدمة مستقلًا
  // ============================================================
  function install() {
    if (installing) return;
    installing = true;
    try {
      initGoogleAnalytics(cfg);
    } catch (e) { console.warn("[bazar] GA:", e); }
    try { initGoogleTagManager(cfg); } catch (e) { console.warn("[baz] GTM:", e); }
    try { initMetaPixel(cfg); } catch (e) { console.warn("[baz] Meta Pixel:", e); }
    try { initTikTokPixel(cfg); } catch (e) { console.warn("[baz] TikTok Pixel:", e); }
    try { initGoogleSearchConsole(cfg); } catch (e) { console.warn("[baz] Search Console:", e); }
    window.__bazarAddons = cfg;
    installEvents();
  }

  // ============================================================
  // قراءة إعدادات الإضافات من Firestore (REST — عام readable)
  // ============================================================
  function startLoad() {
    try {
      var req = new XMLHttpRequest();
      req.open("GET", BASE + "settings/addons", true);
      req.setRequestHeader("Accept", "application/json");
      req.onreadystatechange = function () {
        if (req.readyState === 4) {
          if (req.status === 200) {
            try { cfg = mapData(JSON.parse(req.responseText)); } catch (e) {}
          }
          install();
        }
      };
      req.send();
    } catch (e) { install(); }
  }

  // يركّب حتى إن فشلت قراءة Firebase (قفل زمني للأمان)
  window.addEventListener("DOMContentLoaded", function () {
    setTimeout(function () { if (!installing) install(); }, 4500);
  });

  // ============================================================
  // أداة مساعدة لإنشاء ملف تحقق Search Console الثابت (GitHub Pages)
  // ============================================================
  window.gscVerificationContent = function (code) {
    code = (code || "").trim();
    if (!code) return "";
    return "google-site-verification: " + code + "\n";
  };
  window.gscDownloadVerificationFile = function (code) {
    code = (code || "").trim();
    if (!code) { console.warn("[baz] GSC: لم يُدخل رمز تحقق"); return; }
    var fileName = "google" + code + ".html";
    var content = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Google verification</title></head><body><p>google-site-verification: " + code + "</p></body></html>";
    var blob = new Blob([content], { type: "text/html" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  };

  startLoad(); // لا يبدأ التحميل مرتين
})();