/* ============================================================
   Bazar Dzair — تركيب خدمات التتبع على صفحات المتجر (index.html,
   product.html, السلة، إتمام الطلب...).

   ضع السطر التالي داخل <head> في كل صفحة متجر عامة:
     <script src="integration.js" defer></script>

   يقرأ هذا الملف إعدادات الخدمات الخمس (Meta Pixel, TikTok Pixel,
   Google Analytics, Google Tag Manager, Google Search Console)
   المحفوظة من لوحة التحكم (النظام → الإضافات) عبر:
     1) Firestore: settings/addons  (المصدر الرسمي)
     2) localStorage (احتياطي على نفس المتصفح)

   وعندما تكون خدمة مفعّلة ولها معرّف، يُركَّب كودها الفعلي في الصفحة
   مرة واحدة فقط. لا يوجد أي مفتاح سري هنا — الحقول معرفات/أكواد عامة.
   ============================================================ */
(function () {
  var PROJECT = "bazar-dzair-33816";

  function decodeFields(f) {
    var o = {};
    for (var k in f) {
      var v = f[k];
      if (!v) continue;
      if (v.stringValue !== undefined) o[k] = v.stringValue;
      else if (v.booleanValue !== undefined) o[k] = v.booleanValue;
      else if (v.mapValue && v.mapValue.fields) o[k] = decodeFields(v.mapValue.fields);
    }
    return o;
  }

  function readConfig() {
    return new Promise(function (resolve) {
      var local = {};
      try { local = JSON.parse(localStorage.getItem("bazarAddons") || "{}"); } catch (e) {}
      fetch(
        "https://firestore.googleapis.com/v1/projects/" + PROJECT +
        "/databases/(default)/documents/settings/addons",
        { headers: { "Accept": "application/json" } }
      )
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (j) {
          var out = {};
          var f = (j && j.fields) || {};
          for (var k in f) {
            if (f[k] && f[k].mapValue && f[k].mapValue.fields) {
              out[k] = decodeFields(f[k].mapValue.fields);
            }
          }
          resolve(out);
        })
        .catch(function () { resolve(local); });
    });
  }

  function injectScript(src) {
    var s = document.createElement("script");
    s.async = true; s.src = src;
    document.head.appendChild(s);
  }
  function injectRaw(html) {
    var s = document.createElement("script");
    s.text = html;
    document.head.appendChild(s);
  }
  function injectVerifyMeta(content) {
    if (!content) return;
    var m = document.createElement("meta");
    m.name = "google-site-verification"; m.content = content;
    document.head.appendChild(m);
  }

  function val(cfg, key) {
    var c = cfg[key] || {};
    return (c.enabled === true && c.id && String(c.id).trim()) ? String(c.id).trim() : "";
  }

  function apply(cfg) {
    var gtm = val(cfg, "googleTagManager");
    var ga = val(cfg, "googleAnalytics");
    var meta = val(cfg, "metaPixel");
    var ttq = val(cfg, "tiktokPixel");
    var gsc = val(cfg, "searchConsole");

    // 5) Google Search Console — وسم التحقق من الملكية
    if (gsc) injectVerifyMeta(gsc);

    // 4) Google Tag Manager
    if (gtm) {
      injectRaw('(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({"gtm.start":new Date().getTime(),event:"gtm.js"});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!="dataLayer"?"&l="+l:"";j.async=true;j.src="https://www.googletagmanager.com/gtm.js?id="+i+dl;f.parentNode.insertBefore(j,f);})(window,document,"script","dataLayer","' + gtm + '");');
    }

    // 3) Google Analytics (GA4) — مباشر، ويتخطى عند تفعيل GTM لتفادي التتبع المزدوج
    if (ga && !gtm) {
      injectScript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ga));
      injectRaw('window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","' + ga + '");');
    }

    // 1) Meta Pixel — base code + PageView
    if (meta) {
      injectRaw('!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");fbq("init","' + meta + '");fbq("track","PageView");');
    }

    // 2) TikTok Pixel — Web events + page
    if (ttq) {
      injectRaw('!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript";n.async=!0;n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};ttq.load("' + ttq + '");ttq.page();}(window,document,"ttq");');
    }
  }

  readConfig().then(apply);

  // مساعد موحّد للأحداث — تستدعيه صفحات المتجر:
  //   window.BazarTrack("ViewContent", {content_ids:[...], currency:"DZD"})
  //   window.BazarTrack("AddToCart", {value:..., currency:"DZD"})
  //   window.BazarTrack("InitiateCheckout", {...})
  //   window.BazarTrack("Purchase", {value:..., currency:"DZD"})
  window.BazarTrack = function (event, params) {
    params = params || {};
    try { if (window.fbq) fbq("track", event, params); } catch (e) {}
    try { if (window.gtag) gtag("event", event, params); } catch (e) {}
    try { if (window.ttq && window.ttq.track) window.ttq.track(event, params); } catch (e) {}
  };
})();
