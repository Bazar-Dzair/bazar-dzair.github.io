/* Bazar Dzair — واجهة التطبيق (تسوّق على طراز التطبيقات).
   يعمل فقط داخل تطبيق Android (UA يحتوي BazarDzairApp). لا يغيّر منطق الطلبات/Firebase/الشحن. */
(function () {
  'use strict';
  if (!/BazarDzairApp/.test(navigator.userAgent)) return;
  if (/^\/admin(\.html|\/|$)/.test(location.pathname)) return;
  if (window.__bzShell) return;
  window.__bzShell = true;

  var de = document.documentElement;
  de.classList.add('bz-app');
  var lk = document.createElement('link');
  lk.rel = 'stylesheet'; lk.href = '/app-shell.css';
  (document.head || de).appendChild(lk);

  var path = location.pathname;
  var isProduct = /(^|\/)product\//.test(path) || /product\.html$/.test(path);
  var isOrders = /^\/orders(\.html|\/|$)/.test(path);
  var isSuccess = /^\/success(\.html|\/|$)/.test(path);
  var isHome = !isProduct && !isOrders && !isSuccess && !/^\/policies/.test(path);
  if (isProduct) de.classList.add('bz-pp');

  var FAVKEY = 'bzFavs';
  function lang() { return de.getAttribute('lang') === 'fr' ? 'fr' : 'ar'; }
  var T = {
    ar: { home: 'الرئيسية', cart: 'السلة', acc: 'حسابي', det: 'تفاصيل المنتج', back: 'رجوع', buy: 'اطلب الآن', share: 'مشاركة',
      more: 'عرض المزيد', less: 'عرض أقل', lang: 'Français', orders: 'طلباتي', pol: 'السياسات', copied: 'تم نسخ رابط المنتج',
      favs: 'المفضلة', search: 'بحث', cats: 'الأقسام', chat: 'تواصل معنا', menu: 'القائمة', noFav: 'لا توجد منتجات مفضلة بعد' },
    fr: { home: 'Accueil', cart: 'Panier', acc: 'Mon compte', det: 'Détails du produit', back: 'Retour', buy: 'Acheter', share: 'Partager',
      more: 'Afficher plus', less: 'Afficher moins', lang: 'العربية', orders: 'Mes commandes', pol: 'Politiques', copied: 'Lien copié',
      favs: 'Favoris', search: 'Recherche', cats: 'Catégories', chat: 'Contact', menu: 'Menu', noFav: 'Aucun favori pour le moment' }
  };
  function L() { return T[lang()]; }
  function S(d) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; }
  var I = {
    home: S('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
    cart: S('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 7H6"/>'),
    acc: S('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><circle cx="12" cy="10" r="2.5"/><path d="M7.5 16.5c1-2 3-2.8 4.5-2.8s3.5.8 4.5 2.8"/>'),
    back: S('<path d="M15 5l-7 7 7 7"/>'),
    dots: S('<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>'),
    chat: S('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h7M8.5 14h4"/>'),
    heart: S('<path d="M12 20s-7.5-4.6-9.2-9.3C1.6 7.3 3.7 4 7 4c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.3 0 5.4 3.3 4.2 6.7C19.5 15.4 12 20 12 20z"/>'),
    search: S('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
    grid: S('<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>'),
    share: S('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6"/>'),
    bag: S('<path d="M6 8h12l1 12H5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>')
  };

  /* ---------- المفضلة (محليًا على الجهاز) ---------- */
  function favs() { try { var a = JSON.parse(localStorage.getItem(FAVKEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveFavs(a) { try { localStorage.setItem(FAVKEY, JSON.stringify(a)); } catch (e) {} }
  function slugOf(href) {
    var m = String(href || '').match(/\/product\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }
  function toggleFav(slug) {
    var a = favs(), i = a.indexOf(slug);
    if (i < 0) a.push(slug); else a.splice(i, 1);
    saveFavs(a);
    return i < 0;
  }
  function syncFavUI() {
    var a = favs(), i, els = document.querySelectorAll('.bzfav');
    for (i = 0; i < els.length; i++) els[i].classList.toggle('on', a.indexOf(els[i].getAttribute('data-slug')) > -1);
    var sf = document.querySelector('#bzShareRow .fav');
    if (sf) sf.classList.toggle('on', a.indexOf(slugOf(location.pathname)) > -1);
    var dot = document.querySelector('#bzBar [data-a="fav"]');
    if (dot) { dot.classList.toggle('on', de.classList.contains('bz-favs')); }
    var cards = document.querySelectorAll('#productGrid .product');
    var showFav = de.classList.contains('bz-favs');
    for (i = 0; i < cards.length; i++) {
      var s = cards[i].getAttribute('data-bzslug');
      cards[i].classList.toggle('bz-nofav', showFav && a.indexOf(s) < 0);
    }
  }
  function bzToast(msg) {
    if (typeof window.toast === 'function') { try { window.toast(msg); return; } catch (e) {} }
    var t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(window.bzTt); window.bzTt = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------- الصفحة الرئيسية ---------- */
  function buildBar() {
    if (document.getElementById('bzBar')) return;
    var h = document.querySelector('header .header') || document.querySelector('header');
    if (!h) return;
    var b = document.createElement('div');
    b.id = 'bzBar';
    b.innerHTML =
      '<button type="button" data-a="menu">' + I.dots + '</button>' +
      '<button type="button" data-a="chat">' + I.chat + '</button>' +
      '<button type="button" data-a="fav">' + I.heart + '</button>' +
      '<button type="button" data-a="search">' + I.search + '</button>' +
      '<button type="button" data-a="cats">' + I.grid + '</button>';
    h.insertBefore(b, h.firstChild);
    b.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('button[data-a]') : null;
      if (!t) return;
      var a = t.getAttribute('data-a');
      if (a === 'menu') openMenu();
      else if (a === 'chat') { var c = document.querySelector('.bcw-btn'); if (c) c.click(); }
      else if (a === 'fav') {
        de.classList.toggle('bz-favs');
        syncFavUI();
        if (de.classList.contains('bz-favs') && !favs().length) bzToast(L().noFav);
      }
      else if (a === 'search') {
        de.classList.toggle('bz-search');
        var i = document.getElementById('search');
        if (i && de.classList.contains('bz-search')) setTimeout(function () { i.focus(); }, 50);
      }
      else if (a === 'cats') { if (typeof window.openCategoryMenu === 'function') window.openCategoryMenu(); }
    });
    var ti = ['menu', 'chat', 'fav', 'search', 'cats'], tk = ['menu', 'chat', 'favs', 'search', 'cats'];
    for (var k = 0; k < ti.length; k++) b.querySelector('[data-a="' + ti[k] + '"]').setAttribute('aria-label', L()[tk[k]]);
  }

  function openMenu() {
    var m = document.getElementById('bzMenu');
    if (!m) {
      m = document.createElement('div');
      m.id = 'bzMenu';
      m.innerHTML = '<div class="sheet"><button type="button" data-m="lang"></button><a href="/orders.html" data-m="orders"></a><a href="/policies.html" data-m="pol"></a></div>';
      m.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('[data-m]') : null;
        if (t && t.getAttribute('data-m') === 'lang' && window.BazarI18n && BazarI18n.toggleLang) BazarI18n.toggleLang();
        if (!t || t.getAttribute('data-m') === 'lang') { e.preventDefault(); closeMenu(); }
      });
      document.body.appendChild(m);
    }
    var l = L();
    m.querySelector('[data-m=lang]').textContent = l.lang;
    m.querySelector('[data-m=orders]').textContent = l.orders;
    m.querySelector('[data-m=pol]').textContent = l.pol;
    m.classList.add('on');
  }
  function closeMenu() { var m = document.getElementById('bzMenu'); if (m) m.classList.remove('on'); }

  function decorateCard(c) {
    if (c.getAttribute('data-bz')) return;
    c.setAttribute('data-bz', '1');
    var a = c.querySelector('a[href*="/product/"]');
    var slug = a ? slugOf(a.getAttribute('href')) : '';
    c.setAttribute('data-bzslug', slug);
    var pic = c.querySelector('.pic');
    if (slug && pic) {
      var f = document.createElement('button');
      f.type = 'button'; f.className = 'bzfav'; f.setAttribute('data-slug', slug); f.innerHTML = I.heart;
      f.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        toggleFav(slug); syncFavUI();
      });
      c.insertBefore(f, c.firstChild);
    }
    var by = c.querySelector('.buybtn');
    if (by) { by.innerHTML = I.bag + '<span>' + L().buy + '</span>'; by.firstChild.style.cssText = 'width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2'; }
  }
  function decorateAll() {
    var cs = document.querySelectorAll('.products .product');
    for (var i = 0; i < cs.length; i++) decorateCard(cs[i]);
    syncFavUI();
  }
  function watchGrid() {
    var g = document.getElementById('productGrid');
    if (!g) return;
    decorateAll();
    try { new MutationObserver(function () { decorateAll(); }).observe(g, { childList: true }); } catch (e) {}
  }

  /* ---------- الشريط السفلي ---------- */
  function cartCount() {
    var e = document.getElementById('cartCount') || document.getElementById('pcCartCount');
    var n = e ? parseInt(e.textContent, 10) : 0;
    return n > 0 ? n : 0;
  }
  function buildNav() {
    if (document.getElementById('bzNav') || isSuccess || isProduct) return;
    var n = document.createElement('nav');
    n.id = 'bzNav';
    n.setAttribute('aria-label', 'Navigation');
    var cartOn = /[?&]cart=1/.test(location.search);
    n.innerHTML =
      '<a href="/" data-t="home"' + (isHome && !cartOn ? ' class="on"' : '') + '>' + I.home + '<span></span></a>' +
      '<a href="/?cart=1" data-t="cart"' + (cartOn ? ' class="on"' : '') + '>' + I.cart + '<span></span><i class="bzc" data-n="0"></i></a>' +
      '<button type="button" data-t="favs">' + I.heart + '<span></span></button>' +
      '<button type="button" data-t="search">' + I.search + '<span></span></button>' +
      '<button type="button" data-t="menu">' + I.acc + '<span></span></button>';
    document.body.appendChild(n);
    n.querySelector('[data-t=cart]').addEventListener('click', function (e) {
      if (typeof window.openCart === 'function' && document.getElementById('cartBtn')) { e.preventDefault(); window.openCart(); }
    });
    n.querySelector('[data-t=home]').addEventListener('click', function (e) {
      if (isHome && location.pathname === '/' && !location.search) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    n.querySelector('[data-t=favs]').addEventListener('click', function () {
      de.classList.toggle('bz-favs'); syncFavUI();
      if (de.classList.contains('bz-favs') && !favs().length) bzToast(L().noFav);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    n.querySelector('[data-t=search]').addEventListener('click', function () {
      de.classList.add('bz-search');
      var input = document.getElementById('search');
      if (input) { window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(function () { input.focus(); }, 180); }
    });
    n.querySelector('[data-t=menu]').addEventListener('click', openMenu);
  }

  /* ---------- صفحة المنتج ---------- */
  function buildProductPage() {
    var bar = document.querySelector('.topbar-in');
    if (bar && !bar.querySelector('.bz-back')) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'bz-back'; b.innerHTML = I.back;
      b.addEventListener('click', function () { if (history.length > 1) history.back(); else location.href = '/'; });
      var t = document.createElement('span'); t.className = 'bz-title';
      bar.insertBefore(t, bar.firstChild); bar.insertBefore(b, bar.firstChild);
    }
    var tries = 0;
    (function wait() {
      var pw = document.getElementById('photoWrap'), ic = document.getElementById('infoContent');
      if (pw && ic) { enhanceProduct(pw, ic); return; }
      if (++tries < 80) setTimeout(wait, 150);
    })();
  }
  function enhanceProduct(pw, ic) {
    /* نقاط الصور */
    if (!document.getElementById('bzDots')) {
      var d = document.createElement('div'); d.id = 'bzDots';
      pw.appendChild(d);
      var box = pw.querySelector('.main-photo-box');
      var cnt = document.getElementById('galleryCount');
      var render = function () {
        var nums = cnt ? (cnt.textContent.match(/\d+/g) || []) : [];
        var cur = 1, tot = 1;
        if (nums.length >= 2) { cur = +nums[0]; tot = +nums[1]; if (cur > tot) { var x = cur; cur = tot; tot = x; } }
        var thumbs = pw.querySelectorAll('.thumb');
        if (thumbs.length) {
          tot = thumbs.length; cur = 1;
          for (var i = 0; i < thumbs.length; i++) if (/active/.test(thumbs[i].className)) cur = i + 1;
        }
        var h = '';
        if (tot > 1) for (var j = 1; j <= tot; j++) h += '<i' + (j === cur ? ' class="on"' : '') + '></i>';
        d.innerHTML = h;
      };
      render();
      try {
        var mo = new MutationObserver(render);
        if (cnt) mo.observe(cnt, { childList: true, characterData: true, subtree: true });
        mo.observe(pw, { attributes: true, subtree: true, attributeFilter: ['class'] });
      } catch (e) {}
      /* سحب الصورة يمينًا/يسارًا */
      if (box) {
        var sx = 0, sy = 0;
        box.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
        box.addEventListener('touchend', function (e) {
          var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && typeof window.galleryMove === 'function') {
            window.galleryMove(dx < 0 ? 1 : -1);
          }
        }, { passive: true });
      }
    }
    /* صف المشاركة + المفضلة */
    if (!document.getElementById('bzShareRow')) {
      var r = document.createElement('div'); r.id = 'bzShareRow';
      r.innerHTML = '<button type="button" class="sh">' + I.share + '<span></span></button><button type="button" class="fav">' + I.heart + '</button>';
      var anchor = ic.querySelector('.stock-note') || ic.querySelector('.price-row') || ic.firstChild;
      if (anchor && anchor.nextSibling) anchor.parentNode.insertBefore(r, anchor.nextSibling); else ic.appendChild(r);
      r.querySelector('.sh').addEventListener('click', function () {
        var url = location.href.split('#')[0], title = document.title;
        if (navigator.share) { navigator.share({ title: title, url: url }).catch(function () {}); return; }
        var done = function () { bzToast(L().copied); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done); else done();
      });
      r.querySelector('.fav').addEventListener('click', function () { toggleFav(slugOf(location.pathname)); syncFavUI(); });
    }
    refresh();
  }

  function refresh() {
    var l = L(), n = document.getElementById('bzNav');
    if (n) {
      var items = n.querySelectorAll('[data-t]');
      for (var i = 0; i < items.length; i++) {
        var key = items[i].getAttribute('data-t');
        var label = key === 'favs' ? l.favs : key === 'search' ? l.search : key === 'menu' ? l.menu : l[key];
        var span = items[i].querySelector('span'); if (span) span.textContent = label || '';
        items[i].setAttribute('aria-label', label || key);
      }
      var c = cartCount(), b = n.querySelector('.bzc');
      if (b) { b.textContent = c ? String(c) : ''; b.setAttribute('data-n', String(c)); }
    }
    var t = document.querySelector('.bz-title'); if (t) t.textContent = l.det;
    var bb = document.querySelector('.bz-back'); if (bb) bb.setAttribute('aria-label', l.back);
    var sh = document.querySelector('#bzShareRow .sh span'); if (sh) sh.textContent = l.share;
    var buys = document.querySelectorAll('.product .buybtn span'); for (var k = 0; k < buys.length; k++) buys[k].textContent = l.buy;
    var bar = document.getElementById('bzBar');
    if (bar) {
      var ti = ['menu', 'chat', 'fav', 'search', 'cats'], tk = ['menu', 'chat', 'favs', 'search', 'cats'];
      for (var q = 0; q < ti.length; q++) bar.querySelector('[data-a="' + ti[q] + '"]').setAttribute('aria-label', l[tk[q]]);
    }
  }

  function start() {
    buildNav();
    if (isHome) { buildBar(); watchGrid(); }
    if (isProduct) buildProductPage();
    refresh();
    try {
      new MutationObserver(refresh).observe(de, { attributes: true, attributeFilter: ['lang'] });
      var ce = document.getElementById('cartCount') || document.getElementById('pcCartCount');
      if (ce) new MutationObserver(refresh).observe(ce, { childList: true, characterData: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
