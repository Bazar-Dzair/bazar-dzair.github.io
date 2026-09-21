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
//      سجلّ الحظر صار يحمل: السبب، التاريخ، من حظر، مدة الحظر (مؤقت/دائم) وعدد محاولات
//      الطلب بعد الحظر — والحظر المرفوع (status = lifted) أو المنتهي (expiresAt) لا يمنع شيئًا.
//   2.b) نظام كشف الإساءة (Fraud / Abuse): لا يعتمد على IP وحده. يسجّل إشارات لكل من
//      (IP، الهاتف، الجهاز deviceId، العنوان) في collection fraudSignals ويطلق إنذارات في
//      collection fraudAlerts عند: كثرة الطلبات من نفس IP، تتابع طلبات من نفس الهاتف،
//      جهاز يجرّب عدة أرقام، كثرة الطلبات لنفس العنوان، أو جهاز يعود بعد محاولة محظورة.
//      هذه الإشارات إنذار فقط (لا تمنع الطلب) — المنع يبقى للحظر اليدوي من لوحة التحكم.
//      أي عطل في هذا النظام لا يوقف الطلبات أبدًا (fail-open) عكس فحص الحظر (fail-closed).
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
// إعدادات كشف الإساءة — عدّل الأرقام هنا فقط (الأزمنة بالمللي ثانية)
// ---------------------------------------------------------------------
const FRAUD = {
  KEEP_MS: 24 * 3600 * 1000, // مدة الاحتفاظ بأحداث كل مفتاح
  MAX_EVENTS: 40, // أقصى عدد أحداث محفوظة لكل مفتاح
  IP_BURST: { windowMs: 10 * 60 * 1000, count: 5 }, // 5 طلبات من نفس IP خلال 10 دقائق
  IP_MANY_PHONES: { distinct: 4 }, // 4 أرقام مختلفة من نفس IP خلال 24 ساعة
  PHONE_REPEAT: { windowMs: 30 * 60 * 1000, count: 3 }, // 3 طلبات لنفس الهاتف خلال 30 دقيقة
  DEVICE_MANY_PHONES: { distinct: 3 }, // نفس الجهاز جرّب 3 أرقام مختلفة خلال 24 ساعة
  DEVICE_BURST: { windowMs: 10 * 60 * 1000, count: 5 }, // 5 طلبات من نفس الجهاز خلال 10 دقائق
  ADDRESS_REPEAT: { count: 4 }, // 4 طلبات لنفس العنوان خلال 24 ساعة
  ADDRESS_MIN_LENGTH: 12, // عنوان أقصر من هذا (مثل "الجزائر") لا يُعتبر مفتاحًا موثوقًا
  BLOCK_EVASION_MS: 30 * 24 * 3600 * 1000, // مدة تذكّر جهاز حاول الطلب وهو محظور
  CART_DEDUPE_MS: 10 * 60 * 1000, // نفس cartId خلال هذه المدة = نفس عملية الشراء (حدث واحد لا أكثر)
  SIGNAL_TTL_MS: 30 * 24 * 3600 * 1000, // حقل expireAt (يمكنك لاحقًا تفعيل TTL Policy عليه)
  ANALYSIS_TIMEOUT_MS: 3500, // لو تأخر التحليل أكثر من هذا نتجاوزه ولا نؤخّر الزبون
};

// وزن كل إشارة. إشارات IP (viaIp) مجتمعةً لا تتجاوز نقطة واحدة لأن عدة أشخاص قد
// يتشاركون نفس IP (شبكات الهاتف) — فلا يكفي IP وحده للوصول إلى خطر متوسط أو عالٍ.
const FLAG_INFO = {
  ip_burst: { weight: 1, viaIp: true, ar: "عدد كبير من الطلبات من نفس الـ IP في وقت قصير" },
  ip_many_phones: { weight: 1, viaIp: true, ar: "نفس الـ IP استعمل عدة أرقام هاتف مختلفة" },
  phone_repeat: { weight: 2, ar: "نفس رقم الهاتف أرسل عدة طلبات متتالية" },
  device_many_phones: { weight: 3, ar: "نفس الجهاز جرّب أرقام هاتف مختلفة" },
  device_burst: { weight: 2, ar: "نفس الجهاز أرسل عدد كبير من الطلبات في وقت قصير" },
  address_repeat: { weight: 2, ar: "عدد كبير من الطلبات لنفس العنوان" },
  device_evading_block: { weight: 3, ar: "جهاز سبق أن حاول الطلب برقم/IP محظور عاد الآن بمعطيات مختلفة" },
};

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

