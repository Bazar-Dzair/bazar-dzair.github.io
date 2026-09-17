// =====================================================================
// worker/create-order.js — مسار يُضاف إلى Cloudflare Worker الحالي
// (noisy-lake-ace8.a-bazar-dzair-pro.workers.dev)
//
// ⚠️ هذا الملف NOT مخصص لمجلد الموقع (Pages/GitHub). ضعه في مستودع الـ
// Worker المنفصل الخاص بك، وادمج المسار /create-order مع الراوتر الحالي
// الذي يحتوي بالفعل /send-telegram. لا تضعه داخل مجلد الاستضافة الثابت —
// لو وُضع هناك سيُنشر كملف عام قابل للتحميل (حتى لو أسراره بأمان في env).
//
// ✅ هذه النسخة تصحح ثغرة كانت موجودة فعليًا: firestore.rules يذكر أن
// Turnstile يُتحقق منه في هذا الـ Worker، لكن الكود الفعلي لم يكن يحتوي
// على أي استدعاء siteverify — أي طلب كان يُقبل بدون أي حماية بوتات.
//
// ما يفعله هذا المسار الآن:
//   1) يتحقق فعليًا من Turnstile عبر Cloudflare siteverify — fail-closed
//      (لو السر غير مهيأ في الـ Worker، يُرفض الطلب بدل تجاوز الفحص بصمت).
//   2) يعيد نفس التحقق الموجود في firestore.rules (شكل البيانات، الهاتف، الكمية...)
//      لكل عنصر في الطلب.
//   3) يتحقق أن رقم هاتف الزبون غير موجود في قائمة الأرقام المحظورة
//      (collection blockedPhones يديرها الأدمن من لوحة التحكم).
//   4) يدعم "سلة" فيها أكثر من منتج في نفس الطلب (items[]) — بتحقّق Turnstile
//      واحد فقط للطلب كله (لأن توكن Turnstile أحادي الاستخدام، ولا يمكن
//      استدعاء الـ Worker في حلقة لكل منتج كما كان يحدث سابقًا في السلة).
//      لا يزال الشكل القديم (منتج واحد بدون items[]) مدعومًا لتفادي كسر
//      أي صفحة لم تُحدَّث بعد.
//   5) يجلب السعر الحقيقي لكل منتج من Firestore ويقارنه بالسعر المُرسل.
//   6) يكتب مستند طلب منفصل لكل عنصر في Firestore عبر صلاحيات Service Account
//      (تتجاوز Security Rules تمامًا، وهذا مقصود ومتوقَّع لأي Admin SDK).
//   7) يرسل إشعار Telegram واحد ملخّص لكل عناصر الطلب.
//
// الأسرار المطلوبة (Cloudflare Dashboard > Workers > Settings > Variables,
// أو عبر: npx wrangler secret put <NAME>):
//   FIREBASE_PROJECT_ID    — "bazar-dzair-33816"
//   FIREBASE_CLIENT_EMAIL  — من ملف Service Account JSON (client_email)
//   FIREBASE_PRIVATE_KEY   — من نفس الملف (private_key) — الصقه كاملاً بأسطره \n
//   TELEGRAM_BOT_TOKEN     — إن لم يكن معرّفًا مسبقًا في الـ Worker الحالي
//   TELEGRAM_CHAT_ID       — إن لم يكن معرّفًا مسبقًا في الـ Worker الحالي
//   TURNSTILE_SECRET_KEY   — Cloudflare Dashboard > Turnstile > الودجة > Secret Key
//                            (وليس Site Key، الذي هو عام ويوضع في HTML)
//
// كيفية الحصول على Service Account JSON:
//   Firebase Console > ⚙️ Project Settings > Service Accounts >
//   Generate new private key. لا تضع هذا الملف في أي مستودع Git إطلاقًا —
//   انسخ قيمه فقط كأسرار Worker.
// =====================================================================

// الدومين الوحيد المسموح له بإرسال طلبات إلى هذا الـ Worker.
// إذا أضفت دومينًا مخصصًا (custom domain) للموقع لاحقًا، أضفه هنا أيضًا.
const ALLOWED_ORIGINS = ["https://bazar-dzair.github.io"];

