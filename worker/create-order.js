// =====================================================================
// worker/create-order.js — مسار جديد يُضاف إلى Cloudflare Worker الحالي
// (noisy-lake-ace8.a-bazar-dzair-pro.workers.dev)
//
// ⚠️ هذا الملف NOT مخصص لمجلد الموقع (Pages/GitHub). ضعه في مستودع الـ
// Worker المنفصل الخاص بك، وادمج المسار /create-order مع الراوتر الحالي
// الذي يحتوي بالفعل /send-telegram. لا تضعه داخل مجلد الاستضافة الثابت —
// لو وُضع هناك سيُنشر كملف عام قابل للتحميل (حتى لو أسراره بأمان في env).
//
// ما يفعله هذا المسار:
//   1) يعيد نفس التحقق الموجود في firestore.rules (شكل البيانات، الهاتف، الكمية...).
//   2) يتحقق أن رقم هاتف الزبون غير موجود في قائمة الأرقام المحظورة (collection
//      blockedPhones يديرها الأدمن من لوحة التحكم)، وأن عنوان IP الخاص بالزائر غير
//      محظور (collection blockedIps). عنوان IP يقرؤه الـ Worker من رأس
//      CF-Connecting-IP الذي يضعه Cloudflare نفسه — لا يمكن للزبون تزويره — ويُحفظ
//      مع كل طلب (حقول ip / ipKey / country) ليظهر في لوحة التحكم ويُحظر بضغطة زر.
//   3) يجلب السعر الحقيقي للمنتج من Firestore ويقارنه بالسعر المُرسل.
//   4) يكتب الطلب في Firestore بصلاحيات Service Account (تتجاوز Security Rules
//      تمامًا، وهذا مقصود ومتوقَّع لأي Admin SDK / Service Account).
//   5) يرسل إشعار Telegram (التوكن يبقى في env هنا فقط، لا يمر عبر المتصفح أبدًا).
//
// الأسرار المطلوبة (Cloudflare Dashboard > Workers > Settings > Variables,
// أو عبر: npx wrangler secret put <NAME>):
//   FIREBASE_PROJECT_ID    — "bazar-dzair-33816"
//   FIREBASE_CLIENT_EMAIL  — من ملف Service Account JSON (client_email)
//   FIREBASE_PRIVATE_KEY   — من نفس الملف (private_key) — الصقه كاملاً بأسطره \n
//   TELEGRAM_BOT_TOKEN     — إن لم يكن معرّفًا مسبقًا في الـ Worker الحالي
//   TELEGRAM_CHAT_ID       — إن لم يكن معرّفًا مسبقًا في الـ Worker الحالي
//
// كيفية الحصول على Service Account JSON:
//   Firebase Console > ⚙️ Project Settings > Service Accounts >
//   Generate new private key. لا تضع هذا الملف في أي مستودع Git إطلاقًا —
//   انسخ قيمه فقط كأسرار Worker.
// =====================================================================

// الدومين الوحيد المسموح له بإرسال طلبات إلى هذا الـ Worker.
// إذا أضفت دومينًا مخصصًا (custom domain) للموقع لاحقًا، أضفه هنا أيضًا.
const ALLOWED_ORIGINS = ["https://bazar-dzair.github.io"];

// ---------------------------------------------------------------------
// عنوان IP الخاص بالزائر
// ---------------------------------------------------------------------
// ⚠️ لا نأخذ IP من المتصفح ولا من body الطلب ولا من X-Forwarded-For (كلها قابلة
// للتزوير). Cloudflare وحده يضع CF-Connecting-IP، وأي قيمة يرسلها الزائر بنفس
// الاسم تُستبدل تلقائيًا عند عبور الطلب عبر شبكة Cloudflare.
//
// مفتاح الحظر (ipKey) يُستعمل كمعرّف وثيقة في collection "blockedIps":
//   • IPv4  → العنوان نفسه، مثال: 41.111.22.33
//   • IPv6  → أول 64 بت فقط (/64) على شكل v6-2001-db8-1-2، لأن أي مشترك IPv6
//     يملك عادةً /64 كاملة ويقدر يغيّر آخر 64 بت متى شاء؛ حظر العنوان الكامل
//     وحده لا يفيد. (نفس دالة التطبيع موجودة في admin.html — يجب أن تبقى متطابقة.)
function parseIpv6(ip) {
  ip = ip.split("%")[0];
  const m = ip.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (m) {
    const p = m[2].split(".").map(Number);
    if (p.some((n) => n > 255)) return null;
    ip = m[1] + ((p[0] << 8) | p[1]).toString(16) + ":" + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups;
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const out = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

function normalizeIp(raw) {
  if (!raw || typeof raw !== "string") return null;
  const ip = raw.trim().toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.some((n) => n > 255)) return null;
    const v4 = parts.join(".");
    return { raw: v4, key: v4, display: v4 };
  }
  if (ip.includes(":")) {
    const g = parseIpv6(ip);
    if (!g) return null;
    // ::ffff:a.b.c.d (IPv4 داخل IPv6) → نعامله كـ IPv4 عادي
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
      const v4 = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join(".");
      return { raw: v4, key: v4, display: v4 };
    }
    const prefix = g.slice(0, 4).map((x) => x.toString(16));
    return { raw: ip, key: "v6-" + prefix.join("-"), display: prefix.join(":") + "::/64" };
  }
  return null;
}