export async function handleCreateOrder(request, env, ctx) {
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
    deviceId,
    cartId,
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

  // معرّف الجهاز (يولّده المتصفح ويحفظه محليًا) وبصمة العنوان — كلاهما لكشف الإساءة فقط.
  // قيمة غير صالحة تُهمل بصمت ولا ترفض الطلب.
  const deviceKey = typeof deviceId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(deviceId) ? deviceId : "";
  // معرّف السلة (اختياري، من المتصفح): يُرسَل بنفس القيمة مع كل منتجات سلة واحدة، ويُستعمل
  // فقط لمنع كشف الإساءة من احتساب طلبات السلة الواحدة كطلبات متكررة مشبوهة (انظر assessRisk).
  const cartKey = typeof cartId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(cartId) ? cartId : "";
  const addrKey = await addressKey(wilayaClean, addressClean);
  const country = (request.cf && request.cf.country) || "";

  // 4) رفض الطلب إذا كان عنوان IP أو رقم الهاتف محظورًا من لوحة تحكم الأدمن.
  //    الفحصان يجريان بالتوازي؛ وأي فشل في القراءة يرفض الطلب (fail-closed) بدل أن
  //    يمرّره، حتى لا يستغل مزعج عطلًا مؤقتًا لتجاوز الحظر. الحظر المرفوع (status =
  //    lifted) أو المنتهي (expiresAt) يُعتبر غير موجود.
  let ipBlock = null;
  let phoneBlock = null;
  try {
    [ipBlock, phoneBlock] = await Promise.all([
      clientIp ? getBlockRecord(env, accessToken, "blockedIps", clientIp.key) : null,
      getBlockRecord(env, accessToken, "blockedPhones", customerPhone),
    ]);
  } catch (e) {
    console.error("Block-list check failed:", e);
    return json({ error: "تعذّر التحقق من الطلب", code: "blocklist_check_failed", detail: errDetail(e) }, 502, cors);
  }
  if (ipBlock || phoneBlock) {
    // نسجّل محاولة الطلب بعد الحظر (عدّاد + آخر محاولة + إنذار) دون تأخير الرد.
    await background(
      ctx,
      handleBlockedAttempt(env, accessToken, {
        ipBlock,
        phoneBlock,
        clientIp,
        phone: customerPhone,
        deviceKey,
        cartKey,
        addrKey,
        country,
      })
    );
    // نفس الرسالة للحالتين عمدًا: لا نكشف للمزعج أي شرط بالضبط منعه، وتتيح لزبون
    // حقيقي (مثلاً يشارك نفس IP مع مزعج عبر شبكة الهاتف) أن يتواصل معك.
    return json(
      {
        error: "تعذّر تسجيل الطلب. إن كنت زبونًا حقيقيًا تواصل معنا هاتفيًا لإتمام طلبك.",
        code: ipBlock ? "ip_blocked" : "phone_blocked",
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

  // 5.b) تقييم الخطر (كشف الإساءة). لا يمنع الطلب أبدًا، ولا يؤخّره أكثر من المهلة.
  let risk = { flags: [], score: 0, level: "" };
  try {
    risk = await withTimeout(
      assessRisk(env, accessToken, {
        phone: customerPhone,
        ipKey: clientIp ? clientIp.key : "",
        deviceKey,
        cartKey,
        addrKey,
        blockedAttempt: false,
      }),
      FRAUD.ANALYSIS_TIMEOUT_MS,
      risk
    );
  } catch (e) {
    console.error("Risk assessment failed:", e);
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
      country,
      // بيانات كشف الإساءة (تظهر في لوحة التحكم؛ الحقول الخطرة لا تُضاف إلا عند وجود إشارة)
      ...(deviceKey ? { deviceId: deviceKey } : {}),
      ...(addrKey ? { addrKey } : {}),
      ...(risk.flags.length
        ? { riskLevel: risk.level, riskScore: risk.score, riskFlags: risk.flags.map((f) => f.code) }
        : {}),
    });
  } catch (e) {
    console.error("Order write failed:", e);
    return json({ error: "تعذّر حفظ الطلب", code: "firestore_write", detail: errDetail(e) }, 502, cors);
  }

  const id = doc && doc.name ? doc.name.split("/").pop() : null;

  // 6.b) إنذارات للإدارة (مرة كل ساعة لكل إشارة ومفتاح حتى لا تُغرق اللوحة)
  if (risk.flags.length) {
    await background(
      ctx,
      createAlerts(env, accessToken, {
        flags: risk.flags,
        orderId: id,
        phone: customerPhone,
        ip: clientIp ? clientIp.display : "",
        country,
        blockedAttempt: false,
      })
    );
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
      country,
      risk,
    });
  } catch (e) {
    console.error("Telegram notify failed:", e);
  }

  return json({ ok: true, id }, 200, cors);
}