// أقصى عدد عناصر (منتجات) مقبول في طلب واحد — يمنع سلة ضخمة مفتعلة.
const MAX_ITEMS = 50;

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export async function handleCreateOrder(request, env) {
  const cors = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

  // ملاحظة: رأس CORS وحده لا يمنع سوى المتصفح من قراءة الرد؛ لمنع أي جهة
  // خارجية (سكربت، سيرفر آخر...) من استدعاء هذا المسار مباشرة، نرفض أي
  // طلب يحمل رأس Origin غير مسموح به صراحةً.
  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: "Origin not allowed" }, 403, cors);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "بيانات غير صالحة" }, 400, cors);
  }

  const {
    customerName,
    customerPhone,
    wilaya,
    address,
    deliveryType,
    shippingCompany,
    total,
    turnstileToken,
  } = body || {};

  // 1) توحيد الشكل: الجديد (items[] لسلة كاملة) أو القديم (منتج واحد بدون items[]).
  //    نُبقي الشكل القديم مدعومًا حتى لا تنكسر أي صفحة لم تُحدَّث بعد للإرسال الجديد.
  let items = Array.isArray(body.items) ? body.items : null;
  if (!items) {
    items = [
      {
        product: body.product,
        productId: body.productId,
        quantity: body.quantity,
        price: body.price,
        shipping: body.shipping,
      },
    ];
  }
  if (items.length === 0 || items.length > MAX_ITEMS) {
    return json({ error: "سلة غير صالحة" }, 400, cors);
  }

  // 2) التحقق من الحقول المشتركة (اسم/هاتف/ولاية/عنوان) + كل عنصر في السلة —
  //    نفس شروط isValidOrder() في firestore.rules، مطبّقة على كل منتج.
  const commonError = validateCommonFields({ customerName, customerPhone, wilaya, address });
  if (commonError) return json({ error: commonError }, 400, cors);

  for (const it of items) {
    const itemError = validateItem(it);
    if (itemError) return json({ error: itemError }, 400, cors);
  }

  // 3) تحقق Turnstile الحقيقي — قبل أي اتصال بـ Firestore أو Google OAuth، لتفادي
  //    استهلاك موارد الخادم في طلبات بوتات لا تحمل توكن صالح أصلاً.
  //    fail-closed: أي عطل في التحقق (بما فيه غياب السر) يعني رفض الطلب، وليس قبوله.
  let turnstileOk;
  try {
    const ip = request.headers.get("CF-Connecting-IP") || undefined;
    turnstileOk = await verifyTurnstile(turnstileToken, env, ip);
  } catch (e) {
    console.error("Turnstile verification error:", e && e.message);
    return json({ error: "تعذّر التحقق الأمني، حاول لاحقًا" }, 503, cors);
  }
  if (!turnstileOk) {
    return json({ error: "فشل التحقق الأمني (Turnstile)، أعد المحاولة" }, 403, cors);
  }

  // 4) الحصول على توكن Service Account — يُستخدم لفحص الحظر ثم للكتابة لاحقًا
  let accessToken;
  try {
    accessToken = await getGoogleAccessToken(env);
  } catch (e) {
    return json({ error: "تعذّر الاتصال بالخادم" }, 502, cors);
  }

  // 5) رفض الطلب إذا كان رقم الهاتف محظورًا من لوحة تحكم الأدمن
  let phoneBlocked;
  try {
    phoneBlocked = await isPhoneBlocked(env, accessToken, customerPhone);
  } catch (e) {
    return json({ error: "تعذّر التحقق من رقم الهاتف" }, 502, cors);
  }
  if (phoneBlocked) {
    return json({ error: "لا يمكن تسجيل الطلب بهذا الرقم" }, 403, cors);
  }

  // 6) مطابقة السعر الحقيقي لكل منتج — نفس منطق get(...).data.price == d.price
  //    في القواعد، لكن مطبّق على كل عنصر في السلة على حدة.
  const resolvedItems = [];
  let computedTotal = 0;
  for (const it of items) {
    let realPrice;
    try {
      realPrice = await getProductPrice(env, it.productId);
    } catch {
      return json({ error: "تعذّر التحقق من المنتج" }, 502, cors);
    }
    if (realPrice === null || Math.abs(realPrice - Number(it.price)) > 0.001) {
      return json({ error: `السعر لا يطابق المنتج الحقيقي: ${it.product || it.productId}` }, 400, cors);
    }
    const shippingValue = Number(it.shipping || 0);
    if (!Number.isFinite(shippingValue) || shippingValue < 0) {
      return json({ error: "قيمة شحن غير صالحة" }, 400, cors);
    }
    const itemTotal = realPrice * Number(it.quantity) + shippingValue;
    computedTotal += itemTotal;
    resolvedItems.push({ ...it, price: realPrice, shipping: shippingValue, itemTotal });
  }

  // حارس صريح ضد NaN: لو total قيمة غير رقمية (نص، object...) فإن Number(...)
  // تُعطي NaN، و"NaN > 0.01" في JS تُرجع false — أي أن المقارنة كانت يمكن أن
  // تتجاوز الفحص بصمت وتقبل أي مجموع يرسله الزبون. نرفض الطلب صراحةً هنا.
  const totalValue = Number(total);
  if (
    !Number.isFinite(totalValue) ||
    !Number.isFinite(computedTotal) ||
    Math.abs(computedTotal - totalValue) > 0.01
  ) {
    return json({ error: "المجموع غير صحيح" }, 400, cors);
  }

  // 7) الكتابة في Firestore عبر Service Account — مستند طلب مستقل لكل عنصر،
  //    لتوافق تام مع لوحة الأدمن الحالية (orders.html) التي تتوقع منتجًا واحدًا
  //    لكل مستند طلب.
  const ids = [];
  try {
    for (const it of resolvedItems) {
      const doc = await createOrderDoc(env, accessToken, {
        customerName,
        customerPhone,
        wilaya,
        address,
        product: it.product,
        productId: it.productId,
        quantity: Number(it.quantity),
        price: Number(it.price),
        shipping: Number(it.shipping || 0),
        deliveryType: deliveryType || "",
        shippingCompany: shippingCompany || "",
        total: Number(it.itemTotal),
        status: "جديد",
        createdAt: new Date(),
      });
      const id = doc && doc.name ? doc.name.split("/").pop() : null;
      if (id) ids.push(id);
    }
  } catch (e) {
    return json({ error: "تعذّر حفظ الطلب" }, 502, cors);
  }

  // 8) إشعار Telegram واحد ملخّص لكل عناصر الطلب — لا يفشل الطلب لو تعطّل الإشعار
  try {
    await sendTelegram(env, {
      customerName,
      customerPhone,
      wilaya,
      address,
      items: resolvedItems,
      total: totalValue,
    });
  } catch (e) {
    console.error("Telegram notify failed:", e);
  }

  return json({ ok: true, ids }, 200, cors);
}