function getClientIp(request) {
  return normalizeIp(request.headers.get("CF-Connecting-IP"));
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

  // فحص إعداد الـ Worker: لو نقص أي سر (Secret) نرد بوضوح بدل فشل غامض. أسماء الأسرار
  // ليست سرًّا (مكتوبة في هذا الملف) ولا تُكشف قيمها أبدًا.
  const missing = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"].filter(
    (k) => !env[k]
  );
  if (missing.length) {
    console.error("Missing Worker secrets:", missing.join(", "));
    return json({ error: "إعداد الخادم ناقص", code: "config_missing", detail: missing.join(", ") }, 500, cors);
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

  // 1) نفس شروط isValidOrder() في firestore.rules، بالضبط
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
  }); // ← shipping أصبحت الآن جزءًا من التحقق الفعلي داخل validateOrder()
  if (validationError) {
    return json({ error: validationError }, 400, cors);
  }

  // تنظيف الحقول النصية: isValidOrder/validateOrder يرفض القيم الفارغة بعد
  // trim()، لكن دون هذا السطر كانت القيمة الأصلية (بمسافات محتملة في البداية
  // أو النهاية) هي ما يُحفظ فعليًا في Firestore ويُرسل إلى Telegram — تحقق
  // ناقص التطبيق. نطبّق trim() فعليًا على كل الحقول النصية بعد نجاح التحقق.
  const customerNameClean = customerName.trim();
  const wilayaClean = wilaya.trim();
  const addressClean = address.trim();
  const productClean = product.trim();
  const productIdClean = productId.trim();

  // 2) عنوان IP الحقيقي للزائر (يضعه Cloudflare — لا يمكن تزويره من المتصفح)
  const clientIp = getClientIp(request);

  // 3) الحصول على توكن Service Account مبكرًا — يُستخدم لفحص الحظر ثم للكتابة لاحقًا
  let accessToken;
  try {
    accessToken = await getGoogleAccessToken(env);
  } catch (e) {
    console.error("Google auth failed:", e);
    return json({ error: "تعذّر الاتصال بالخادم", code: "auth_failed", detail: errDetail(e) }, 502, cors);
  }

  // 4) رفض الطلب إذا كان عنوان IP أو رقم الهاتف محظورًا من لوحة تحكم الأدمن.
  //    الفحصان يجريان بالتوازي؛ وأي فشل في القراءة يرفض الطلب (fail-closed) بدل أن
  //    يمرّره، حتى لا يستغل مزعج عطلًا مؤقتًا لتجاوز الحظر.
  let ipBlocked = false;
  let phoneBlocked = false;
  try {
    [ipBlocked, phoneBlocked] = await Promise.all([
      clientIp ? isIpBlocked(env, accessToken, clientIp.key) : false,
      isPhoneBlocked(env, accessToken, customerPhone),
    ]);
  } catch (e) {
    console.error("Block-list check failed:", e);
    return json({ error: "تعذّر التحقق من الطلب", code: "blocklist_check_failed", detail: errDetail(e) }, 502, cors);
  }
  if (ipBlocked) {
    // رسالة تتيح لزبون حقيقي (مثلاً يشارك نفس IP مع مزعج عبر شبكة الهاتف) أن يتواصل معك.
    return json(
      {
        error: "تعذّر تسجيل الطلب. إن كنت زبونًا حقيقيًا تواصل معنا هاتفيًا لإتمام طلبك.",
        code: "ip_blocked",
      },
      403,
      cors
    );
  }
  if (phoneBlocked) {
    // نفس رسالة حظر الـ IP عمدًا: لا نكشف للمزعج أي شرط بالضبط منعه.
    return json(
      {
        error: "تعذّر تسجيل الطلب. إن كنت زبونًا حقيقيًا تواصل معنا هاتفيًا لإتمام طلبك.",
        code: "phone_blocked",
      },
      403,
      cors
    );
  }

  // 5) مطابقة السعر الحقيقي — نفس منطق get(...).data.price == d.price في القواعد
  let realPrice;
  try {
    realPrice = await getProductPrice(env, productIdClean);
  } catch (e) {
    console.error("Product lookup failed:", e);
    return json({ error: "تعذّر التحقق من المنتج", code: "product_check_failed", detail: errDetail(e) }, 502, cors);
  }
  if (realPrice === null || Math.abs(realPrice - Number(price)) > 0.001) {
    return json({ error: "السعر لا يطابق المنتج الحقيقي" }, 400, cors);
  }
  const shippingValue = Number(shipping || 0);
  const totalValue = Number(total);
  const expectedTotal = Number(price) * Number(quantity) + shippingValue;

  // حارس صريح ضد NaN: لو shipping أو total قيمة غير رقمية (نص، object...)
  // فإن Number(...) تُعطي NaN، و"NaN > 0.01" في JS تُرجع false — أي أن
  // المقارنة أدناه كانت تتجاوز الفحص بصمت وتقبل أي مجموع يرسله الزبون.
  // نرفض الطلب صراحةً في هذه الحالة بدل الاعتماد على المقارنة وحدها.
  if (
    !Number.isFinite(shippingValue) ||
    shippingValue < 0 ||
    !Number.isFinite(totalValue) ||
    !Number.isFinite(expectedTotal) ||
    Math.abs(expectedTotal - totalValue) > 0.01
  ) {
    return json({ error: "المجموع غير صحيح" }, 400, cors);
  }

  // 6) الكتابة في Firestore عبر Service Account
  let doc;
  try {
    doc = await createOrderDoc(env, accessToken, {
      customerName: customerNameClean,
      customerPhone,
      wilaya: wilayaClean,
      address: addressClean,
      product: productClean,
      productId: productIdClean,
      quantity: Number(quantity),
      price: Number(price),
      shipping: Number(shipping || 0),
      deliveryType: deliveryType || "",
      shippingCompany: shippingCompany || "",
      total: Number(total),
      status: "جديد",
      createdAt: new Date(),
      // بيانات الزائر (تظهر في لوحة التحكم لتحظر IP أي طلب وهمي بضغطة زر)
      ip: clientIp ? clientIp.raw : "",
      ipKey: clientIp ? clientIp.key : "",
      country: (request.cf && request.cf.country) || "",
    });
  } catch (e) {
    console.error("Order write failed:", e);
    return json({ error: "تعذّر حفظ الطلب", code: "firestore_write", detail: errDetail(e) }, 502, cors);
  }

  // 7) إشعار Telegram — لا يفشل الطلب لو تعطّل الإشعار
  try {
    await sendTelegram(env, {
      customerName: customerNameClean,
      customerPhone,
      wilaya: wilayaClean,
      address: addressClean,
      product: productClean,
      quantity,
      total,
      ip: clientIp ? clientIp.display : "",
      country: (request.cf && request.cf.country) || "",
    });
  } catch (e) {
    console.error("Telegram notify failed:", e);
  }

  const id = doc && doc.name ? doc.name.split("/").pop() : null;
  return json({ ok: true, id }, 200, cors);
}

