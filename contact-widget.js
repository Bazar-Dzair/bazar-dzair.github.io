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
    ".bcw-panel{position:fixed;left:14px;bottom:80px;z-index:60;width:300px;max-width:calc(100vw - 28px);height:400px;max-height:calc(100vh - 110px);background:#fff;border-radius:18px;box-shadow:0 14px 44px rgba(7,29,59,.32);display:none;flex-direction:column;overflow:hidden;font-family:Tahoma,Arial,sans-serif;direction:" + dir + "}",
    ".bcw-panel.open{display:flex;animation:bcwIn .18s ease-out}",
    "@keyframes bcwIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}",
    ".bcw-head{background:linear-gradient(135deg,#061e3d,#0b2c56);color:#fff;padding:10px 12px;display:flex;align-items:center;gap:11px}",
    ".bcw-av{width:38px;height:38px;border-radius:50%;background:#fff url('data:image/png;base64,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') center/cover no-repeat;flex:none;position:relative;box-shadow:0 0 0 2px rgba(255,255,255,.35)}",
    ".bcw-av:after{content:'';position:absolute;bottom:0;inset-inline-end:0;width:11px;height:11px;border-radius:50%;background:#31d158;border:2px solid #0b2c56}",
    ".bcw-ht{flex:1;min-width:0}.bcw-ht b{display:block;font-size:14px}.bcw-ht span{font-size:11px;opacity:.85}",
    ".bcw-x{border:0;background:rgba(255,255,255,.14);color:#fff;width:28px;height:28px;border-radius:50%;font-size:20px;line-height:1;cursor:pointer}",
    ".bcw-x:hover{background:rgba(255,255,255,.26)}",
    ".bcw-body{flex:1;overflow-y:auto;padding:10px;background:#f4f6fa;display:flex;flex-direction:column;gap:9px}",
    ".bcw-m{max-width:84%;padding:7px 11px;border-radius:16px;font-size:13px;line-height:1.6;word-break:break-word;white-space:pre-wrap}",
    ".bcw-m.them{background:#fff;color:#071d3b;align-self:flex-start;border-end-start-radius:5px;box-shadow:0 1px 2px rgba(0,0,0,.08)}",
    ".bcw-m.me{background:#cc4400;color:#fff;align-self:flex-end;border-end-end-radius:5px}",
    ".bcw-form{padding:8px 10px 10px;border-top:1px solid #e5e9ef;background:#fff;display:flex;flex-direction:column;gap:7px}",
    ".bcw-form input,.bcw-form textarea{width:100%;border:1px solid #d5dbe5;border-radius:12px;padding:7px 11px;font:13px Tahoma,Arial,sans-serif;color:#071d3b;background:#f7f8fb;direction:" + dir + "}",
    ".bcw-form textarea{resize:none;height:44px}",
    ".bcw-form input:focus,.bcw-form textarea:focus{outline:2px solid #0b2c56;background:#fff}",
    ".bcw-row{display:flex;gap:7px;align-items:flex-end}.bcw-row textarea{flex:1}",
    ".bcw-send{border:0;border-radius:12px;background:#cc4400;color:#fff;font:700 14px Tahoma,Arial,sans-serif;padding:0 14px;height:40px;cursor:pointer;flex:none}",
    ".bcw-send:disabled{opacity:.6;cursor:default}",
    ".bcw-err{color:#b3261e;font-size:12.5px;min-height:0}",
    ".bcw-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0}",
    ".bcw-m.them{position:relative}",
    "@media(max-width:480px){.bcw-panel{left:14px;bottom:14px;width:min(300px,calc(100vw - 28px));height:min(400px,calc(100vh - 28px))}.bcw-btn{padding:0 14px 0 11px;font-size:13px}}"
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
