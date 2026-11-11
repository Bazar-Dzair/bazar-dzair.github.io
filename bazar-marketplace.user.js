// ==UserScript==
// @name         Bazar Dzair - تعبئة Marketplace
// @namespace    bazar-dzair
// @version      1.0
// @description  يملأ العنوان والسعر والوصف تلقائياً في إعلان Marketplace من لوحة تحكم Bazar Dzair
// @match        https://*.facebook.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// ==/UserScript==
(function () {
  "use strict";
  var KEY = "bdmp_data";
  try {
    var m = location.hash.match(/bdmp=([^&]+)/);
    if (m) {
      var json = decodeURIComponent(escape(atob(decodeURIComponent(m[1]))));
      GM_setValue(KEY, JSON.stringify({ t: Date.now(), d: JSON.parse(json) }));
      history.replaceState(null, "", location.pathname + location.search);
    }
  } catch (e) {}

  function load() {
    try {
      var raw = GM_getValue(KEY, "");
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (Date.now() - o.t > 15 * 60 * 1000) { GM_deleteValue(KEY); return null; }
      return o.d;
    } catch (e) { return null; }
  }
  function setVal(el, v) {
    var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function find(keys, tag) {
    return Array.prototype.slice.call(document.querySelectorAll(tag)).find(function (e) {
      var lab = e.closest("label");
      var l = ((e.getAttribute("aria-label") || "") + " " + (lab ? lab.innerText : "")).toLowerCase();
      return keys.some(function (k) { return l.indexOf(k) > -1; });
    });
  }
  function banner(text) {
    var b = document.getElementById("bdmp-banner");
    if (!b) {
      b = document.createElement("div");
      b.id = "bdmp-banner";
      b.style.cssText = "position:fixed;z-index:2147483647;bottom:14px;left:50%;transform:translateX(-50%);background:#182536;color:#fff;padding:10px 16px;border-radius:12px;font:14px sans-serif;direction:rtl;box-shadow:0 6px 24px rgba(0,0,0,.3)";
      document.documentElement.appendChild(b);
    }
    b.textContent = text;
    return b;
  }

  var done = {};
  var started = Date.now();
  var timer = setInterval(function () {
    if (Date.now() - started > 90000) { clearInterval(timer); return; }
    if (location.pathname.indexOf("/marketplace/create") === -1) return;
    var d = load();
    if (!d) { clearInterval(timer); return; }
    var rows = [
      ["title", ["title", "العنوان", "titre"], "input", d.title],
      ["price", ["price", "السعر", "prix"], "input", d.price],
      ["description", ["description", "الوصف"], "textarea", d.description]
    ];
    rows.forEach(function (r) {
      if (done[r[0]]) return;
      var el = find(r[1], r[2]);
      if (el) { el.focus(); setVal(el, r[3]); done[r[0]] = true; }
    });
    var n = Object.keys(done).length;
    if (n === 3) {
      clearInterval(timer);
      GM_deleteValue(KEY);
      var b = banner("تمت تعبئة الحقول ✅ أضف الصورة ثم انشر");
      setTimeout(function () { b.remove(); }, 8000);
    }
  }, 700);
})();