// ---------------------------------------------------------------------
// يتحقق هل رقم الهاتف موجود في collection "blockedPhones" (معرّف الوثيقة =
// رقم الهاتف نفسه). القراءة تتم بصلاحيات Service Account حتى لو كانت
// firestore.rules تمنع القراءة العامة لهذا الـ collection.
// ---------------------------------------------------------------------
async function isPhoneBlocked(env, accessToken, phone) {
  if (!phone || typeof phone !== "string") return false;
  return docExists(env, accessToken, "blockedPhones", phone);
}

// ---------------------------------------------------------------------
// يتحقق هل عنوان IP (بعد التطبيع → ipKey) موجود في collection "blockedIps"
// (معرّف الوثيقة = ipKey). نفس صلاحيات Service Account أعلاه.
// ---------------------------------------------------------------------
async function isIpBlocked(env, accessToken, ipKey) {
  if (!ipKey || typeof ipKey !== "string") return false;
  return docExists(env, accessToken, "blockedIps", ipKey);
}

async function docExists(env, accessToken, collectionName, id) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}/${encodeURIComponent(
    id
  )}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (resp.status === 404) return false;
  if (!resp.ok) throw new Error(collectionName + " lookup failed: " + resp.status);
  return true;
}

// ---------------------------------------------------------------------
// نفس شروط isValidOrder() الموجودة في firestore.rules
// ---------------------------------------------------------------------
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
  if (
    !Number.isInteger(d.quantity) ||
    d.quantity <= 0 ||
    d.quantity > 50
  )
    return "كمية غير صالحة";
  if (typeof d.price !== "number" || d.price < 0) return "سعر غير صالح";
  if (typeof d.total !== "number" || d.total < 0) return "مجموع غير صالح";
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
// توكن Service Account صالح ساعة كاملة؛ نحتفظ به بين الطلبات داخل نفس Isolate بدل
// توقيع JWT وطلب OAuth جديد مع كل طلب (كل طلب زبون الآن يفحص الحظر أيضًا، وأي
// مزعج يرسل مئات الطلبات كان سيكلّف مئات الجولات نحو Google بلا داعٍ).
let cachedToken = null; // { value, expiresAt(ms) }

