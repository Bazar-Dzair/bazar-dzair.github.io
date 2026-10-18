/* Bazar Dzair — زر "تواصل معنا" + نافذة محادثة صغيرة (على طريقة ميسنجر)
   - يُحقن تلقائيًا في كل صفحة تحتوي زر الواتساب العائم (.wa-float) ويوضع تحته.
   - الرسالة + بريد الزبون تُحفظ في Firestore (collection: messages) عبر REST،
     وتظهر في لوحة التحكم > الرسائل. لا تحتاج أي Worker.
   - ثنائي اللغة (عربي / فرنسي) حسب bazarLang في localStorage. */
(function () {
  "use strict";
  if (window.__bazarContactWidget) return;
  window.__bazarContactWidget = true;

  var PROJECT = "bazar-dzair-33816";
  var API_KEY = "AIzaSyBWdA_QIy_2gOBl-bP1S1tLaGIqaZjpar8";
  var DOC_ROOT = "projects/" + PROJECT + "/databases/(default)/documents";
  var COMMIT_URL = "https://firestore.googleapis.com/v1/" + DOC_ROOT + ":commit?key=" + API_KEY;

  var lang = "ar";
  try { if (localStorage.getItem("bazarLang") === "fr") lang = "fr"; } catch (e) {}
  var T = {
    ar: {
      btn: "تواصل معنا", title: "Bazar Dzair", sub: "عادةً نرد خلال وقت قصير",
      hello: "السلام عليكم 👋 كيف نقدر نساعدك؟ اكتب سؤالك وسنرد عليك على بريدك الإلكتروني.",
      name: "اسمك (اختياري)", email: "بريدك الإلكتروني (Gmail)", msg: "اكتب رسالتك...",
      send: "إرسال", sending: "جارٍ الإرسال...", close: "إغلاق",
      ok: "وصلتنا رسالتك ✅ سنرد عليك قريبًا على بريدك: ",
      errEmail: "اكتب بريدًا إلكترونيًا صحيحًا مثل name@gmail.com",
      errMsg: "اكتب رسالتك أولًا", errWait: "انتظر قليلًا قبل إرسال رسالة أخرى",
      errNet: "تعذر الإرسال، حاول مرة أخرى أو راسلنا عبر واتساب", errLimit: "وصلت الحد اليومي للرسائل، راسلنا عبر واتساب"
    },
    fr: {
      btn: "Contactez-nous", title: "Bazar Dzair", sub: "Nous répondons généralement très vite",
      hello: "Bonjour 👋 Comment pouvons-nous vous aider ? Écrivez votre question, nous vous répondrons par e-mail.",
      name: "Votre nom (facultatif)", email: "Votre e-mail (Gmail)", msg: "Écrivez votre message...",
      send: "Envoyer", sending: "Envoi...", close: "Fermer",
      ok: "Message reçu ✅ Nous vous répondrons bientôt à : ",
      errEmail: "Saisissez un e-mail valide, ex. nom@gmail.com",
      errMsg: "Écrivez d'abord votre message", errWait: "Patientez un instant avant d'envoyer un autre message",
      errNet: "Envoi impossible, réessayez ou écrivez-nous sur WhatsApp", errLimit: "Limite quotidienne atteinte, écrivez-nous sur WhatsApp"
    }
  }[lang];
  var dir = lang === "fr" ? "ltr" : "rtl";

  var css = [
    /* زر الواتساب يرتفع ليصبح زر تواصل معنا تحته */
    ".wa-float{bottom:76px!important}",
    ".bcw-btn{position:fixed;left:14px;bottom:20px;z-index:46;height:48px;padding:0 18px 0 14px;border:0;border-radius:26px;background:#061e3d;color:#fff;font:700 14px/1 Tahoma,Arial,sans-serif;display:flex;align-items:center;gap:8px;cursor:pointer;box-shadow:0 8px 20px rgba(0,0,0,.25);direction:" + dir + "}",
    ".bcw-btn svg{width:22px;height:22px;flex:none}",
    ".bcw-btn:hover{background:#0b2c56}",
    ".bcw-btn:focus-visible,.bcw-x:focus-visible,.bcw-send:focus-visible{outline:3px solid #ff8a4a;outline-offset:2px}",
    ".bcw-panel{position:fixed;left:14px;bottom:80px;z-index:60;width:340px;max-width:calc(100vw - 28px);height:480px;max-height:calc(100vh - 100px);background:#fff;border-radius:18px;box-shadow:0 14px 44px rgba(7,29,59,.32);display:none;flex-direction:column;overflow:hidden;font-family:Tahoma,Arial,sans-serif;direction:" + dir + "}",
    ".bcw-panel.open{display:flex;animation:bcwIn .18s ease-out}",
    "@keyframes bcwIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}",
    ".bcw-head{background:linear-gradient(135deg,#061e3d,#0b2c56);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:11px}",
    ".bcw-av{width:44px;height:44px;border-radius:50%;background:#fff url(/icons/chat-avatar.png) center/cover no-repeat;flex:none;position:relative;box-shadow:0 0 0 2px rgba(255,255,255,.35)}",
    ".bcw-av:after{content:'';position:absolute;bottom:0;inset-inline-end:0;width:11px;height:11px;border-radius:50%;background:#31d158;border:2px solid #0b2c56}",
    ".bcw-ht{flex:1;min-width:0}.bcw-ht b{display:block;font-size:15px}.bcw-ht span{font-size:12px;opacity:.85}",
    ".bcw-x{border:0;background:rgba(255,255,255,.14);color:#fff;width:32px;height:32px;border-radius:50%;font-size:20px;line-height:1;cursor:pointer}",
    ".bcw-x:hover{background:rgba(255,255,255,.26)}",
    ".bcw-body{flex:1;overflow-y:auto;padding:14px;background:#f4f6fa;display:flex;flex-direction:column;gap:9px}",
    ".bcw-m{max-width:84%;padding:9px 13px;border-radius:18px;font-size:14px;line-height:1.7;word-break:break-word;white-space:pre-wrap}",
    ".bcw-m.them{background:#fff;color:#071d3b;align-self:flex-start;border-end-start-radius:5px;box-shadow:0 1px 2px rgba(0,0,0,.08)}",
    ".bcw-m.me{background:#cc4400;color:#fff;align-self:flex-end;border-end-end-radius:5px}",
    ".bcw-form{padding:10px 12px 12px;border-top:1px solid #e5e9ef;background:#fff;display:flex;flex-direction:column;gap:7px}",
    ".bcw-form input,.bcw-form textarea{width:100%;border:1px solid #d5dbe5;border-radius:12px;padding:9px 12px;font:14px Tahoma,Arial,sans-serif;color:#071d3b;background:#f7f8fb;direction:" + dir + "}",
    ".bcw-form textarea{resize:none;height:56px}",
    ".bcw-form input:focus,.bcw-form textarea:focus{outline:2px solid #0b2c56;background:#fff}",
    ".bcw-row{display:flex;gap:7px;align-items:flex-end}.bcw-row textarea{flex:1}",
    ".bcw-send{border:0;border-radius:12px;background:#cc4400;color:#fff;font:700 14px Tahoma,Arial,sans-serif;padding:0 16px;height:44px;cursor:pointer;flex:none}",
    ".bcw-send:disabled{opacity:.6;cursor:default}",
    ".bcw-err{color:#b3261e;font-size:12.5px;min-height:0}",
    ".bcw-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0}",
    ".bcw-m.them{position:relative}",
    "@media(max-width:480px){.bcw-panel{left:8px;right:8px;bottom:8px;width:auto;max-width:none;height:calc(100vh - 16px);max-height:560px}.bcw-btn{padding:0 14px 0 11px;font-size:13px}}"
  ].join("");

  var ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.04 2 11.03c0 2.84 1.45 5.37 3.72 7.03V22l3.4-1.87c.9.25 1.86.38 2.88.38 5.52 0 10-4.04 10-9.03S17.52 2 12 2zm1.1 12.15-2.55-2.72-4.98 2.72 5.48-5.82 2.61 2.72 4.92-2.72-5.48 5.82z"/></svg>';

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function rid() {
    var a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", s = "", i;
    var buf = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(20)) : null;
    for (i = 0; i < 20; i++) s += a[(buf ? buf[i] : Math.floor(Math.random() * 256)) % a.length];
    return s;
  }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }

  function init() {
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "bcw-btn"; btn.setAttribute("aria-haspopup", "dialog");
    btn.innerHTML = ICON + "<span>" + esc(T.btn) + "</span>";

    var panel = document.createElement("div");
    panel.className = "bcw-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", T.btn);
    panel.innerHTML =
      '<div class="bcw-head"><div class="bcw-av" role="img" aria-label="Bazar Dzair"></div><div class="bcw-ht"><b>' + esc(T.title) + "</b><span>" + esc(T.sub) +
      '</span></div><button type="button" class="bcw-x" aria-label="' + esc(T.close) + '">×</button></div>' +
      '<div class="bcw-body" aria-live="polite"><div class="bcw-m them">' + esc(T.hello) + "</div></div>" +
      '<div class="bcw-form"><input class="bcw-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<input type="text" class="bcw-name" maxlength="60" autocomplete="name" placeholder="' + esc(T.name) + '">' +
      '<input type="email" class="bcw-email" maxlength="120" autocomplete="email" inputmode="email" dir="ltr" placeholder="' + esc(T.email) + '">' +
      '<div class="bcw-row"><textarea class="bcw-msg" maxlength="1000" placeholder="' + esc(T.msg) + '"></textarea>' +
      '<button type="button" class="bcw-send">' + esc(T.send) + "</button></div>" +
      '<div class="bcw-err" role="alert"></div></div>';

    document.body.appendChild(btn); document.body.appendChild(panel);

    var body = panel.querySelector(".bcw-body"), nameI = panel.querySelector(".bcw-name"),
      emailI = panel.querySelector(".bcw-email"), msgI = panel.querySelector(".bcw-msg"),
      sendB = panel.querySelector(".bcw-send"), errB = panel.querySelector(".bcw-err"),
      hp = panel.querySelector(".bcw-hp");

    nameI.value = store("bcwName") || ""; emailI.value = store("bcwEmail") || "";

    function open() { panel.classList.add("open"); btn.style.display = "none"; setTimeout(function () { (emailI.value ? msgI : emailI).focus(); }, 60); }
    function close() { panel.classList.remove("open"); btn.style.display = ""; btn.focus(); }
    btn.addEventListener("click", open);
    panel.querySelector(".bcw-x").addEventListener("click", close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("open")) close(); });

    function bubble(text, me) {
      var d = document.createElement("div"); d.className = "bcw-m " + (me ? "me" : "them"); d.textContent = text;
      body.appendChild(d); body.scrollTop = body.scrollHeight;
    }
    function fail(t) { errB.textContent = t; }

    function send() {
      fail("");
      var email = emailI.value.trim(), msg = msgI.value.trim(), name = nameI.value.trim();
      if (hp.value) return; /* بوت */
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) { fail(T.errEmail); emailI.focus(); return; }
      if (msg.length < 2) { fail(T.errMsg); msgI.focus(); return; }
      var now = Date.now(), last = +store("bcwLast") || 0;
      if (now - last < 20000) { fail(T.errWait); return; }
      var day = new Date().toISOString().slice(0, 10), cnt = (store("bcwDay") || "").split("|");
      var n = cnt[0] === day ? (+cnt[1] || 0) : 0;
      if (n >= 8) { fail(T.errLimit); return; }

      sendB.disabled = true; sendB.textContent = T.sending;
      var id = rid();
      var fields = {
        email: { stringValue: email }, message: { stringValue: msg.slice(0, 1000) },
        page: { stringValue: (location.pathname || "/").slice(0, 200) }, lang: { stringValue: lang },
        status: { stringValue: "new" }
      };
      if (name) fields.name = { stringValue: name.slice(0, 60) };
      fetch(COMMIT_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ writes: [{
          update: { name: DOC_ROOT + "/messages/" + id, fields: fields },
          updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }],
          currentDocument: { exists: false }
        }] })
      }).then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        bubble(msg, true); bubble(T.ok + email, false);
        msgI.value = ""; store("bcwEmail", email); store("bcwName", name);
        store("bcwLast", String(Date.now())); store("bcwDay", day + "|" + (n + 1));
      }).catch(function () { fail(T.errNet); })
        .then(function () { sendB.disabled = false; sendB.textContent = T.send; });
    }
    sendB.addEventListener("click", send);
    msgI.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  }

  if (document.body) init(); else document.addEventListener("DOMContentLoaded", init);
})();
