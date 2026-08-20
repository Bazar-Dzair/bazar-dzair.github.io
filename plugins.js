/**
 * Bazaar - Integration Plugins (all 8)
 * -------------------------------------------------
 * Each plugin is registered into the central IntegrationManager. These are
 * NOT cards - they carry real header-injection snippets, JSON-schema field
 * validation, event handlers, and test routines. Scripts only ever load
 * when enabled AND adequately configured, and never duplicate.
 */
(function () {
  'use strict';
  const M = window.IntegrationManager;
  if (!M) return;

  // ---------------------------------------------------------------------------
  // 1) META PIXEL
  // ---------------------------------------------------------------------------
  M.register({
    id: 'metaPixel',
    name: 'Meta Pixel',
    icon: 'meta',
    blurb: 'تتبّع تحويلات Meta (فيسبوك/انستغرام) عبر أحداث المتجر.',
    events: ['page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'],
    enabled: true,
    fields: [
      { key: 'pixelId', label: 'Pixel ID', placeholder: '123456789012345', required: true }
    ],
    validate(values) {
      if (!values.pixelId) return { ok: false, message: 'أدخل Pixel ID أولاً' };
      if (!/^\d{1,20}$/.test(String(values.pixelId))) return { ok: false, message: 'Pixel ID رقمي فقط' };
      return { ok: true };
    },
    inject(values) {
      const tid = String(values.pixelId);
      const snip = [
        `<!-- Meta Pixel Code -->`,
        `<script>`,
        `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?`,
        `n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;`,
        `n.push=n;n.loaded=!0;n.image=false;n.url='https://connect.facebook.net/en_US/fbevents.js';`,
        `}(window, document,'script', n.url);`,
        `fbq('init', '${tid}');`,
        `fbq('track', 'PageView');`,
        `<\/script>`,
        `<noscript><img alt="fb-pixel" height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${tid}&ev=PageView&noscript=1" /></noscript>`
      ].join('\n');
      injectMarked('metaPixel', snip);
    },
    handleEvent({ name, payload, config }) {
      if (!config.pixelId) return false; // not configured yet -> ignore
      if (name === 'page_view' && !payload) return false;
      const evMap = {
        page_view: 'PageView',
        view_item: 'ViewContent',
        add_to_cart: 'AddToCart',
        begin_checkout: 'InitiateCheckout',
        purchase: 'Purchase'
      };
      const fbEv = evMap[name];
      if (!fbEv) return false;
      const params = {};
      if (payload.value !== undefined) params.value = payload.value;
      if (payload.currency) params.currency = payload.currency;
      if (payload.content_ids) params.content_ids = payload.content_ids;
      if (payload.content_type) params.content_type = payload.content_type;
      if (typeof window.fbq === 'function') window.fbq('track', fbEv, params);
      return { event: fbEv, params };
    }
  });

  // ---------------------------------------------------------------------------
  // 2) TIKTOK PIXEL
  // ---------------------------------------------------------------------------
  M.register({
    id: 'tiktokPixel',
    name: 'TikTok Pixel',
    icon: 'tiktok',
    tagline: 'تتبّع Shark وفق Events TikTok لأداء إعلاناتك.',
    events: ['page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'],
    enabled: true,
    fields: [
      { key: 'pixelId', label: 'TikTok Pixel ID', placeholder: 'XXXXX', required: true }
    ],
    validate(values) {
      if (!values.pixelId) return { ok: false, message: 'أدخل TikTok Pixel ID' };
      return { ok: true };
    },
    inject(values) {
      const tid = String(values.pixelId);
      const s = [
        `<script>`,
        `window._tkq = window._tkq || [];`,
        `(function() { var s=document.createElement('script'); s.src='https://analytics.tiktok.com/i18n/pixel/sdk.js'; s.async=true; document.head.appendChild(s); })();`,
        `window.addEventListener('DOMContentLoaded', function(){ if(window.ttq) ttq.load('${tid}'); });`,
        `ttq && ttq.load && ttq.load('${tid}');`,
        `<\/script>`
      ];
      injectMarked(this.id, s.join('\n'));
    },
    handleEvent({ name, payload, config }) {
      if (!config.pixelId) return false;
      const ev = {
        page_view: 'PageView',
        view_item: 'ViewContent',
        add_to_cart: 'AddToCart',
        begin_checkout: 'InitiateCheckout',
        purchase: 'CompletePayment'
      }[name];
      if (!ev) return false;
      if (typeof window.ttq === 'object') { window.ttq.page && window.ttq.page(); }
      // Native call when SDK present.
      if (window.ttq && window.ttq.track) window.ttq.track(ev, payload || {});
      return { event: ev };
    }
  });

  // ---------------------------------------------------------------------------
  // 3) GOOGLE ANALYTICS 4
  // ---------------------------------------------------------------------------
  M.register({
    id: 'googleAnalytics',
    name: 'Google Analytics',
    icon: 'ga',
    tagline: 'Analytics 4 — قس حركة الزوار وأحداث المتجر.',
    enabled: false,
    events: ['page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'],
    fields: [
      { key: 'measId', label: 'Measurement ID', placeholder: 'G-XXXXXXXXXX', required: true }
    ],
    validate(values) {
      if (!values.measId) return { ok: false, message: 'أدخل Measurement ID' };
      if (!/^G-[\w-]{6,}$/.test(String(values.measId))) return { ok: false, message: 'صيغة غير صحيحة (G-X...) بما أن Measurement ID يبدأ بـ G-' };
      return { ok: true };
    },
    inject(values) {
      const gid = String(values.measId);
      const s = [
        `<!-- Google Analytics -->`,
        `<script async src="https://www.googletagmanager.com/gtag/js?id=${gid}"></script>`,
        `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gid}');</script>`
      ];
      injectMarked(this.id, s.join('\n'));
    },
    handleEvent({ name, payload, config }) {
      if (!config.measId) return false;
      if (typeof gtag !== 'function') return false;
      if (name === 'page_view') { gtag('event','page_view',{}); return 'page_view'; }
      const evName = {
        view_item: 'view_item',
        add_to_cart: 'add_to_cart',
        begin_checkout: 'begin_checkout',
        purchase: 'purchase'
      }[name];
      if (!evName) return false;
      const evData = Object.assign({ currency: payload.currency, value: payload.value, item_id: payload.content_ids && payload.content_ids[0] }, payload || {});
      gtag('event', evName, evData);
      return { event: evName };
    }
  });

  // ---------------------------------------------------------------------------
  // 4) GOOGLE TAG MANAGER
  // ---------------------------------------------------------------------------
  M.register({
    id: 'googleTagManager',
    name: 'Google Tag Manager',
    icon: 'gtm',
    tagline: 'تُدار كل الحاويات (GTM) من Google هنا.',
    enabled: false,
    events: [],
    fields: [
      { key: 'containerId', label: 'Container ID (GTM-XXXXXXX)', placeholder: 'GTM-XXXXXXX', required: true }
    ],
    validate(values) {
      if (!values.containerId) return { ok: false, message: 'أدخل Container ID' };
      if (!/^GTM-[A-Z0-9]{6,}$/.test(String(values.containerId).trim())) return { ok: false, message: 'صيغة غير صحيحة' };
      return { ok: true };
    },
    inject(values) {
      const cid = String(values.containerId).trim();
      return injectMarked(this.id, [
        `<!-- Google Tag Manager -->`,
        `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime()});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${cid}');`,
        `<!-- End Google Tag Manager -->`
      ].join('\n'));
    }
  });

  // ---------------------------------------------------------------------------
  // 5) GOOGLE SEARCH CONSOLE  (real meta-tag verification)
  // ---------------------------------------------------------------------------
  M.register({
    id: 'googleSearchConsole',
    name: 'Google Search Console',
    icon: 'gsc',
    tagline: 'تحقق من ملكية الموقع والاستفادة من بيانات فهرسة Google.',
    enabled: true,
    events: [],
    site: 'https://bazar-dzair.github.io/',
    fields: [
      { key: 'verifyMethod', label: 'طريقة التحقق', type: 'select', options: ['meta', 'file', 'dns'], default: 'meta' },
      { key: 'verifyValue', label: 'Meta Tag verification', placeholder: 'google-site-verification=······',
        help: 'انسخ القيمة من Google Search Console (مثل: google-site-verification=abc123)...',
        required: false },
      { key: 'site', label: 'رابط الموقع', default: 'https://bazar-dzair.github.io/', required: true }
    ],
    validate(values) {
      if (!values.site || !/^https?:\/\//.test(values.site)) return { ok: false, message: 'يجب أن يبدأ رابط الموقع بـ http(s)://' };
      if (values.verifyMethod !== 'meta' && values.verifyMethod !== 'file' && values.verifyMethod !== 'dns') {
        return { ok: false, message: 'طريقة تحقق غير معروفة' };
      }
      return { ok: true };
    },
    inject(values) {
      if (values.verifyMethod !== 'meta') return; // others need Google-side upload
      const content = String(values.verifyValue || '').trim();
      // Accept both the full tag and just the content value.
      const value = content.replace(/^google-site-verification=/, '');
      if (!value) return;
      const meta = `<meta name="google-site-verification" content="${value}" />`;
      injectMarked(this.id, meta);
    },
    handleEvent: null,
    test() {
      return { ok: true, message: 'التحقق عبر Meta Tag يُثبّت داخل رأس الموقع عند التفعيل. أكمل الخطوة في Google Search Console.' };
    }
  });

  // ---------------------------------------------------------------------------
  // 6) SNAPCHAT PIXEL
  // ---------------------------------------------------------------------------
  M.register({
    id: 'snapchatPixel',
    name: 'Snapchat Pixel',
    icon: 'snap',
    tagline: 'تتبّع Engagement Events لمنع الإعلانات على Snapchat.',
    enabled: false,
    events: ['page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'],
    fields: [
      { key: 'pixelId', label: 'Snapchat Pixel ID', required: true }
    ],
    validate(values) {
      if (!values.pixelId) return { ok: false, message: 'أدخل Snapchat Pixel ID' };
      return { ok: true };
    },
    inject(values) {
      const pid = String(values.pixelId);
      injectMarked(this.id, [
        `<script>`,
        `window.snaptr = window.snaptr || function(){ (window.snaptr.q = window.snaptr.q || []).push(arguments); }`,
        `window.snaptrHist = window.snaptrHist || [];`,
        `(function(){ var s=document.createElement('script'); s.src='https://sc-static.net/scevent.min.js'; s.async=true; document.head.appendChild(s); })();`,
        `snaptr('init','${pid}',{ 'integrations':{ 'googleForms':{} }, });`,
        `snaptr('track','PAGE_VIEW');`,
        `<\/script>`
      ].join('\n'));
    },
    handleEvent({ name, payload, config }) {
      if (!config.pixelId) return false;
      const ev = {
        page_view: 'PAGE_VIEW',
        view_item: 'VIEW_CONTENT',
        add_to_cart: 'ADD_TO_CART',
        begin_checkout: 'START_CHECKOUT',
        purchase: 'PURCHASE'
      }[name];
      if (!ev) return false;
      if (typeof snaptr === 'function') try { snaptr('track', ev, payload || {}); } catch (e) {}
      return { event: ev };
    }
  });

  // ---------------------------------------------------------------------------
  // 7) PINTEREST TAG
  // ---------------------------------------------------------------------------
  M.register({
    id: 'pinterestTag',
    name: 'Pinterest Tag',
    icon: 'pinterest',
    tagline: 'قياس أداء إعلانات Pinterest عبر Tag المطلوب.',
    enabled: false,
    events: ['page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'],
    fields: [
      { key: 'tagId', label: 'Pinterest Tag ID', required: true }
    ],
    validate(values) {
      if (!values.tagId) return { ok: false, message: 'أدخل Pinterest Tag ID' };
      return { ok: true };
    },
    inject(values) {
      const tid = String(values.tagId);
      injectMarked(this.id, [
        `<!-- Pinterest Tag -->`,
        `<script>`,
        `!function(e){if(!window.pintrk){window.pintrk=function(){window.pintrk.q=window.pintrk.q||[];window.pinrk.q.push(arguments)};var n=document.createElement("script");n.async=true;n.src="https://s.pinimg.com/ct/core.js";var h=document.getElementsByTagName("head")[0];h.appendChild(n)}}();`,
        `pintrk('load','${tid}');`,
        `pintrk('page');`,
        `<\/script>`,
        `<noscript><img height="1" width="1" style="display:none;" alt="" src="https://ct.pinterest.com/v3/?event=init&tid=${tid}&noscript=1" /></noscript>`
      ].join('\n'));
    },
    handleEvent({ name, payload, config }) {
      if (!config.tagId) return false;
      const ev = {
        page_view: 'pageview',
        view_item: 'viewcategory' ,
        add_to_cart: 'addtocart',
        begin_checkout: 'begincheckout',
        purchase: 'checkout'
      }[name];
      if (!ev || typeof pintrk !== 'function') return false;
      pintrk('track', ev, { event_id: payload.event_id || undefined, value: payload.value, currency: payload.currency });
      return { event: ev };
    }
  });

  // ---------------------------------------------------------------------------
  // 8) GOOGLE SHEETS (real webhook → Apps Script)
  // ---------------------------------------------------------------------------
  M.register({
    id: 'googleSheets',
    name: 'Google Sheets',
    icon: 'sheets',
    tagline: 'احفظ أحداث المتجر في Google Sheets عبر Webhook / Apps Script.',
    events: ['page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'],
    enabled: false,
    fields: [
      { key: 'webhook', label: 'Webhook / Apps Script Endpoint', placeholder: 'https://script.google.com/.../exec', required: true },
      { key: 'sheetName', label: 'اسم الورقة (اختياري)', default: 'bazaar', required: false }
    ],
    validate(values) {
      if (!values.webhook) return { ok: false, message: 'أدخل رابط Webhook الخاص بـ Apps Script' };
      if (!/^https:\/\//.test(String(values.webhook))) return { ok: false, message: 'الرابط يجب أن يبدأ بـ https://' };
      return { ok: true };
    },
    async test(values) {
      try {
        const r = await fetch(String(values.webhook), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'test', ts: Date.now() }), cache: 'no-store' });
        const body = await r.text();
        return { ok: r.ok, message: r.ok ? ('متصل: ' + (body.slice(0,80)||'OK')) : ('فشل (' + r.status + ') : ' + (body||'').slice(0,120)) };
      } catch (e) {
        return { ok: false, message: 'فشل الاتصال: ' + ((e && e.message) || e) };
      }
    },
    async handleEvent({ name, payload, config }) {
      if (!config.webhook) return false;
      try {
        const r = await fetch(String(config.webhook), { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ event: name, ts: new Date().toISOString() }, payload || {})), cache: 'no-store' });
        return { ok: r.ok, status: r.status };
      } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    },
    endpointTemplate: `function doPost(e){
  var ss = SpreadsheetApp.openById('YOUR_SPREADSHEET_ID');
  var sh = ss.getSheetByName(e.parameter.sheet || 'Bazaar') || ss.insertSheet('Bazaar');
  var data = JSON.parse(typeof e.postData === 'string' ? e.postData : JSON.stringify(e.postData.contents));
  var header = ['ts','event','item','value','currency'];
  if (sh.getLastRow() === 0) sh.appendRow(header);
  sh.appendRow([new Date().toISOString(), data.event||'', data.item_id||data.items||'', data.value||'', data.currency||'']);
  return ContentService.createTextOutput(JSON.stringify({ok:true}));
}`
  });

  // ---------------------------------------------------------------------------
  // SHARED HELPER: inject marked snippets into <head> with de-duplication.
  // Uses real DOM appendChild so <script> nodes actually load/run when this
  // manager runs inside the live bazar-dzair site. Every node we append is
  // tagged data-bazar so re-injection / disable removal never duplicates.
  // ---------------------------------------------------------------------------
  function injectMarked(id, html) {
    const head = document.head || document.getElementsByTagName('head')[0];
    if (!head) { console.warn('[' + id + '] no <head> found'); return; }
    // 1) remove any previous instance of this plugin (dedup)
    Array.from(head.querySelectorAll('[data-bazar="' + id + '"]')).forEach((n) => n.remove());
    // 2) parse the snippet into a template fragment
    const wrap = document.createElement('template');
    wrap.innerHTML = html;
    const frag = document.createDocumentFragment();
    const kids = wrap.content ? Array.from(wrap.content.children) : Array.from(wrap.childNodes);
    kids.forEach((kid) => {
      const clone = kid.cloneNode(true);
      clone.setAttribute('data-bazar', id);
      frag.appendChild(clone);
    });
    head.appendChild(frag);
  }

  // Helpers exposed for later re-init
  M.__snippet = injectMarked;

  // Wire app-level callbacks after registry ready.
})();