// ---------------------------------------------------------------------
// تحقق Turnstile عبر Cloudflare siteverify. fail-closed: لو TURNSTILE_SECRET_KEY
// غير معرَّف في env، نرمي خطأ بدل اعتبار الطلب مقبولاً — أي عطل في الإعداد
// يعني رفض كل الطلبات، وليس تعطيل الحماية بصمت.
// ---------------------------------------------------------------------
async function verifyTurnstile(token, env, ip) {
  if (!env.TURNSTILE_SECRET_KEY) {
    throw new Error("TURNSTILE_SECRET_KEY not configured");
  }
  if (!token || typeof token !== "string") return false;

  const formData = new URLSearchParams();
  formData.append("secret", env.TURNSTILE_SECRET_KEY);
  formData.append("response", token);
  if (ip) formData.append("remoteip", ip);

  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });
  if (!resp.ok) throw new Error("siteverify HTTP " + resp.status);
  const data = await resp.json().catch(() => ({ success: false }));
  return data.success === true;
}

// ---------------------------------------------------------------------
// يتحقق هل رقم الهاتف موجود في collection "blockedPhones" (معرّف الوثيقة =
// رقم الهاتف نفسه). القراءة تتم بصلاحيات Service Account حتى لو كانت
// firestore.rules تمنع القراءة العامة لهذا الـ collection.
// ---------------------------------------------------------------------
async function isPhoneBlocked(env, accessToken, phone) {
  if (!phone || typeof phone !== "string") return false;
  const projectId = env.FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/blockedPhones/${encodeURIComponent(
    phone
  )}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (resp.status === 404) return false;
  if (!resp.ok) throw new Error("blockedPhones lookup failed: " + resp.status);
  return true;
}

// ---------------------------------------------------------------------
// الحقول المشتركة بين كل عناصر الطلب (اسم/هاتف/ولاية/عنوان) — نفس شروط
// isValidOrder() الموجودة في firestore.rules.
// ---------------------------------------------------------------------
function validateCommonFields(d) {
  if (
    typeof d.customerName !== "string" ||
    d.customerName.trim().length === 0 ||
    d.customerName.length >= 100
  )
    return "اسم غير صالح";
  if (
    typeof d.customerPhone !== "string" ||
    !/^0[5-7][0-9]{8}$/.test(d.customerPhone)
  )
    return "رقم هاتف غير صالح";
  if (
    typeof d.wilaya !== "string" ||
    d.wilaya.trim().length === 0 ||
    d.wilaya.length >= 100
  )
    return "ولاية غير صالحة";
  if (
    typeof d.address !== "string" ||
    d.address.trim().length === 0 ||
    d.address.length >= 300
  )
    return "عنوان غير صالح";
  return null;
}

