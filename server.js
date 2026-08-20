// ============================================================
// Bazar Dzair — Google Search Console (GitHub Pages) Backend
// ------------------------------------------------------------
// الغرض: وضع وسم التحقق "<meta name=google-site-verification>"
// فعليًا داخل <head> في index.html للمستودع المنشور على
// GitHub Pages، ثم الالتزام (commit) ليعيد GitHub النشر تلقائيًا.
//
// الأمان (مهم):
//  - لا يوجد أي توكن GitHub داخل هذا الملف (يُقرأ من env.DB الخاص
//    بالمشروع فقط). الملف يُخدم علنًا مثل باقي الملفات.
//  - جميع المسارات تُقبل فقط للمالك (x-websim-project-owner-id).
//  - التوكن يُخزَّن في env.DB (قاعدة خاصة غير مرئية للعميل) ولا يُعاد
//    أبدًا إلى المتصفح في الردود — فقط آخر 4 أحرف معرّف بشكل وآمن.
//  - يُرفض أي وسم لا يطابق قالب meta للتحقق بدقة صارمة.
//============================================================

export const schema = `
  CREATE TABLE IF NOT EXISTS gsc_cfg (
    id          TEXT PRIMARY KEY,
    token       TEXT NOT NULL DEFAULT '',
    repo        TEXT NOT NULL DEFAULT '',
    branch      TEXT NOT NULL DEFAULT 'main',
    path        TEXT NOT NULL DEFAULT 'index.html',
    site        TEXT NOT NULL DEFAULT '',
    active      INTEGER NOT NULL DEFAULT 0,
    verification TEXT NOT NULL DEFAULT '',
    updated_at  TEXT
  );
  CREATE TABLE IF NOT EXISTS gsc_deploy (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    action     TEXT NOT NULL,
    ok         INTEGER NOT NULL,
    message    TEXT NOT NULL DEFAULT '',
    created_at TEXT
  );
`;

// ---- أدوات ترميز/فك آمنة للملفات من GitHub (Contents API) ----
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: false });
function bytesToB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}
function b64ToStr(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return decoder.decode(out);
}

