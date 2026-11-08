/* Bazar Dzair — واجهة التطبيق: يعمل فقط داخل تطبيق Android (UA يحتوي BazarDzairApp).
   يضيف صنف bz-app على <html>، وشريط تنقل سفلي (الرئيسية / السلة / حسابي)، وزر رجوع في صفحة المنتج.
   لا يغيّر منطق الموقع ولا الطلبات ولا Firebase. */
(function () {
  'use strict';
  if (!/BazarDzairApp/.test(navigator.userAgent)) return;
  if (/^\/(admin)(\.html|\/|$)/.test(location.pathname)) return;
  var de = document.documentElement;
  de.classList.add('bz-app');
  /* تحميل التنسيق من هنا فقط، فلا يُحمَّل لزوّار المتصفح */
  var lk = document.createElement('link');
  lk.rel = 'stylesheet';
  lk.href = '/app-shell.css';
  (document.head || de).appendChild(lk);
  var path = location.pathname;
  var isProduct = /(^|\/)product\//.test(path) || /product\.html$/.test(path);
  var isOrders = /^\/orders(\.html|\/|$)/.test(path);
  var isSuccess = /^\/success(\.html|\/|$)/.test(path);
  if (isProduct) de.classList.add('bz-pp');

  function fr() { return de.getAttribute('lang') === 'fr'; }
  var T = {
    ar: { home: 'الرئيسية', cart: 'السلة', acc: 'حسابي', det: 'تفاصيل المنتج', back: 'رجوع' },
    fr: { home: 'Accueil', cart: 'Panier', acc: 'Mon compte', det: 'Détails du produit', back: 'Retour' }
  };
  function L() { return T[fr() ? 'fr' : 'ar']; }

  var ICON = {
    home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
    cart: '<svg viewBox="0 0 24 24"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 7H6"/></svg>',
    acc: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><circle cx="12" cy="10" r="2.5"/><path d="M7.5 16.5c1-2 3-2.8 4.5-2.8s3.5.8 4.5 2.8"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>'
  };

  function cartCount() {
    var e = document.getElementById('cartCount') || document.getElementById('pcCartCount');
    var n = e ? parseInt(e.textContent, 10) : 0;
    return n > 0 ? n : 0;
  }

  function buildNav() {
    if (document.getElementById('bzNav') || isSuccess) return;
    var n = document.createElement('nav');
    n.id = 'bzNav';
    n.setAttribute('aria-label', 'Navigation');
    n.innerHTML =
      '<a href="/" data-t="home">' + ICON.home + '<span></span></a>' +
      '<a href="/?cart=1" data-t="cart">' + ICON.cart + '<span></span><i class="bzc" data-n="0"></i></a>' +
      '<a href="/orders.html" data-t="acc">' + ICON.acc + '<span></span></a>';
    document.body.appendChild(n);
    var links = n.querySelectorAll('a');
    links[0].className = (!isOrders && !isProduct && !/[?&]cart=1/.test(location.search)) ? 'on' : '';
    links[1].className = /[?&]cart=1/.test(location.search) ? 'on' : '';
    links[2].className = isOrders ? 'on' : '';
    /* على الصفحة الرئيسية: السلة تفتح اللوحة الموجودة دون إعادة تحميل */
    links[1].addEventListener('click', function (e) {
      if (typeof window.openCart === 'function' && document.getElementById('cartBtn')) {
        e.preventDefault();
        window.openCart();
      }
    });
    labels();
  }

  function labels() {
    var n = document.getElementById('bzNav');
    if (!n) return;
    var t = L(), as = n.querySelectorAll('a');
    for (var i = 0; i < as.length; i++) as[i].querySelector('span').textContent = t[as[i].getAttribute('data-t')];
    var c = cartCount(), b = n.querySelector('.bzc');
    b.textContent = c ? String(c) : '';
    b.setAttribute('data-n', String(c));
  }

  function buildBack() {
    var bar = document.querySelector('.topbar-in');
    if (!bar || bar.querySelector('.bz-back')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'bz-back';
    b.setAttribute('aria-label', L().back);
    b.innerHTML = ICON.back;
    b.addEventListener('click', function () {
      if (history.length > 1) history.back(); else location.href = '/';
    });
    var t = document.createElement('span');
    t.className = 'bz-title';
    t.textContent = L().det;
    bar.insertBefore(t, bar.firstChild);
    bar.insertBefore(b, bar.firstChild);
  }

  function refresh() {
    labels();
    var t = document.querySelector('.bz-title');
    if (t) t.textContent = L().det;
    var b = document.querySelector('.bz-back');
    if (b) b.setAttribute('aria-label', L().back);
  }

  function start() {
    buildNav();
    if (isProduct) buildBack();
    try {
      new MutationObserver(refresh).observe(de, { attributes: true, attributeFilter: ['lang'] });
      var ce = document.getElementById('cartCount') || document.getElementById('pcCartCount');
      if (ce) new MutationObserver(refresh).observe(ce, { childList: true, characterData: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
