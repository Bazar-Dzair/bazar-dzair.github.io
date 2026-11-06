/* Bazar Dzair — زر/شريط تثبيت التطبيق (PWA) على Android + تسجيل الـ Service Worker.
   - يظهر فقط عندما يسمح Chrome بالتثبيت (حدث beforeinstallprompt) وإذا لم يكن التطبيق مثبتًا.
   - لا يزعج الزائر: يظهر بعد بضع ثوانٍ، وعند الرفض لا يعود قبل 7 أيام.
   - لا يعمل في admin / orders / success ولا يلمس أي وظيفة أخرى في الموقع.
   - أي عنصر يحمل الخاصية data-pwa-install (مثلاً زر في القائمة) يُظهَر تلقائيًا عند إمكانية التثبيت
     وينفّذ التثبيت عند الضغط. للاستدعاء البرمجي: window.BazarPWA.promptInstall() */
(function () {
  'use strict';
  if (window.__bazarPwaLoaded) return;
  window.__bazarPwaLoaded = true;

  var SKIP = /^\/(admin|orders|success)(\.html|\/|$)/;
  if (SKIP.test(location.pathname)) return;

  var KEY = 'bazarPwaDismissedAt';
  var WAIT_MS = 7 * 24 * 60 * 60 * 1000;   // 7 أيام بعد الرفض
  var SHOW_DELAY = 6000;                    // لا يظهر فور فتح الصفحة
  var deferred = null;
  var banner = null;
  var timer = 0;

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
  function dismissedRecently() {
    var t = Number(store(true, KEY));
    return !!t && Date.now() - t < WAIT_MS;
  }

  var TXT = {
    ar: { title: 'ثبّت تطبيق Bazar Dzair', sub: 'تصفّح أسرع وأيقونة على شاشتك الرئيسية', ok: 'تثبيت', later: 'لاحقًا' },
    fr: { title: "Installer l'appli Bazar Dzair", sub: "Navigation plus rapide, icône sur votre écran d'accueil", ok: 'Installer', later: 'Plus tard' }
  };

  function css() {
    if (document.getElementById('bazarPwaCss')) return;
    var s = document.createElement('style');
    s.id = 'bazarPwaCss';
    s.textContent =
      '#bazarPwa{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));max-width:460px;margin:0 auto;z-index:80;' +
      'display:flex;align-items:center;gap:12px;padding:12px;border-radius:16px;background:#061e3d;color:#fff;' +
      'box-shadow:0 12px 32px rgba(0,0,0,.35);font-family:Tahoma,Arial,sans-serif;transform:translateY(140%);opacity:0;' +
      'transition:transform .35s ease,opacity .35s ease}' +
      '#bazarPwa.on{transform:none;opacity:1}' +
      '#bazarPwa img{width:44px;height:44px;border-radius:11px;background:#fff;flex:none}' +
      '#bazarPwa .t{flex:1;min-width:0}' +
      '#bazarPwa .t b{display:block;font-size:15px;line-height:1.4}' +
      '#bazarPwa .t span{display:block;font-size:12px;color:#b9c6d9;line-height:1.5}' +
      '#bazarPwa .b{display:flex;flex-direction:column;gap:6px;flex:none}' +
      '#bazarPwa button{font-family:inherit;cursor:pointer;border:0;border-radius:10px;padding:8px 14px;font-size:14px;font-weight:800}' +
      '#bazarPwa .go{background:#ff6a00;color:#fff}' +
      '#bazarPwa .no{background:transparent;color:#b9c6d9;font-weight:600;padding:4px 14px;font-size:12px}' +
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

  function show() {
    if (banner || !deferred || standalone() || dismissedRecently()) return;
    if (document.visibilityState === 'hidden') { timer = setTimeout(show, 2000); return; }
    css();
    var L = TXT[lang()];
    var d = document.createElement('div');
    d.id = 'bazarPwa';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', L.title);
    d.dir = lang() === 'fr' ? 'ltr' : 'rtl';
    d.innerHTML =
      '<img src="/icons/icon-192.png" alt="" width="44" height="44">' +
      '<div class="t"><b></b><span></span></div>' +
      '<div class="b"><button type="button" class="go"></button><button type="button" class="no"></button></div>';
    d.querySelector('b').textContent = L.title;
    d.querySelector('span').textContent = L.sub;
    d.querySelector('.go').textContent = L.ok;
    d.querySelector('.no').textContent = L.later;
    d.querySelector('.go').addEventListener('click', install);
    d.querySelector('.no').addEventListener('click', function () { hide(true); });
    document.body.appendChild(d);
    banner = d;
    requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.add('on'); }); });
  }

  function install() {
    var ev = deferred;
    if (!ev) return;
    deferred = null;            // prompt() يعمل مرة واحدة فقط لكل حدث
    hide(false);
    syncButtons();
    try {
      ev.prompt();
      if (ev.userChoice && ev.userChoice.then) {
        ev.userChoice.then(function (c) {
          if (!c || c.outcome !== 'accepted') store(false, KEY, String(Date.now()));
        }).catch(function () {});
      }
    } catch (e) {}
  }

  function syncButtons() {
    var on = !!deferred && !standalone();
    var els = document.querySelectorAll('[data-pwa-install]');
    for (var i = 0; i < els.length; i++) els[i].hidden = !on;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    syncButtons();
    clearTimeout(timer);
    if (!dismissedRecently() && !standalone()) timer = setTimeout(show, SHOW_DELAY);
  });

  window.addEventListener('appinstalled', function () {
    deferred = null;
    hide(false);
    syncButtons();
  });

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-pwa-install]') : null;
    if (t) { e.preventDefault(); install(); }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncButtons);
  else syncButtons();

  window.BazarPWA = {
    canInstall: function () { return !!deferred && !standalone(); },
    promptInstall: install
  };

  // تسجيل الـ Service Worker (آمن لو سُجّل من صفحة أخرى: التسجيل المتكرر لنفس الملف لا يضر)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      try { navigator.serviceWorker.register('/sw.js').catch(function () {}); } catch (e) {}
    });
  }
})();
