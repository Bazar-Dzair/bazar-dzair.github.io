/* Bazar Dzair — لوحة الإدارة: شريط "حمّل تطبيق الإدارة" (ملف APK) + تسجيل الـ Service Worker.
   - يظهر على هواتف Android فقط، وبعد ثانيتين ونصف من فتح الصفحة، دون الاعتماد على قرار Chrome.
   - لا يظهر داخل التطبيق نفسه (Bazar Admin) ولا داخل تطبيق PWA مثبّت.
   - زر "تحميل" يفتح ملف Bazar-Admin.apk من GitHub Releases. إغلاق الشريط يخفيه 7 أيام.
   - أي عنصر يحمل data-pwa-install يُظهَر على Android ويفتح نفس التحميل.
   - لا يلمس تسجيل الدخول ولا Firebase ولا أي وظيفة أخرى في لوحة التحكم. */
(function () {
  'use strict';
  if (window.__bazarAdminPwaLoaded) return;
  window.__bazarAdminPwaLoaded = true;

  var APK_URL = 'https://github.com/Bazar-Dzair/bazar-dzair.github.io/releases/download/apps/Bazar-Admin.apk';
  var KEY = 'bazarAdminPwaDismissedAt';
  var WAIT_MS = 7 * 24 * 60 * 60 * 1000;
  var SHOW_DELAY = 2500;
  var banner = null, timer = 0;

  function ls(get, k, v) { try { return get ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (e) { return null; } }
  function standalone() {
    try { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
    catch (e) { return false; }
  }
  function inApp() { return /BazarDzairApp/.test(navigator.userAgent); }
  function android() { return /Android/i.test(navigator.userAgent); }
  function eligible() { return android() && !inApp() && !standalone(); }
  function dismissedRecently() { var t = Number(ls(true, KEY)); return !!t && Date.now() - t < WAIT_MS; }

  function css() {
    if (document.getElementById('bazarAdminPwaCss')) return;
    var s = document.createElement('style');
    s.id = 'bazarAdminPwaCss';
    s.textContent =
      '#bazarAdminPwa{position:fixed;left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom,0px));max-width:440px;margin:0 auto;z-index:70;' +
      'display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:#182536;color:#fff;' +
      'border:1px solid rgba(255,255,255,.12);box-shadow:0 12px 32px rgba(0,0,0,.35);font-family:Tahoma,Arial,sans-serif;' +
      'transform:translateY(140%);opacity:0;transition:transform .35s ease,opacity .35s ease}' +
      '#bazarAdminPwa.on{transform:none;opacity:1}' +
      '#bazarAdminPwa img{width:42px;height:42px;border-radius:10px;flex:none}' +
      '#bazarAdminPwa .t{flex:1;min-width:0}' +
      '#bazarAdminPwa .t b{display:block;font-size:14px;line-height:1.4}' +
      '#bazarAdminPwa .t span{display:block;font-size:11.5px;color:#b9c6d9;line-height:1.4}' +
      '#bazarAdminPwa button{font-family:inherit;cursor:pointer;border:0;border-radius:10px;font-weight:800}' +
      '#bazarAdminPwa .go{background:#ff6a00;color:#fff;padding:9px 16px;font-size:14px;flex:none}' +
      '#bazarAdminPwa .no{background:transparent;color:#b9c6d9;font-size:22px;line-height:1;padding:6px 8px;flex:none}' +
      '@media (prefers-reduced-motion:reduce){#bazarAdminPwa{transition:none}}';
    document.head.appendChild(s);
  }

  function hide(remember) {
    clearTimeout(timer);
    if (remember) ls(false, KEY, String(Date.now()));
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
    var d = document.createElement('div');
    d.id = 'bazarAdminPwa';
    d.dir = 'rtl';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', 'تحميل تطبيق الإدارة');
    d.innerHTML =
      '<img src="/icons/admin-192.png" alt="" width="42" height="42">' +
      '<div class="t"><b>حمّل تطبيق الإدارة</b><span>افتح لوحة التحكم كتطبيق على هاتفك</span></div>' +
      '<button type="button" class="go">تحميل</button>' +
      '<button type="button" class="no" aria-label="لاحقًا">&times;</button>';
    d.querySelector('.go').addEventListener('click', download);
    d.querySelector('.no').addEventListener('click', function () { hide(true); });
    document.body.appendChild(d);
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

  window.BazarAdminPWA = { canInstall: eligible, promptInstall: download };

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      try { navigator.serviceWorker.register('/sw.js').catch(function () {}); } catch (e) {}
    });
  }
})();