// ---------------------------------------------------------------------
// سجلات الحظر: collection "blockedPhones" (معرّف الوثيقة = رقم الهاتف) و "blockedIps"
// (معرّف الوثيقة = ipKey). القراءة بصلاحيات Service Account حتى لو كانت firestore.rules
// تمنع القراءة العامة. الحقول الاختيارية (السجلات القديمة التي تفتقدها تُعامل كحظر دائم
// فعّال): reason, blockedBy, blockedAt, expiresAt (غيابه = دائم), status ("lifted" = مرفوع),
// liftedAt, liftedBy, attempts, lastAttemptAt, lastAttemptIp, lastAttemptPhone.
// ---------------------------------------------------------------------
async function getBlockRecord(env, accessToken, collectionName, id) {
  if (!id || typeof id !== "string") return null;
  const doc = await getDocFields(env, accessToken, collectionName, id);
  return doc && isBlockActive(doc.data, Date.now()) ? doc : null;
}

function isBlockActive(d, now) {
  if (d.status === "lifted") return false;
  if (d.expiresAt instanceof Date && d.expiresAt.getTime() <= now) return false;
  return true;
}

// يزيد عدّاد المحاولات بعد الحظر ويحدّث آخر محاولة (عملية ذرّية عبر commit).
async function recordBlockedAttempt(env, accessToken, collectionName, id, info) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const name = `projects/${projectId}/databases/(default)/documents/${collectionName}/${id}`;
  const fields = {
    lastAttemptIp: { stringValue: info.ip || "" },
    lastAttemptPhone: { stringValue: info.phone || "" },
    lastAttemptCountry: { stringValue: info.country || "" },
  };
  const resp = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        writes: [
          {
            update: { name, fields },
            updateMask: { fieldPaths: Object.keys(fields) },
            updateTransforms: [
              { fieldPath: "attempts", increment: { integerValue: "1" } },
              { fieldPath: "lastAttemptAt", setToServerValue: "REQUEST_TIME" },
            ],
            currentDocument: { exists: true },
          },
        ],
      }),
    }
  );
  if (!resp.ok) throw new Error("blocked attempt write failed: " + resp.status);
}

