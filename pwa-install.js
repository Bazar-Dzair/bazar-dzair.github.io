/* Bazar Dzair — المتجر: شريط "حمّل تطبيق Bazar Dzair" (ملف APK) + تسجيل الـ Service Worker.
   - يظهر في أعلى الصفحة على هواتف Android فقط، بعد ثانيتين ونصف، دون الاعتماد على قرار Chrome.
   - لا يظهر داخل التطبيق نفسه ولا داخل تطبيق PWA مثبّت ولا على الكمبيوتر.
   - زر "تحميل" يفتح Bazar-Dzair.apk من GitHub Releases. الإغلاق يخفيه 7 أيام.
   - أي عنصر يحمل data-pwa-install يُظهَر على Android ويفتح نفس التحميل.
   - لا يعمل في admin / orders / success ولا يلمس أي وظيفة أخرى في الموقع. */
(function () {
  'use strict';
  if (window.__bazarPwaLoaded) return;
  window.__bazarPwaLoaded = true;

  var SKIP = /^\/(admin|orders|success)(\.html|\/|$)/;
  if (SKIP.test(location.pathname)) return;

  /* داخل تطبيق Android فقط: تحميل واجهة التطبيق (app-shell.js) — لا تُحمَّل لزوّار المتصفح */
  if (/BazarDzairApp/.test(navigator.userAgent)) {
    var sh = document.createElement('script');
    sh.src = '/app-shell.js';
    sh.defer = true;
    (document.head || document.documentElement).appendChild(sh);
  }

  var APK_URL = 'https://github.com/Bazar-Dzair/bazar-dzair.github.io/releases/download/apps/Bazar-Dzair.apk';
  var KEY = 'bazarApkDismissedAt';
  var WAIT_MS = 7 * 24 * 60 * 60 * 1000;
  var SHOW_DELAY = 2500;
  var banner = null, timer = 0;

  function store(get, k, v) {
    try { return get ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (e) { return null; }
  }
  function lang() {
    try { if (window.BazarI18n && BazarI18n.getLang) return BazarI18n.getLang() === 'fr' ? 'fr' : 'ar'; } catch (e) {}
    return store(true, 'bazarLang') === 'fr' ? 'fr' : 'ar';
  }
  function standalone() {
    try {
      return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    } catch (e) { return false; }
  }
  function inApp() { return /BazarDzairApp/.test(navigator.userAgent); }
  function android() { return /Android/i.test(navigator.userAgent); }
  function eligible() { return android() && !inApp() && !standalone(); }
  function dismissedRecently() {
    var t = Number(store(true, KEY));
    return !!t && Date.now() - t < WAIT_MS;
  }

  var TXT = {
    ar: { title: 'حمّل تطبيق Bazar Dzair', sub: 'تسوّق أسرع من تطبيق على هاتفك', ok: 'تحميل', later: 'لاحقًا' },
    fr: { title: "Téléchargez l'appli Bazar Dzair", sub: 'Achetez plus vite depuis votre téléphone', ok: 'Télécharger', later: 'Plus tard' }
  };

  function css() {
    if (document.getElementById('bazarPwaCss')) return;
    var s = document.createElement('style');
    s.id = 'bazarPwaCss';
    s.textContent =
      '#bazarPwa{display:flex;align-items:center;gap:10px;padding:0 12px;max-height:0;opacity:0;overflow:hidden;box-sizing:border-box;' +
      'background:#061e3d;color:#fff;border-bottom:0 solid #ff6a00;font-family:Tahoma,Arial,sans-serif;' +
      'transition:max-height .35s ease,opacity .35s ease,padding .35s ease,border-width .35s ease}' +
      '#bazarPwa.on{max-height:96px;opacity:1;padding:8px 12px;border-bottom-width:3px}' +
      '#bazarPwa img{width:38px;height:38px;border-radius:9px;background:#fff;flex:none}' +
      '#bazarPwa .t{flex:1;min-width:0}' +
      '#bazarPwa .t b{display:block;font-size:14px;line-height:1.4}' +
      '#bazarPwa .t span{display:block;font-size:11.5px;color:#b9c6d9;line-height:1.4}' +
      '#bazarPwa button{font-family:inherit;cursor:pointer;border:0;border-radius:10px;font-weight:800}' +
      '#bazarPwa .go{background:#ff6a00;color:#fff;padding:9px 16px;font-size:14px;flex:none}' +
      '#bazarPwa .no{background:transparent;color:#b9c6d9;font-size:22px;line-height:1;padding:6px 8px;flex:none}' +
      '@media (prefers-reduced-motion:reduce){#bazarPwa{transition:none}}';
    document.head.appendChild(s);
  }

  function hide(remember) {
    clearTimeout(timer);
    if (remember) store(false, KEY, String(Date.now()));
    if (!banner) return;
    var b = banner; banner = null;
    b.classList.remove('on');
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 400);
  }

  function download() {
    hide(true);
    location.href = APK_URL;
  }

  function show() {
    if (banner || !eligible() || dismissedRecently()) return;
    if (document.visibilityState === 'hidden') { timer = setTimeout(show, 2000); return; }
    css();
    var L = TXT[lang()];
    var d = document.createElement('div');
    d.id = 'bazarPwa';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', L.title);
    d.dir = lang() === 'fr' ? 'ltr' : 'rtl';
    d.innerHTML =
      '<img src="/icons/icon-192.png" alt="" width="38" height="38">' +
      '<div class="t"><b></b><span></span></div>' +
      '<button type="button" class="go"></button><button type="button" class="no">&times;</button>';
    d.querySelector('b').textContent = L.title;
    d.querySelector('span').textContent = L.sub;
    d.querySelector('.go').textContent = L.ok;
    d.querySelector('.no').setAttribute('aria-label', L.later);
    d.querySelector('.go').addEventListener('click', download);
    d.querySelector('.no').addEventListener('click', function () { hide(true); });
    document.body.insertBefore(d, document.body.firstChild);
    banner = d;
    requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.add('on'); }); });
  }

  function syncButtons() {
    var on = eligible();
    var els = document.querySelectorAll('[data-pwa-install]');
    for (var i = 0; i < els.length; i++) els[i].hidden = !on;
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-pwa-install]') : null;
    if (t) { e.preventDefault(); download(); }
  });

  function start() {
    syncButtons();
    if (!dismissedRecently()) timer = setTimeout(show, SHOW_DELAY);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.BazarPWA = { canInstall: eligible, promptInstall: download };

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      try { navigator.serviceWorker.register('/sw.js').catch(function () {}); } catch (e) {}
    });
  }
})();