async function getGoogleAccessToken(env) {
  if (cachedToken && cachedToken.expiresAt - 60000 > Date.now()) {
    return cachedToken.value;
  }
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
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  };
  return data.access_token;
}

async function importPrivateKey(pem) {
  // المفتاح يُنسخ غالبًا من ملف JSON بأسطره على شكل \n نصية (backslash + n) أو بين علامتي
  // اقتباس؛ نحوّلها إلى أسطر حقيقية قبل فك الترميز، وإلا يفشل atob() ويتعطل كل طلب.
  const pemContents = String(pem)
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n")
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
// إشعار Telegram — ادمج هذا مع الدالة الموجودة لديك مسبقًا في /send-telegram
// إن كانت موجودة، لتفادي التكرار.
// ---------------------------------------------------------------------
async function sendTelegram(env, o) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const text =
    `🛒 طلب جديد\n👤 الاسم: ${o.customerName}\n📞 الهاتف: ${o.customerPhone}\n` +
    `📍 الولاية: ${o.wilaya}\n🏠 العنوان: ${o.address}\n📦 المنتج: ${o.product}\n` +
    `🔢 الكمية: ${o.quantity}\n💰 المجموع: ${o.total} دج` +
    (o.ip ? `\n🌐 IP: ${o.ip}${o.country ? " (" + o.country + ")" : ""}` : "");
  await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    }
  );
}

// تفصيل قصير وغير حساس للخطأ (نوع الخطأ من Google فقط) يظهر في رد الـ Worker لتسهيل التشخيص.
function errDetail(e) {
  return String((e && e.message) || e).slice(0, 200);
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

// ---------------------------------------------------------------------
// نقطة الدخول: تجعل هذا الملف قابلًا للنشر وحده كـ Worker كامل (Cloudflare Dashboard >
// Workers > Edit code، الصق الملف كاملاً). لو كان لديك Worker رئيسي فيه راوتر، تجاهل هذا
// الجزء واستورد handleCreateOrder فقط كما في المثال أعلاه.
// ---------------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/create-order") return handleCreateOrder(request, env);
    if (url.pathname === "/health") return handleHealth(request, env);
    return new Response("Not found", { status: 404 });
  },
};

// فحص سريع للإعداد: افتح /health في المتصفح (أو من لوحة التحكم ← المحظورون ← فحص الـ Worker).
// يعرض فقط true/false لوجود كل سر، ونتيجة الاتصال بـ Google وبـ Firestore — لا يكشف أي قيمة
// سرية. إن لم يظهر version فالـ Worker المنشور ليس هذا الملف.
async function handleHealth(request, env) {
  const cors = corsHeaders(request);
  const names = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];
  const configured = {};
  for (const k of names) configured[k] = !!env[k];
  let auth = "skipped (missing secrets)";
  let firestore = "skipped";
  if (names.every((k) => env[k])) {
    let token = null;
    try {
      token = await getGoogleAccessToken(env);
      auth = "ok";
    } catch (e) {
      auth = "failed: " + errDetail(e);
    }
    if (token) {
      // قراءة وثيقة غير موجودة: 404 = الصلاحيات سليمة، 403 = الحساب لا يملك صلاحية Firestore.
      try {
        await docExists(env, token, "blockedIps", "health-check");
        firestore = "ok";
      } catch (e) {
        firestore = "failed: " + errDetail(e);
      }
    }
  }
  return json(
    {
      ok: true,
      version: "ip-ban-v3",
      configured,
      telegram: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
      auth,
      firestore,
      ready: names.every((k) => env[k]) && auth === "ok" && firestore === "ok",
    },
    200,
    { ...cors, "Cache-Control": "no-store" }
  );
}
