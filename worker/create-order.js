// =====================================================================
// worker.js — الكود الكامل للـ Cloudflare Worker
// (noisy-lake-ace8.a-bazar-dzair-pro.workers.dev)
//
// ✅ هذا الملف يحتوي نقطة الدخول export default { fetch } — وهو ما كان
// ناقصًا. ضع هذا الملف بالكامل في الـ Worker (بدّل كل المحتوى القديم به)
// ثم Deploy.
//
// الأسرار المطلوبة (Settings > Variables على Cloudflare، أو
// npx wrangler secret put <NAME>):
//   FIREBASE_PROJECT_ID    = bazar-dzair-33816
//   FIREBASE_CLIENT_EMAIL  = من ملف Service Account JSON
//   FIREBASE_PRIVATE_KEY   = من نفس الملف (private_key كاملاً بأسطره \n)
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID
// =====================================================================

const ALLOWED_ORIGINS = ["https://bazar-dzair.github.io"];

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

// ---------------------------------------------------------------------
// ✅ نقطة الدخول — هذا هو الجزء الذي كان ناقصًا في النسخة السابقة
// ---------------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/create-order") {
      return handleCreateOrder(request, env);
    }

    // مسار احتياطي بسيط لو احتجت إرسال تليغرام يدويًا لاحقًا
    if (url.pathname === "/send-telegram" && request.method === "POST") {
      const cors = corsHeaders(request);
      try {
        const body = await request.json();
        await sendTelegram(env, body || {});
        return json({ ok: true }, 200, cors);
      } catch (e) {
        return json({ error: "فشل إرسال الإشعار" }, 502, cors);
      }
    }

    if (url.pathname === "/send-telegram" && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    return new Response("Not found", { status: 404 });
  },
};

// ---------------------------------------------------------------------
async function handleCreateOrder(request, env) {
  const cors = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

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
    product,
    productId,
    quantity,
    price,
    shipping,
    deliveryType,
    shippingCompany,
    total,
  } = body || {};

  const validationError = validateOrder({
    customerName,
    customerPhone,
    wilaya,
    address,
    product,
    productId,
    quantity,
    price,
    shipping,
    total,
  });
  if (validationError) {
    return json({ error: validationError }, 400, cors);
  }

  let accessToken;
  try {
    accessToken = await getGoogleAccessToken(env);
  } catch (e) {
    return json({ error: "تعذّر الاتصال بالخادم" }, 502, cors);
  }

  let phoneBlocked;
  try {
    phoneBlocked = await isPhoneBlocked(env, accessToken, customerPhone);
  } catch (e) {
    return json({ error: "تعذّر التحقق من رقم الهاتف" }, 502, cors);
  }
  if (phoneBlocked) {
    return json({ error: "لا يمكن تسجيل الطلب بهذا الرقم" }, 403, cors);
  }

  let realPrice;
  try {
    realPrice = await getProductPrice(env, productId);
  } catch {
    return json({ error: "تعذّر التحقق من المنتج" }, 502, cors);
  }
  if (realPrice === null || Math.abs(realPrice - Number(price)) > 0.001) {
    return json({ error: "السعر لا يطابق المنتج الحقيقي" }, 400, cors);
  }
  const shippingValue = Number(shipping || 0);
  const totalValue = Number(total);
  const expectedTotal = Number(price) * Number(quantity) + shippingValue;

  if (
    !Number.isFinite(shippingValue) ||
    shippingValue < 0 ||
    !Number.isFinite(totalValue) ||
    !Number.isFinite(expectedTotal) ||
    Math.abs(expectedTotal - totalValue) > 0.01
  ) {
    return json({ error: "المجموع غير صحيح" }, 400, cors);
  }

  let doc;
  try {
    doc = await createOrderDoc(env, accessToken, {
      customerName,
      customerPhone,
      wilaya,
      address,
      product,
      productId,
      quantity: Number(quantity),
      price: Number(price),
      shipping: Number(shipping || 0),
      deliveryType: deliveryType || "",
      shippingCompany: shippingCompany || "",
      total: Number(total),
      status: "جديد",
      createdAt: new Date(),
    });
  } catch (e) {
    return json({ error: "تعذّر حفظ الطلب" }, 502, cors);
  }

  try {
    await sendTelegram(env, {
      customerName,
      customerPhone,
      wilaya,
      address,
      product,
      quantity,
      total,
    });
  } catch (e) {
    console.error("Telegram notify failed:", e);
  }

  const id = doc && doc.name ? doc.name.split("/").pop() : null;
  return json({ ok: true, id }, 200, cors);
}

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

function validateOrder(d) {
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
  if (typeof d.price !== "number" || d.price < 0) return "سعر غير صالح";
  if (typeof d.total !== "number" || d.total < 0) return "مجموع غير صالح";
  if (
    d.shipping !== undefined &&
    d.shipping !== null &&
    (typeof d.shipping !== "number" || !Number.isFinite(d.shipping) || d.shipping < 0)
  )
    return "قيمة شحن غير صالحة";
  return null;
}

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
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
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

async function createOrderDoc(env, accessToken, order) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/orders`;
  const fields = {};
  for (const [k, v] of Object.entries(order)) {
    if (v instanceof Date) fields[k] = { timestampValue: v.toISOString() };
    else if (typeof v === "number")
      fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
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

async function sendTelegram(env, o) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const text =
    `🛒 طلب جديد\n👤 الاسم: ${o.customerName}\n📞 الهاتف: ${o.customerPhone}\n` +
    `📍 الولاية: ${o.wilaya}\n🏠 العنوان: ${o.address}\n📦 المنتج: ${o.product}\n` +
    `🔢 الكمية: ${o.quantity}\n💰 المجموع: ${o.total} دج`;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
}

function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
  });
}
  