// ---------------------------------------------------------------------
// تحقق من عنصر واحد داخل items[] (منتج + كمية + سعر مُرسَل من الواجهة).
// ---------------------------------------------------------------------
function validateItem(d) {
  if (!d || typeof d !== "object") return "عنصر طلب غير صالح";
  if (
    typeof d.product !== "string" ||
    d.product.trim().length === 0 ||
    d.product.length >= 200
  )
    return "اسم منتج غير صالح";
  if (
    typeof d.productId !== "string" ||
    d.productId.trim().length === 0 ||
    d.productId.length >= 200
  )
    return "معرّف منتج غير صالح";
  if (!Number.isInteger(d.quantity) || d.quantity <= 0 || d.quantity > 50)
    return "كمية غير صالحة";
  if (typeof d.price !== "number" || !Number.isFinite(d.price) || d.price < 0)
    return "سعر غير صالح";
  // shipping اختياري، لكن إن أُرسل يجب أن يكون رقمًا غير سالب — منع التلاعب
  // بقيمة الشحن (إرسال نص أو object يُحوَّل إلى NaN ويُفسد فحص المجموع لاحقًا).
  if (
    d.shipping !== undefined &&
    d.shipping !== null &&
    (typeof d.shipping !== "number" || !Number.isFinite(d.shipping) || d.shipping < 0)
  )
    return "قيمة شحن غير صالحة";
  return null;
}

// ---------------------------------------------------------------------
// جلب السعر الحقيقي للمنتج (قراءة عامة، بدون حاجة توثيق — نفس ما تسمح به
// firestore.rules لِـ collection products أصلاً)
// ---------------------------------------------------------------------
async function getProductPrice(env, productId) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/products/${encodeURIComponent(
    productId
  )}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  const p = data.fields && data.fields.price;
  if (!p) return null;
  if ("doubleValue" in p) return Number(p.doubleValue);
  if ("integerValue" in p) return Number(p.integerValue);
  return null;
}

// ---------------------------------------------------------------------
// OAuth2 عبر Service Account (JWT Bearer flow) — يعمل داخل Workers runtime
// بالكامل عبر Web Crypto، بدون الحاجة لـ firebase-admin (غير متوافق مع Workers).
// ---------------------------------------------------------------------
async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const encHeader = base64url(new TextEncoder().encode(JSON.stringify(header)));
  const encClaims = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${encHeader}.${encClaims}`;

  const key = await importPrivateKey(env.FIREBASE_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64url(signature)}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      `grant_type=${encodeURIComponent(
        "urn:ietf:params:oauth:grant-type:jwt-bearer"
      )}&assertion=${jwt}`,
  });
  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error("OAuth token error: " + JSON.stringify(data));
  }
  return data.access_token;
}

async function importPrivateKey(pem) {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) =>
    c.charCodeAt(0)
  );
  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64url(buf) {
  let str = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------
// كتابة الطلب في Firestore عبر REST API (بصلاحيات Service Account)
// ---------------------------------------------------------------------
async function createOrderDoc(env, accessToken, order) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/orders`;
  const fields = {};
  for (const [k, v] of Object.entries(order)) {
    if (v instanceof Date) fields[k] = { timestampValue: v.toISOString() };
    else if (typeof v === "number")
      fields[k] = Number.isInteger(v)
        ? { integerValue: String(v) }
        : { doubleValue: v };
    else fields[k] = { stringValue: String(v ?? "") };
  }
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error("Firestore write error: " + JSON.stringify(data));
  return data;
}

// ---------------------------------------------------------------------
// إشعار Telegram — رسالة واحدة ملخّصة لكل عناصر الطلب (بدل رسالة لكل منتج).
// ---------------------------------------------------------------------
async function sendTelegram(env, o) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const itemsText = o.items
    .map(
      (it) =>
        `  • ${it.product} × ${it.quantity} = ${it.price * it.quantity} دج` +
        (it.shipping ? ` (+ توصيل ${it.shipping} دج)` : "")
    )
    .join("\n");
  const text =
    `🛒 طلب جديد\n👤 الاسم: ${o.customerName}\n📞 الهاتف: ${o.customerPhone}\n` +
    `📍 الولاية: ${o.wilaya}\n🏠 العنوان: ${o.address}\n📦 المنتجات:\n${itemsText}\n` +
    `💰 المجموع الكلي: ${o.total} دج`;
  await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    }
  );
}

function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
  });
}

// ---------------------------------------------------------------------
// دمج مع الراوتر الحالي في worker الرئيسي، مثال:
//
//   import { handleCreateOrder } from "./create-order.js";
//   export default {
//     async fetch(request, env, ctx) {
//       const url = new URL(request.url);
//       if (url.pathname === "/create-order") return handleCreateOrder(request, env);
//       if (url.pathname === "/send-telegram") return handleSendTelegram(request, env); // الموجودة مسبقًا
//       return new Response("Not found", { status: 404 });
//     }
//   };
// ---------------------------------------------------------------------
