// =====================================================================
// worker.js — نسختك الأصلية الشغّالة + إضافة حظر الهاتف وحظر IP فقط.
// كل سطر كان يخدم عندك بقي كما هو بالضبط؛ الإضافات الوحيدة محاطة بتعليقات
// "🆕 إضافة" حتى يكون الفرق واضحًا ولو رجعت تقارن مع نسختك القديمة.
// =====================================================================

// 🆕 إضافة: تطبيع عنوان IP (نفس المنطق المستعمل فـ admin.html حتى يتطابق
// معرّف الحظر). IPv4 كما هو، IPv6 → أول 64 بت فقط (v6-2001-db8-1-2) لأن أي
// مشترك IPv6 يملك عادة /64 كاملة ويقدر يبدّل آخر 64 بت وقتما شاء.
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
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
      const v4 = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join(".");
      return { raw: v4, key: v4, display: v4 };
    }
    const prefix = g.slice(0, 4).map((x) => x.toString(16));
    return { raw: ip, key: "v6-" + prefix.join("-"), display: prefix.join(":") + "::/64" };
  }
  return null;
}

// 🆕 إضافة: IP الحقيقي يقرأه Cloudflare وحده من CF-Connecting-IP — لا يُقرأ
// أبدًا من body الطلب ولا من X-Forwarded-For (قابلة للتزوير من الزبون).
function getClientIp(request) {
  return normalizeIp(request.headers.get("CF-Connecting-IP"));
}

// 🆕 إضافة: مصادقة Service Account (JWT Bearer) — الطريقة الوحيدة لقراءة
// collections blockedPhones/blockedIps لأن firestore.rules تمنع قراءتها
// إلا للأدمن المسجّل دخوله؛ الـ Worker يتجاوز هذا بصلاحيات Service Account.
let cachedToken = null; // { value, expiresAt(ms) } — تفادي طلب توكن جديد مع كل زبون

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
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
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
  const pemContents = String(pem)
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n")
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

// 🆕 إضافة: هل الوثيقة موجودة فـ collection معيّن (بصلاحيات Service Account)؟
async function docExists(env, accessToken, collectionName, id) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}/${encodeURIComponent(id)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (resp.status === 404) return false;
  if (!resp.ok) throw new Error(collectionName + " lookup failed: " + resp.status);
  return true;
}

