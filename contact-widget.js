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
    ".bcw-av{width:44px;height:44px;border-radius:50%;background:#fff url('data:image/png;base64,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') center/cover no-repeat;flex:none;position:relative;box-shadow:0 0 0 2px rgba(255,255,255,.35)}",
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
