/* Bazar Dzair — Service Worker
   الهدف: جعل الزيارات التالية سريعة جدًا حتى مع الإنترنت الضعيف، مع عدم عرض محتوى قديم.
   - صفحات HTML: الشبكة أولًا (مع تجاوز كاش المتصفح لتفادي نسخة عمرها 10 دقائق من GitHub Pages)
     بمهلة 3 ثوانٍ، وإلا تُعرض النسخة المخزّنة. وإن انقطع الإنترنت ولا نسخة مخزّنة تظهر offline.html.
     الأسعار والتوفر الحقيقية تُقرأ دائمًا من Firestore عند التشغيل (لا يلمسها هذا الملف).
   - ملفات الموقع (js/css/خطوط/أيقونات): من التخزين مباشرة ثم تحديث صامت في الخلفية.
   - صور Cloudinary: من التخزين مباشرة ثم تحديث صامت (بحد أقصى 150 صورة).
   لا يلمس أبدًا: لوحة التحكم، الطلبات (POST)، Firestore، الـ Worker، أو أي طلب آخر.
   لا يخزّن أي استجابة تحمل Cache-Control: no-store. */
const VERSION = 'bazar-v2';
const PAGES = VERSION + '-pages';
const ASSETS = VERSION + '-assets';
const IMAGES = VERSION + '-images';
const OFFLINE = VERSION + '-offline';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png'];
const MAX_IMAGES = 150;
const MAX_PAGES = 60;
const NAV_TIMEOUT = 3000;
const SKIP = /^\/(admin|orders|success)(\.html|\/|$)/;

// يمنع تخزين أي استجابة يطلب الخادم عدم تخزينها
function cacheable(res) {
  if (!res) return false;
  const cc = (res.headers && res.headers.get('Cache-Control')) || '';
  return !/no-store/i.test(cc);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(OFFLINE);
      await Promise.all(PRECACHE.map(async (u) => {
        try {
          const res = await fetch(new Request(u, { cache: 'reload' }));
          if (res && res.ok) await cache.put(u, res);
        } catch (e) { /* فشل التخزين المسبق لا يمنع تثبيت الـ Service Worker */ }
      }));
    } catch (e) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [PAGES, ASSETS, IMAGES, OFFLINE];
    const names = await caches.keys();
    await Promise.all(names.filter((n) => !keep.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function offlinePage() {
  const cache = await caches.open(OFFLINE);
  const res = await cache.match(OFFLINE_URL);
  return res || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  // no-cache: يتحقق من الخادم دائمًا (GitHub Pages يضع max-age=600 فيُظهر صفحة عمرها 10 دقائق)
  const network = fetch(request, { cache: 'no-cache' }).then((res) => {
    if (res && res.ok && cacheable(res)) {
      cache.put(request, res.clone()).then(() => trim(PAGES, MAX_PAGES));
    }
    return res;
  });
  try {
    return await Promise.race([network, timeout(NAV_TIMEOUT)]);
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) { network.catch(() => {}); return cached; }
    // لا نسخة مخزّنة: انتظر الشبكة كالمعتاد، وإن فشلت (لا إنترنت) اعرض صفحة offline
    try { return await network; } catch (e2) { return offlinePage(); }
  }
}

async function staleWhileRevalidate(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const update = fetch(request).then((res) => {
    if (res && (res.ok || res.type === 'opaque') && cacheable(res)) {
      cache.put(request, res.clone()).then(() => max && trim(cacheName, max));
    }
    return res;
  });
  if (cached) { update.catch(() => {}); return cached; }
  return update;
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok && cacheable(res)) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // صور المنتجات من Cloudinary (طلب CORS كي لا تُحتسب كاملةً في حصة التخزين)
  if (url.hostname === 'res.cloudinary.com' && req.destination === 'image') {
    const corsReq = new Request(req.url, { mode: 'cors', credentials: 'omit' });
    event.respondWith(
      staleWhileRevalidate(corsReq, IMAGES, MAX_IMAGES).catch(() => fetch(req))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (SKIP.test(url.pathname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  if (['script', 'style', 'font', 'image', 'manifest'].includes(req.destination)) {
    event.respondWith(
      (url.searchParams.has('v') ? cacheFirst(req) : staleWhileRevalidate(req, ASSETS))
        .catch(() => fetch(req))
    );
  }
});
