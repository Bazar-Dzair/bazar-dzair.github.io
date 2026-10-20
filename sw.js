/* Bazar Dzair — Service Worker
   الهدف: جعل الزيارات التالية سريعة جدًا حتى مع الإنترنت الضعيف.
   - صفحات HTML: الشبكة أولًا بمهلة 3 ثوانٍ، وإلا تُعرض النسخة المخزّنة فورًا.
   - ملفات الموقع (js/css/خطوط/أيقونات): من التخزين مباشرة ثم تحديث صامت في الخلفية.
   - صور Cloudinary: من التخزين مباشرة ثم تحديث صامت (بحد أقصى 150 صورة).
   لا يلمس أبدًا: لوحة التحكم، الطلبات (POST)، Firestore، الـ Worker، أو أي طلب آخر. */
const VERSION = 'bazar-v1';
const PAGES = VERSION + '-pages';
const ASSETS = VERSION + '-assets';
const IMAGES = VERSION + '-images';
const MAX_IMAGES = 150;
const NAV_TIMEOUT = 3000;
const SKIP = /^\/(admin|orders|success)(\.html|\/|$)/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [PAGES, ASSETS, IMAGES];
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

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  const network = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  });
  try {
    return await Promise.race([network, timeout(NAV_TIMEOUT)]);
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) { network.catch(() => {}); return cached; }
    return network; // لا نسخة مخزّنة: انتظر الشبكة كالمعتاد
  }
}

async function staleWhileRevalidate(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const update = fetch(request).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) {
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
  if (res && res.ok) cache.put(request, res.clone());
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