// كل ما يجب فعله عند محاولة طلب من IP/هاتف محظور: عدّاد + إنذار + تسجيل إشارات الجهاز.
async function handleBlockedAttempt(env, accessToken, o) {
  const info = { ip: o.clientIp ? o.clientIp.raw : "", phone: o.phone, country: o.country };
  const jobs = [];
  if (o.ipBlock && o.clientIp) jobs.push(recordBlockedAttempt(env, accessToken, "blockedIps", o.clientIp.key, info));
  if (o.phoneBlock) jobs.push(recordBlockedAttempt(env, accessToken, "blockedPhones", o.phone, info));
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === "rejected") console.error("Blocked attempt record failed:", r.reason);

  let risk = { flags: [], score: 0, level: "" };
  try {
    risk = await withTimeout(
      assessRisk(env, accessToken, {
        phone: o.phone,
        ipKey: o.clientIp ? o.clientIp.key : "",
        deviceKey: o.deviceKey,
        cartKey: o.cartKey,
        addrKey: o.addrKey,
        blockedAttempt: true,
      }),
      FRAUD.ANALYSIS_TIMEOUT_MS,
      risk
    );
  } catch (e) {
    console.error("Risk assessment (blocked) failed:", e);
  }
  await createAlerts(env, accessToken, {
    flags: risk.flags,
    orderId: "",
    phone: o.phone,
    ip: o.clientIp ? o.clientIp.display : "",
    country: o.country,
    blockedAttempt: true,
    blockedBy: [o.phoneBlock ? "phone" : "", o.ipBlock ? "ip" : ""].filter(Boolean),
    blockKey: o.phoneBlock ? o.phone : o.clientIp ? o.clientIp.key : "",
  });
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
// قراءة وثيقة Firestore وتحويل حقولها إلى قيم JS (null لو غير موجودة)
// ---------------------------------------------------------------------
async function getDocFields(env, accessToken, collectionName, id) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}/${encodeURIComponent(
    id
  )}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(collectionName + " lookup failed: " + resp.status);
  const data = await resp.json();
  const out = {};
  for (const [k, v] of Object.entries(data.fields || {})) out[k] = fromFs(v);
  return { name: data.name, data: out };
}

function fromFs(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return new Date(v.timestampValue);
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFs);
  if ("mapValue" in v) {
    const o = {};
    for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fromFs(x);
    return o;
  }
  return null;
}

function fsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } };
  return { stringValue: String(v) };
}

// ---------------------------------------------------------------------
// أدوات مساعدة عامة
// ---------------------------------------------------------------------
// ينفّذ مهمة جانبية دون تأخير رد الزبون لو توفّر ctx.waitUntil (يمرّره الـ Worker الرئيسي)،
// وإلا ينتظرها. لا ترمي أبدًا: أي فشل يُسجَّل فقط.
function background(ctx, promise) {
  const p = Promise.resolve(promise).catch((e) => console.error("Background task failed:", e));
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(p);
    return Promise.resolve();
  }
  return p;
}