// ---- استخراج قيمة التحقق من وسم الإدخال (صارم جدًا لرفض HTML خبيث) ----
const SAFE_TOKEN = /^[A-Za-z0-9_-]{6,200}$/;
function extractGsc(input) {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;

  // قبول القيمة المجرّدة فقط.
  if (SAFE_TOKEN.test(raw)) return raw;

  // قبول وسم <meta> كامل وصارم فقط (لا بدائل، لا مسمّيات أخرى).
  const m = raw.match(
    /^<meta\s+name\s*=\s*["']google-site-verification["']\s+content\s*=\s*["']([^"'<>\s]+)["']\s*\/?\s*>$/i
  );
  if (m && SAFE_TOKEN.test(m[1])) return m[1];

  // كل ما عدا ذلك مرفوض: لا script/iframe/img/أحداث/وسوم مخصصة.
  return null;
}

// ---- حقن/إزالة وسم التحقق داخل HTML (بدون تكرار) ----
function GSC_META(content) {
  return '<meta name="google-site-verification" content="' + content + '" />';
}
function injectMetaIntoHtml(html, content) {
  const metaRe = /<meta\s+name=["']google-site-verification["']\s+content=["'][^"'<>]*["']\s*\/?>/gi;
  const cleaned = html.replace(metaRe, "");
  const tag = "\n  " + GSC_META(content) + "\n";
  if (/<\/head>/i.test(cleaned)) {
    return cleaned.replace(/<\/head>/i, tag + "</head>");
  }
  const headOpen = cleaned.match(/<head[^>]*>/i);
  if (headOpen) {
    const h = headOpen[0];
    return cleaned.replace(h, h + tag);
  }
  return tag + "\n" + cleaned;
}
function removeMetaFromHtml(html) {
  const metaRe = /<meta\s+name=["']google-site-verification["']\s+content=["'][^"'<>]*["']\s*\/?>/gi;
  return html.replace(metaRe, "");
}

// ---- ثوابت GitHub ----
const GH = "https://api.github.com";
function ghHeaders(token, extra) {
  const h = {
    Accept: "application/vnd.github+json",
    "User-Agent": "bazar-dzair-dz/edit",
    Authorization: "Bearer " + token,
  };
  Object.assign(h, extra || {});
  return h;
}

// ---- قراءة/كتابة إعداداتنا في env.DB ----
async function getCfg(env) {
  return env.DB.prepare("SELECT * FROM gsc_cfg WHERE id = 'main'").first();
}
async function saveCfg(env, fields) {
  const cur = await getCfg(env);
  const data = {
    repo: (cur && cur.repo) || "",
    branch: (cur && cur.branch) || "main",
    path: (cur && cur.path) || "index.html",
    site: (cur && cur.site) || "",
    active: cur && cur.active ? 1 : 0,
    verification: (cur && cur.verification) || "",
    updated_at: new Date().toISOString(),
  };
  Object.assign(data, fields);
  await env.DB
    .prepare(
      "INSERT INTO gsc_cfg (id, repo, branch, path, site, active, verification, updated_at) " +
        "VALUES ('main', ?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET repo=excluded.repo, branch=excluded.branch, " +
        "path=excluded.path, site=excluded.site, active=excluded.active, verification=excluded.verification, updated_at=excluded.updated_at"
    )
    .bind(
      data.repo,
      data.branch,
      data.path,
      data.site,
      data.active,
      data.verification,
      data.updated_at
    )
    .run();
}
async function logDeploy(env, action, ok, message) {
  await env.DB
    .prepare("INSERT INTO gsc_deploy (action, ok, message, created_at) VALUES (?, ?, ?, ?)")
    .bind(action, ok ? 1 : 0, String(message).slice(0, 2000), new Date().toISOString())
    .run();
}

function deriveSite(repo) {
  const low = String(repo || "").toLowerCase();
  const parts = (low || "").split("/").filter(Boolean);
  const name = parts[parts.length - 1] || "";
  if (/\.github\.io$/.test(name)) return name;
  return "";
}
function publicCfg(cfg) {
  return {
    connected: !!(cfg && cfg.repo && cfg.token),
    repo: (cfg && cfg.repo) || "",
    branch: (cfg && cfg.branch) || "main",
    path: (cfg && cfg.path) || "index.html",
    site: (cfg && cfg.site) || "",
    active: !!(cfg && cfg.active),
    verification: (cfg && cfg.verification) || "",
    token_masked: cfg && cfg.token ? cfg.token.slice(-4) : "",
    updated_at: (cfg && cfg.updated_at) || "",
  };
}

// ---- هل المتصل هو مالك المشروع؟ ----
function isOwner(request) {
  const uid = request.headers.get("x-websim-user-id");
  const owner = request.headers.get("x-websim-project-owner-id");
  return !!(uid && owner && uid === owner);
}

// ---- التحقق من النشر الحي ----
async function checkLive(env, cfg, verification) {
  if (!cfg || !cfg.site) return false;
  const target = "https://" + cfg.site + "/index.html";
  try {
    const res = await fetch(target, { headers: { "User-Agent": "bazar-gsc-check" } });
    if (!res.ok) return false;
    const text = await res.text();
    const want = verification ? String(cfg.verification) : String(verification || cfg.verification || "");
    if (!want) return false;
    return text.indexOf('name="google-site-verification"') !== -1 && text.indexOf('content="' + want + '"') !== -1;
  } catch (e) {
    return false;
  }
}

// ------------------------------------------------------------------
// التفعيل: قراءة index.html من GitHub، حقن الوسم، الـ Commit، الانتظار
// لإعادة النشر، ثم التحقق من الصفحة المنشورة.
// ------------------------------------------------------------------
async function activateGsc(env, verification) {
  const cfg = await getCfg(env);
  const token = cfg && cfg.token ? cfg.token : "";
  const repo = (cfg && cfg.repo) || "";
  if (!token || !repo) {
    return { ok: false, msg: "اربط مستودع GitHub أولًا (خانة «الربط بـ GitHub»).", status: 400 };
  }

  const branch = (cfg && cfg.branch) || "main";
  const path = (cfg && cfg.path) || "index.html";
  const encPath = path.split("/").map(encodeURIComponent).join("/");

  // 1) اقرأ index.html الحالي
  const getRes = await fetch(
    GH + "/repos/" + repo + "/contents/" + encPath + (branch ? "?ref=" + encodeURIComponent(branch) : ""),
    { headers: ghHeaders(token) }
  );
  if (getRes.status === 404) {
    return { ok: false, msg: "غير موجود " + path + " في فرع " + branch + " بمستودع " + repo + ".", status: 400 };
  }
  if (!getRes.ok) {
    const t = await getRes.text();
    return { ok: false, msg: "GitHub فشل في قراءة الملف: " + t, status: 500 };
  }
  const file = await getRes.json();
  const currentHtml = b64ToStr(file.content);
  const newHtml = injectMetaIntoHtml(currentHtml, verification);
  const changed = newHtml !== currentHtml;

  // 2) التزام (commit) — يؤدي إلى إعادة نشر تلقائية على GitHub Pages
  const putRes = await fetch(GH + "/repos/" + repo + "/contents/" + encPath, {
    method: "PUT",
    headers: ghHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      message: changed ? "Bazar: تحديث Google site verification meta" : "Bazar: تأكيد وسم Google site verification (بدون تغيير)",
      content: bytesToB64(encoder.encode(newHtml)),
      sha: file.sha,
      branch: branch,
    }),
  });
  if (!putRes.ok) {
    const pt = await putRes.text();
    await logDeploy(env, "activate", false, "commit failed");
    return { ok: false, msg: "GitHub فشل الـ commit: " + pt, status: 500 };
  }
  await logDeploy(env, "activate", true, "commit ok, redeploying…");

  // 3) حفظ الحالة النشطة (حتى لو كان الوسم موجودًا مسبقًا)
  await saveCfg(env, { active: 1, verification: verification });

  // 4) طلب إعادة بناء لـ GitHub Pages (يتم تلقائيًا عند push عادةً)
  try {
    await fetch(GH + "/repos/" + repo + "/pages/builds", { method: "POST", headers: ghHeaders(token) }).catch(() => {});
  } catch (e) {}

  // 5) انتظار إعادة النشر ثم التحقق من الصفحة المنشورة
  const refreshed = { ...cfg, verification: verification };
  let live = cfg.site ? await checkLive(env, refreshed, verification) : false;
  for (let i = 0; i < 6 && !live; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    live = cfg.site ? await checkLive(env, refreshed, verification) : false;
  }
  if (live) await logDeploy(env, "activate", true, "deployed & verified live");

  return { ok: true, changed, live, msg: live ? "تم نشر كود التحقق بنجاح ✓ (الوسم موجود في الصفحة المنشورة)." : "تم إرسال الـ commit وإعادة النشر. التحقق لن يستغرق سوى بضع دقائق بنشر GitHub Pages." };
}

// ---- تعطيل: إزالة الوسم من المصدر وإعادة النشر ----
async function disableGsc(env) {
  const cfg = await getCfg(env);
  const token = cfg && cfg.token ? cfg.token : "";
  const repo = (cfg && cfg.repo) || "";
  if (!token || !repo) {
    await saveCfg(env, { active: 0, verification: "" });
    return { ok: true, msg: "تم التعطيل محليًا (لا يوجد GitHub مربوط).", changed: false };
  }
  const branch = (cfg && cfg.branch) || "main";
  const path = (cfg && cfg.path) || "index.html";
  const encPath = path.split("/").map(encodeURIComponent).join("/");

  const getRes = await fetch(GH + "/repos/" + repo + "/contents/" + encPath + "?ref=" + encodeURIComponent(branch), {
    headers: ghHeaders(token),
  });
  if (!getRes.ok) {
    await saveCfg(env, { active: 0, verification: "" });
    return { ok: true, msg: "تم التعطيل; لكن تعذر 읽ه من GitHub (" + getRes.status + ").", changed: false };
  }
  const file = await getRes.json();
  const current = b64ToStr(file.content);
  const clean = removeMetaFromHtml(current);
  let changed = clean !== current;
  if (changed) {
    const putRes = await fetch(GH + "/repos/" + repo + "/contents/" + encPath, {
      method: "PUT",
      headers: ghHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        message: "Bazar: remove Google site verification meta",
        content: bytesToB64(encoder.encode(clean)),
        sha: file.sha,
        branch: branch,
      }),
    });
    if (!putRes.ok) {
      await saveCfg(env, { active: 0, verification: "" });
      return { ok: false, msg: "GitHub فشل الـ commit عند الإزالة: " + (await putRes.text()), status: 500 };
    }
  }
  await saveCfg(env, { active: 0, verification: "" });
  await logDeploy(env, "disable", true, "removed");
  return { ok: true, changed, msg: "تمت إزالة وسم التحقق وإعادة النشر." };
}