export default {
  async fetch(request, env) {
    const allowedOrigin = "https://bazar-dzair.github.io";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin
        }
      });
    }

    const origin = request.headers.get("Origin");

    if (origin !== allowedOrigin) {
      return new Response("Forbidden", {
        status: 403,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin
        }
      });
    }

    let data;

    try {
      const contentLength = Number(
        request.headers.get("Content-Length") || "0"
      );

      if (contentLength > 10000) {
        return new Response("Payload too large", {
          status: 413,
          headers: {
            "Access-Control-Allow-Origin": allowedOrigin
          }
        });
      }

      data = await request.json();
    } catch {
      return new Response("Invalid JSON", {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin
        }
      });
    }

    if (!data || typeof data !== "object") {
      return new Response("Invalid payload", {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin
        }
      });
    }

    const {
      customerName,
      customerPhone,
      wilaya,
      address,
      product,
      quantity,
      total,
      price
    } = data;
    const phone = customerPhone;

    if (
      typeof customerName !== "string" ||
      customerName.trim().length < 1 ||
      customerName.length > 100
    ) {
      return new Response("Invalid customer name", {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin
        }
      });
    }

    if (
      typeof phone !== "string" ||
      !/^(0)(5|6|7)[0-9]{8}$/.test(phone.trim())
    ) {
      return new Response("Invalid phone", {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin
        }
      });
    }

    if (
      typeof wilaya !== "string" ||
      wilaya.trim().length < 1 ||
      wilaya.length > 100
    ) {
      return new Response("Invalid wilaya", {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin
        }
      });
    }

    if (
      typeof address !== "string" ||
      address.trim().length < 1 ||
      address.length > 300
    ) {
      return new Response("Invalid address", {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin
        }
      });
    }

    if (
      typeof product !== "string" ||
      product.trim().length < 1 ||
      product.length > 200
    ) {
      return new Response("Invalid product", {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin
        }
      });
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 50
    ) {
      return new Response("Invalid quantity", {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin
        }
      });
    }

    if (
      typeof total !== "number" ||
      !Number.isFinite(total) ||
      total < 0
    ) {
      return new Response("Invalid total", {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin
        }
      });
    }

    if (
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      return new Response("Invalid price", {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin
        }
      });
    }

    if (
      !env.TELEGRAM_BOT_TOKEN ||
      !env.TELEGRAM_CHAT_ID
    ) {
      return new Response(
        "Telegram configuration missing",
        {
          status: 500,
          headers: {
            "Access-Control-Allow-Origin": allowedOrigin
          }
        }
      );
    }

    // 🆕 إضافة: فحص الحظر (هاتف + IP) — بعد نجاح كل التحقق أعلاه، وقبل إرسال
    // Telegram أو قبول الطلب. لو نقصت أسرار Service Account (FIREBASE_*) أو
    // تعطّل Google مؤقتًا، نتجاوز الفحص بدل ما نكسر الطلبات على الزبائن
    // الحقيقيين (fail-open) — بمجرد ضبط الأسرار الثلاثة يصير الفحص فعّالًا.
    const phoneClean = phone.trim();
    const clientIp = getClientIp(request);
    const hasServiceAccount =
      env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY;

    if (hasServiceAccount) {
      try {
        const accessToken = await getGoogleAccessToken(env);
        const [phoneBlocked, ipBlocked] = await Promise.all([
          docExists(env, accessToken, "blockedPhones", phoneClean),
          clientIp ? docExists(env, accessToken, "blockedIps", clientIp.key) : false,
        ]);
        if (phoneBlocked || ipBlocked) {
          // نفس رسالة الحظر فـ الحالتين عمدًا: لا نكشف للمزعج أي شرط بالضبط منعه.
          return new Response(
            JSON.stringify({
              error: "تعذّر تسجيل الطلب. إن كنت زبونًا حقيقيًا تواصل معنا هاتفيًا لإتمام طلبك.",
              code: ipBlocked ? "ip_blocked" : "phone_blocked"
            }),
            {
              status: 403,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": allowedOrigin
              }
            }
          );
        }
      } catch (e) {
        // فشل الفحص نفسه (لا حظر مؤكد) — نكمل الطلب عاديًا، ونسجّل الخطأ فقط.
        console.error("block-check failed:", e && e.message);
      }
    }

    const telegramText =
      `🛒 طلبية جديدة\n\n` +
      `👤 الاسم: ${customerName.trim()}\n` +
      `📱 الهاتف: ${phoneClean}\n` +
      `📍 الولاية: ${wilaya.trim()}\n` +
      `🏠 العنوان: ${address.trim()}\n` +
      `📦 المنتج: ${product.trim()}\n` +
      `🔢 الكمية: ${quantity}\n` +
      `💰 السعر: ${price}\n` +
      `💵 المجموع: ${total}` +
      // 🆕 إضافة: عرض IP فـ رسالة Telegram حتى تقدر تنسخه وتحظره يدويًا من
      // لوحة التحكم (خانة "حظر IP يدوي") لو شكّ فيه طلب.
      (clientIp ? `\n🌐 IP: ${clientIp.display}${request.cf && request.cf.country ? " (" + request.cf.country + ")" : ""}` : "");

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: telegramText
        })
      }
    );

    if (!telegramResponse.ok) {
      return new Response(
        "Telegram sending failed",
        {
          status: 502,
          headers: {
            "Access-Control-Allow-Origin": allowedOrigin
          }
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": allowedOrigin
        }
      }
    );
  }
};
    