function withTimeout(promise, ms, fallback) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// بصمة العنوان: تطبيع (تشكيل، ألف/ياء/تاء مربوطة، علامات ترقيم، حالة الأحرف) ثم SHA-256.
// عنوان قصير جدًا (مثل "الجزائر") لا يصلح مفتاحًا فنرجع "" ولا نسجّله.
async function addressKey(wilaya, address) {
  const norm = String(wilaya || "")
    .concat(" ", String(address || ""))
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (norm.length < FRAUD.ADDRESS_MIN_LENGTH) return "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  return Array.from(new Uint8Array(buf).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------
// كشف الإساءة: لكل مفتاح (ip / phone / device / addr) وثيقة في fraudSignals تحمل آخر
// الأحداث "الوقت|الهاتف|ipKey|deviceId|cartId". نضيف حدث الطلب الحالي ثم نحسب الإشارات
// (ما لم يكن جزءًا من نفس سلة حديثة، انظر CART_DEDUPE_MS أدناه).
// القراءة ثم الكتابة غير ذرّية عمدًا (تقدير إحصائي للإنذار فقط، لا قرار منع)، وأي فشل هنا
// يُسجَّل ويُتجاوز — لا يوقف الطلب.
// ---------------------------------------------------------------------
function safeId(str) {
  return String(str).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
}

function parseEvents(arr, now) {
  return (Array.isArray(arr) ? arr : [])
    .map((s) => {
      const [t, p, i, d, c] = String(s).split("|");
      return { t: Number(t), p: p || "", i: i || "", d: d || "", c: c || "" };
    })
    .filter((e) => Number.isFinite(e.t) && now - e.t <= FRAUD.KEEP_MS);
}

const inWindow = (evs, ms, now) => evs.filter((e) => now - e.t <= ms);
const distinctOf = (evs, k) => new Set(evs.map((e) => e[k]).filter(Boolean)).size;

function detectFlags(kind, evs, now, prev, o) {
  const out = [];
  if (kind === "ip") {
    const n = inWindow(evs, FRAUD.IP_BURST.windowMs, now).length;
    if (n >= FRAUD.IP_BURST.count) out.push({ code: "ip_burst", count: n });
    const d = distinctOf(evs, "p");
    if (d >= FRAUD.IP_MANY_PHONES.distinct) out.push({ code: "ip_many_phones", count: d });
  } else if (kind === "phone") {
    const n = inWindow(evs, FRAUD.PHONE_REPEAT.windowMs, now).length;
    if (n >= FRAUD.PHONE_REPEAT.count) out.push({ code: "phone_repeat", count: n });
  } else if (kind === "device") {
    const d = distinctOf(evs, "p");
    if (d >= FRAUD.DEVICE_MANY_PHONES.distinct) out.push({ code: "device_many_phones", count: d });
    const n = inWindow(evs, FRAUD.DEVICE_BURST.windowMs, now).length;
    if (n >= FRAUD.DEVICE_BURST.count) out.push({ code: "device_burst", count: n });
    // جهاز حاول الطلب وهو محظور ثم عاد برقم مختلف وقبل طلبه (لا نفحصه في محاولة محظورة نفسها)
    const hitAt = prev && prev.blockedHitAt instanceof Date ? prev.blockedHitAt.getTime() : 0;
    if (!o.blockedAttempt && hitAt && now - hitAt <= FRAUD.BLOCK_EVASION_MS && prev.blockedHitPhone !== o.phone) {
      out.push({ code: "device_evading_block", count: 1 });
    }
  } else if (kind === "addr") {
    if (evs.length >= FRAUD.ADDRESS_REPEAT.count) out.push({ code: "address_repeat", count: evs.length });
  }
  return out;
}

function scoreFlags(flags) {
  let ipPart = 0;
  let other = 0;
  for (const f of flags) {
    const info = FLAG_INFO[f.code];
    if (info.viaIp) ipPart = Math.max(ipPart, info.weight);
    else other += info.weight;
  }
  const score = Math.min(ipPart, 1) + other; // IP وحده لا يتجاوز نقطة واحدة
  const level = score >= 3 ? "high" : score >= 2 ? "medium" : score >= 1 ? "low" : "";
  return { score, level };
}

async function assessRisk(env, accessToken, o) {
  const now = Date.now();
  const keys = [];
  if (o.ipKey) keys.push({ kind: "ip", key: o.ipKey });
  if (o.phone) keys.push({ kind: "phone", key: o.phone });
  if (o.deviceKey) keys.push({ kind: "device", key: o.deviceKey });
  if (o.addrKey) keys.push({ kind: "addr", key: o.addrKey });

  const perKey = await Promise.all(
    keys.map(async ({ kind, key }) => {
      try {
        const id = kind + "_" + safeId(key);
        const existing = await getDocFields(env, accessToken, "fraudSignals", id);
        const prev = existing ? existing.data : {};
        const events = parseEvents(prev.events, now);
        // سلة واحدة (نفس cartId) تُرسل عدة طلبات (منتج لكل طلب) خلال ثوانٍ. لو احتسبنا كل
        // واحد كحدث منفصل لكانت سلة من 3 منتجات كافية وحدها لإطلاق phone_repeat كاذبًا.
        // فإذا كان آخر حدث مسجَّل يحمل نفس cartId غير الفارغ وحديثًا (CART_DEDUPE_MS)، هذا
        // الطلب يُعتبر جزءًا من نفس عملية الشراء ولا يُضاف كحدث جديد.
        const last = events[events.length - 1];
        const isSameCart = !!(o.cartKey && last && last.c === o.cartKey && now - last.t <= FRAUD.CART_DEDUPE_MS);
        if (!isSameCart) {
          events.push({ t: now, p: o.phone || "", i: o.ipKey || "", d: o.deviceKey || "", c: o.cartKey || "" });
        }
        const trimmed = events.slice(-FRAUD.MAX_EVENTS);

        const fields = {
          kind,
          key,
          events: trimmed.map((e) => `${e.t}|${e.p}|${e.i}|${e.d}|${e.c}`),
          updatedAt: new Date(now),
          expireAt: new Date(now + FRAUD.SIGNAL_TTL_MS),
        };
        if (kind === "device") {
          if (o.blockedAttempt) {
            fields.blockedHitAt = new Date(now);
            fields.blockedHitPhone = o.phone || "";
          } else if (prev.blockedHitAt instanceof Date) {
            fields.blockedHitAt = prev.blockedHitAt;
            fields.blockedHitPhone = prev.blockedHitPhone || "";
          }
        }
        await patchDoc(env, accessToken, "fraudSignals", id, fields);

        return detectFlags(kind, trimmed, now, prev, o).map((f) => ({ ...f, kind, key }));
      } catch (e) {
        console.error("Fraud signal failed (" + kind + "):", e);
        return [];
      }
    })
  );

  const flags = perKey.flat();
  return { flags, ...scoreFlags(flags) };
}

// كتابة/إنشاء وثيقة بحقول محددة فقط (updateMask) دون المساس ببقية حقولها.
async function patchDoc(env, accessToken, collectionName, id, obj) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = fsValue(v);
  const mask = Object.keys(fields)
    .map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k))
    .join("&");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}/${encodeURIComponent(
    id
  )}?${mask}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!resp.ok) throw new Error(collectionName + " write failed: " + resp.status);
}