// ============================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (!p.startsWith("/api/gsc")) return new Response("Not found", { status: 404 });

    // لا نسمح لأحد غير المالك.
    if (!isOwner(request)) {
      return Response.json({ error: "مالك المشروع فقط يمكنه ضبط Google Search Console.", ok: false }, { status: 401 });
    }

    try {
      // الحالة العامة
      if (request.method === "GET" && p === "/api/gsc/status") {
        const cfg = await getCfg(env);
        return Response.json(publicCfg(cfg));
      }

      // الربط بـ GitHub (مرة واحدة) — يقبل التوكن بـ env.DB فقط
      if (request.method === "POST" && p === "/api/gsc/connect") {
        const body = await request.json().catch(() => ({}));
        const token = String(body.token || "").trim();
        const repo = String(body.repo || "").trim();
        if (!token || !repo) {
          return Response.json({ ok: false, msg: "أدخل التوكن واسم المستودع." }, { status: 400 });
        }
        if (!/^[A-Za-z0-9_.-]+\/[\w.-]+$/.test(repo)) {
          return Response.json({ ok: false, msg: "اسم مستودع غير صالح." }, { status: 400 });
        }
        if (!/^[A-Za-z0-9_]+$/.test(token)) {
          return Response.json({ ok: false, msg: "توكن غير صالح." }, { status: 400 });
        }

        // التحقق من صلاحية التوكن مع GitHub قبل الحفظ
        const branch = String(body.branch || "main").trim() || "main";
        const path = String(body.path || "index.html").trim() || "index.html";
        const probe = await fetch(GH + "/repos/" + repo + "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(branch), {
          headers: ghHeaders(token),
        });
        if (probe.status === 404) {
          return Response.json({ ok: false, msg: "المستودع أو الملف غير موجود — تأكد من الاسم والفرع (" + repo + "/" + path + " @ " + branch + ")." }, { status: 400 });
        }
        if (probe.status === 401 || probe.status === 403) {
          return Response.json({ ok: false, msg: "التحقق Fail من GitHub — التوكن غير صالح أو بدون صلاحيات Contents على هذا المستودع." }, { status: 400 });
        }
        if (!probe.ok) {
          return Response.json({ ok: false, msg: "GitHub فشل الفحص: " + probe.status }, { status: 500 });
        }
        const probeJson = await probe.json().catch(() => ({}));
        const file = probeJson; // {name, sha, content}
        const site = String(body.site || "").trim() || deriveSite(repo);
        await saveCfg(env, { repo, branch, path, site, token });
        return Response.json({ ok: true, msg: "تم ربط GitHub بنجاح. أدخل وسم Search Console ثم «حفظ وتفعيل».", connected: true });
      }

      // تفعيل + نشر
      if (request.method === "POST" && p === "/api/gsc/activate") {
        const body = await request.json().catch(() => ({}));
        const verification = extractGsc(body && body.tag);
        if (!verification) {
          return Response.json({ ok: false, msg: "وسم غير صالح. الصق وسم Google الصحيح:\n<meta name=\"google-site-verification\" content=\"XXXXXXXX\">" }, { status: 400 });
        }
        const r = await activateGsc(env, verification);
        return Response.json({ ok: r.ok, msg: r.msg, changed: r.changed }, { status: r.status || 200 });
      }

      // تعطيل + إزالة
      if (request.method === "POST" && p === "/api/gsc/disable") {
        const r = await disableGsc(env);
        return Response.json({ ok: r.ok, msg: r.msg, changed: r.changed }, { status: r.status || 200 });
      }

      // فحص الحالة الحي
      if (request.method === "POST" && p === "/api/gsc/check") {
        const cfg = await getCfg(env);
        if (!cfg || !cfg.site) return Response.json({ ok: false, msg: "لم يُربط مستودع بعد.", active: false });
        const live = await checkLive(env, cfg, cfg.verification);
        return Response.json({ ok: live, active: !!cfg.active, verification: cfg.verification, site: cfg.site, msg: live ? "الوسم الحقيقي ظاهر في الصفحة المنشورة ✓" : "الوسم غير ظاهر بعد في الصفحة المنشورة (قد يكون جاري النشر)." });
      }

      return Response.json({ error: "Not found" }, { status: 404 });
    } catch (e) {
      const message = (e && e.message) || String(e);
      return Response.json({ ok: false, error: message }, { status: 500 });
    }
  },
};