// ---------------------------------------------------------------------
// الإنذارات (collection fraudAlerts) — معرّف الوثيقة = الإشارة + المفتاح + ساعة، فيُنشأ إنذار
// واحد على الأكثر كل ساعة لنفس الإشارة (409 = موجود مسبقًا = طبيعي).
// ---------------------------------------------------------------------
async function createAlerts(env, accessToken, o) {
  const hour = Math.floor(Date.now() / 3600000);
  const alerts = o.flags.map((f) => {
    const w = FLAG_INFO[f.code].weight;
    return {
      id: `${f.code}_${safeId(f.key)}_${hour}`,
      fields: {
        type: f.code,
        severity: w >= 3 ? "high" : w >= 2 ? "medium" : "low",
        keyType: f.kind,
        key: f.kind === "device" ? String(f.key).slice(0, 12) + "…" : f.key,
        count: f.count,
        message: FLAG_INFO[f.code].ar,
        phone: o.phone || "",
        ip: o.ip || "",
        country: o.country || "",
        orderId: o.orderId || "",
        blockedAttempt: !!o.blockedAttempt,
        seen: false,
        resolved: false,
        createdAt: new Date(),
      },
    };
  });
  if (o.blockedAttempt && o.blockKey) {
    alerts.push({
      id: `blocked_attempt_${safeId(o.blockKey)}_${hour}`,
      fields: {
        type: "blocked_attempt",
        severity: "medium",
        keyType: (o.blockedBy || []).join("+"),
        key: o.blockKey,
        count: 1,
        message: "محاولة طلب من رقم أو IP محظور",
        phone: o.phone || "",
        ip: o.ip || "",
        country: o.country || "",
        orderId: "",
        blockedAttempt: true,
        seen: false,
        resolved: false,
        createdAt: new Date(),
      },
    });
  }
  const projectId = env.FIREBASE_PROJECT_ID;
  await Promise.all(
    alerts.map(async (a) => {
      try {
        const fields = {};
        for (const [k, v] of Object.entries(a.fields)) fields[k] = fsValue(v);
        const resp = await fetch(
          `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/fraudAlerts?documentId=${encodeURIComponent(
            a.id
          )}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ fields }),
          }
        );
        if (!resp.ok && resp.status !== 409) throw new Error("alert write failed: " + resp.status);
      } catch (e) {
        console.error("Fraud alert failed:", e);
      }
    })
  );
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
    fields[k] = v === null || v === undefined ? { stringValue: "" } : fsValue(v);
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
    (o.ip ? `\n🌐 IP: ${o.ip}${o.country ? " (" + o.country + ")" : ""}` : "") +
    (o.risk && (o.risk.level === "medium" || o.risk.level === "high")
      ? `\n⚠️ طلب مشبوه (${o.risk.level === "high" ? "خطر عالٍ" : "خطر متوسط"}): ` +
        o.risk.flags.map((f) => FLAG_INFO[f.code].ar).join(" — ")
      : "");
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
// تحديث صفحات SEO فور تغيير البانر: POST /trigger-seo  { "idToken": "<Firebase ID token>" }
// لوحة التحكم ترسل توكن الأدمن بعد حفظ البانر؛ الـ Worker يتحقق منه عبر Google (Identity Toolkit)
// ثم يشغّل GitHub Action (generate-seo-pages.yml) عبر workflow_dispatch.
// أمان: توكن GitHub يبقى سرًا في الـ Worker فقط (لا يوضع أبدًا في admin.html)، ولا يمر الطلب
// إلا إذا كان uid صاحب التوكن هو الأدمن (نفس UID في firestore.rules و admin.html).
// الأسرار: GITHUB_TOKEN (إجباري — Fine-grained PAT بصلاحية Actions: Read and write على المستودع
// فقط). اختياري: GITHUB_REPO (الافتراضي أدناه)، FIREBASE_API_KEY (الافتراضي = المفتاح العام للمشروع).
// ---------------------------------------------------------------------
const SEO_ADMIN_UID = "GOBngnCP2eMTLZrJpf72GOmXvvO2";
const SEO_FIREBASE_WEB_API_KEY = "AIzaSyBWdA_QIy_2gOBl-bP1S1tLaGIqaZjpar8";
const SEO_DEFAULT_REPO = "bazar-dzair/bazar-dzair.github.io";
const SEO_WORKFLOW_FILE = "generate-seo-pages.yml";
const SEO_WORKFLOW_REF = "main";

async function handleTriggerSeo(request, env) {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ error: "Origin not allowed" }, 403, cors);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON" }, 400, cors);
  }
  const idToken = body && typeof body.idToken === "string" ? body.idToken.trim() : "";
  if (!idToken || idToken.length > 4096) return json({ error: "Missing idToken" }, 401, cors);

  if (!env.GITHUB_TOKEN) return json({ error: "GITHUB_TOKEN is not configured on the Worker" }, 503, cors);

  // 1) التحقق من هوية الأدمن (Google يتحقق من التوقيع والصلاحية وعدم الإلغاء)
  let uid = null;
  try {
    const key = env.FIREBASE_API_KEY || SEO_FIREBASE_WEB_API_KEY;
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!r.ok) return json({ error: "Invalid or expired token" }, 401, cors);
    const data = await r.json();
    uid = data && data.users && data.users[0] ? data.users[0].localId : null;
  } catch (e) {
    return json({ error: "Auth check failed", detail: errDetail(e) }, 502, cors);
  }
  if (uid !== SEO_ADMIN_UID) return json({ error: "Forbidden" }, 403, cors);

  // 2) تشغيل الـ workflow (GitHub يردّ 204 عند النجاح). التشغيلات المتزامنة تُصفّف تلقائيًا
  //    بفضل concurrency داخل الـ workflow، فلا خطر من ضغطات متكررة.
  const repo = env.GITHUB_REPO || SEO_DEFAULT_REPO;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${SEO_WORKFLOW_FILE}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "bazar-dzair-worker",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: SEO_WORKFLOW_REF }),
    });
    if (r.status !== 204) {
      const t = await r.text().catch(() => "");
      return json({ error: "GitHub dispatch failed", status: r.status, detail: t.slice(0, 200) }, 502, cors);
    }
  } catch (e) {
    return json({ error: "GitHub request failed", detail: errDetail(e) }, 502, cors);
  }
  return json({ ok: true }, 200, { ...cors, "Cache-Control": "no-store" });
}

// ---------------------------------------------------------------------
// دمج مع الراوتر الحالي في worker الرئيسي، مثال:
//
//   import { handleCreateOrder } from "./create-order.js";
//   export default {
//     async fetch(request, env, ctx) {
//       const url = new URL(request.url);
//       if (url.pathname === "/create-order") return handleCreateOrder(request, env, ctx); // ← مرّر ctx
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
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/create-order") return handleCreateOrder(request, env, ctx);
    if (url.pathname === "/trigger-seo") return handleTriggerSeo(request, env);
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
      version: "fraud-guard-v1",
      configured,
      telegram: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
      seoTrigger: !!env.GITHUB_TOKEN,
      auth,
      firestore,
      ready: names.every((k) => env[k]) && auth === "ok" && firestore === "ok",
    },
    200,
    { ...cors, "Cache-Control": "no-store" }
  );
}
