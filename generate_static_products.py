#!/usr/bin/env python3
"""Generate crawlable static product/category pages and sitemaps from Firestore.

Product SEO pages are fully static: title, description, image URLs and Product JSON-LD
are present in the initial HTML sent by GitHub Pages. Customer checkout remains on
product.html?id=SLUG.
"""
import base64
import html
import json
import mimetypes
import re
import shutil
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT = "bazar-dzair-33816"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
SITE = "https://bazar-dzair.github.io/"


def value(v):
    if not v:
        return None
    if "stringValue" in v:
        return v["stringValue"]
    if "integerValue" in v:
        return int(v["integerValue"])
    if "doubleValue" in v:
        return float(v["doubleValue"])
    if "booleanValue" in v:
        return v["booleanValue"]
    if "timestampValue" in v:
        return v["timestampValue"]
    if "arrayValue" in v:
        return [value(x) for x in v.get("arrayValue", {}).get("values", [])]
    if "mapValue" in v:
        return {k: value(x) for k, x in v.get("mapValue", {}).get("fields", {}).items()}
    return next(iter(v.values()), None)


def collection(name):
    out, token = [], None
    while True:
        params = {"pageSize": "1000"}
        if token:
            params["pageToken"] = token
        url = f"{BASE}/{urllib.parse.quote(name)}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Bazar-Dzair-SEO/2.0"})
        with urllib.request.urlopen(req, timeout=45) as response:
            data = json.load(response)
        for doc in data.get("documents", []):
            row = {k: value(v) for k, v in doc.get("fields", {}).items()}
            row["_id"] = doc["name"].rsplit("/", 1)[-1]
            out.append(row)
        token = data.get("nextPageToken")
        if not token:
            return out


def slugify(name, fallback="product"):
    s = unicodedata.normalize("NFKD", str(name or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower().strip()
    s = re.sub(r"[^\w\u0600-\u06ff]+", "-", s, flags=re.UNICODE)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or fallback


def money(v):
    try:
        return f'{int(float(v)):,} دج'.replace(",", "٬")
    except (TypeError, ValueError):
        return "السعر عند الطلب"


def clean_http_url(v):
    if not v:
        return None
    s = str(v).strip()
    if re.match(r"^https?://", s, re.I) and not re.match(r"^data:image/", s, re.I):
        return s
    return None


def image_extension(mime):
    return {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/avif": ".avif",
    }.get(mime.lower(), ".jpg")


def save_data_uri(data_uri, destination):
    m = re.match(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.*)$", str(data_uri), re.I | re.S)
    if not m:
        return None
    mime, payload = m.group(1).lower(), m.group(2)
    try:
        raw = base64.b64decode(payload, validate=False)
    except Exception:
        return None
    if not raw:
        return None
    ext = image_extension(mime)
    path = destination.with_suffix(ext)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    return SITE + urllib.parse.quote(str(path.relative_to(root)), safe="/-._~")


def mirror_remote_image(url, destination):
    """Mirror an external image into GitHub Pages when possible."""
    parsed = urllib.parse.urlparse(url)
    suffix = Path(parsed.path).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}:
        suffix = ".jpg"
    path = destination.with_suffix(suffix)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; Bazar-Dzair-SEO/2.0)"})
        with urllib.request.urlopen(req, timeout=30) as r:
            content_type = (r.headers.get("Content-Type") or "").split(";", 1)[0].lower()
            raw = r.read()
        if not raw or not content_type.startswith("image/"):
            return url
        if content_type in {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"}:
            path = path.with_suffix(image_extension(content_type))
        path.write_bytes(raw)
        return SITE + urllib.parse.quote(str(path.relative_to(root)), safe="/-._~")
    except Exception:
        return url


def collect_images(product, slug):
    raw = []
    if isinstance(product.get("images"), list):
        raw.extend(product["images"])
    for key in ("image", "imageUrl", "photo"):
        if product.get(key):
            raw.append(product[key])

    result = []
    for i, item in enumerate(raw):
        if not item:
            continue
        s = str(item).strip()
        if re.match(r"^data:image/", s, re.I):
            url = save_data_uri(s, root / "images" / "products" / f"{slug}-{i+1}")
        else:
            remote = clean_http_url(s)
            if remote:
                # Keep already-local GitHub URLs as-is; mirror other URLs.
                if remote.startswith(SITE):
                    url = remote
                else:
                    url = mirror_remote_image(remote, root / "images" / "products" / f"{slug}-{i+1}")
            else:
                url = None
        if url and url not in result:
            result.append(url)
        if len(result) >= 10:
            break
    return result


def availability(product):
    if product.get("availability") in {
        "https://schema.org/InStock",
        "https://schema.org/OutOfStock",
        "https://schema.org/PreOrder",
        "https://schema.org/BackOrder",
        "https://schema.org/Discontinued",
    }:
        return product["availability"]
    stock = product.get("stock")
    return "https://schema.org/OutOfStock" if str(stock).strip() == "0" or product.get("available") is False or product.get("inStock") is False else "https://schema.org/InStock"


def updated_date(product, today):
    for key in ("updatedAt", "updated_at", "lastmod", "createdAt", "created_at"):
        raw = product.get(key)
        if raw:
            m = re.search(r"(\d{4}-\d{2}-\d{2})", str(raw))
            if m:
                return m.group(1)
    return today


def write_page(path, title, description, canonical, body, jsonld, image):
    path.parent.mkdir(parents=True, exist_ok=True)
    document = f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(description[:160], quote=True)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<link rel="canonical" href="{html.escape(canonical, quote=True)}">
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<meta property="og:type" content="product">
<meta property="og:locale" content="ar_DZ">
<meta property="og:site_name" content="Bazar Dzair">
<meta property="og:title" content="{html.escape(title, quote=True)}">
<meta property="og:description" content="{html.escape(description[:160], quote=True)}">
<meta property="og:url" content="{html.escape(canonical, quote=True)}">
<meta property="og:image" content="{html.escape(image, quote=True)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{html.escape(title, quote=True)}">
<meta name="twitter:description" content="{html.escape(description[:160], quote=True)}">
<meta name="twitter:image" content="{html.escape(image, quote=True)}">
<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False, separators=(",", ":"))}</script>
<style>
body{{font-family:Arial,Tahoma,sans-serif;background:#f7f8fb;color:#172033;margin:0;line-height:1.8}}.wrap{{max-width:1050px;margin:auto;padding:20px}}a{{color:#e65c00;text-decoration:none;font-weight:700}}.card{{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:22px;margin-top:18px;box-shadow:0 8px 28px #0000000a}}.product{{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px;align-items:start}}.photo{{width:100%;max-height:520px;object-fit:contain;border-radius:16px;background:#fff;display:block}}h1{{font-size:34px;line-height:1.3;margin:8px 0 14px}}.price{{font-size:28px;font-weight:900;color:#e65c00;margin:12px 0}}.buy{{display:inline-block;background:#16a34a;color:#fff;padding:13px 22px;border-radius:12px}}.muted{{color:#667085}}.gallery{{display:flex;gap:10px;overflow:auto;margin-top:12px}}.thumb{{width:82px;height:82px;object-fit:contain;background:#fff;border-radius:10px;border:1px solid #e5e7eb}}@media(max-width:750px){{.product{{grid-template-columns:1fr}}h1{{font-size:27px}}}}
</style>
</head>
<body><div class="wrap"><p><a href="/">🛍️ Bazar Dzair</a> / المنتج</p>{body}</div></body></html>'''
    path.write_text(document, encoding="utf-8")


root = Path(__file__).resolve().parents[1]
today = datetime.now(timezone.utc).date().isoformat()
products = [p for p in collection("products") if p.get("published") is not False and (p.get("name") or p.get("product"))]
categories = [c for c in collection("categories") if c.get("name")]

for folder in (root / "product", root / "category"):
    if folder.exists():
        shutil.rmtree(folder)
# Only generated image subfolder is replaced. Existing user images elsewhere are untouched.
if (root / "images" / "products").exists():
    shutil.rmtree(root / "images" / "products")

slug_counts = {}
product_urls = []
product_rows = []
for product in products:
    name = str(product.get("name") or product.get("product")).strip()
    base = slugify(name, "product")
    count = slug_counts.get(base, 0)
    slug_counts[base] = count + 1
    slug = base if count == 0 else f"{base}-{count + 1}"
    canonical = SITE + "product/" + urllib.parse.quote(slug, safe="-._~") + "/"
    purchase_url = SITE + "product.html?id=" + urllib.parse.quote(slug, safe="-._~")
    description = str(product.get("description") or product.get("desc") or f"شراء {name} من متجر Bazar Dzair.").strip()
    images = collect_images(product, slug)
    if not images:
        # Do not put a fake product image in Product JSON-LD.
        images = [SITE + "logo.svg"]

    try:
        price = float(product.get("price"))
        valid_price = price >= 0
    except (TypeError, ValueError):
        price, valid_price = None, False

    sku = str(product.get("sku") or product.get("SKU") or "").strip()
    if not sku:
        sku = "BDZ-" + re.sub(r"[^A-Za-z0-9_-]", "", str(product.get("_id") or slug))[:40]

    brand = str(product.get("brandName") or product.get("brand") or "").strip()
    if isinstance(product.get("brand"), dict):
        brand = str(product["brand"].get("name") or "").strip()

    jsonld = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": name,
        "image": images,
        "description": description[:500],
        "sku": sku,
        "url": canonical,
    }
    if brand:
        jsonld["brand"] = {"@type": "Brand", "name": brand}

    mpn = str(product.get("mpn") or product.get("MPN") or "").strip()
    gtin = re.sub(r"\s+", "", str(product.get("gtin") or product.get("GTIN") or "").strip())
    if mpn:
        jsonld["mpn"] = mpn
    if re.fullmatch(r"\d{8}", gtin): jsonld["gtin8"] = gtin
    elif re.fullmatch(r"\d{12}", gtin): jsonld["gtin12"] = gtin
    elif re.fullmatch(r"\d{13}", gtin): jsonld["gtin13"] = gtin
    elif re.fullmatch(r"\d{14}", gtin): jsonld["gtin14"] = gtin

    if valid_price:
        jsonld["offers"] = {
            "@type": "Offer",
            "url": canonical,
            "price": price,
            "priceCurrency": "DZD",
            "availability": availability(product),
            "itemCondition": "https://schema.org/NewCondition",
        }

    rating = product.get("aggregateRating") or product.get("rating")
    if isinstance(rating, dict):
        try:
            rv = float(rating.get("ratingValue", rating.get("value")))
            rc = int(float(rating.get("reviewCount", rating.get("count"))))
            if 1 <= rv <= 5 and rc > 0:
                jsonld["aggregateRating"] = {"@type": "AggregateRating", "ratingValue": rv, "reviewCount": rc}
        except (TypeError, ValueError):
            pass

    reviews = product.get("reviews") if isinstance(product.get("reviews"), list) else []
    valid_reviews = []
    for review in reviews:
        if not isinstance(review, dict): continue
        text = str(review.get("text") or review.get("reviewBody") or "").strip()
        author = str(review.get("author") or review.get("authorName") or "").strip()
        date = str(review.get("datePublished") or "").strip()
        if not (text and author and date): continue
        item = {"@type": "Review", "author": {"@type": "Person", "name": author}, "datePublished": date, "reviewBody": text}
        try:
            rv = float(review.get("ratingValue"))
            if 1 <= rv <= 5:
                item["reviewRating"] = {"@type": "Rating", "ratingValue": rv, "bestRating": 5, "worstRating": 1}
        except (TypeError, ValueError):
            pass
        valid_reviews.append(item)
    if valid_reviews:
        jsonld["review"] = valid_reviews[:10]

    body = f'''<main class="card product"><section><img class="photo" src="{html.escape(images[0], quote=True)}" alt="{html.escape(name, quote=True)}" loading="eager" decoding="async">{''.join(f'<div class="gallery"><img class="thumb" src="{html.escape(img, quote=True)}" alt="{html.escape(name, quote=True)}" loading="lazy"></div>' for img in images[1:5])}</section><section><h1>{html.escape(name)}</h1><div class="price">{html.escape(money(price)) if valid_price else 'السعر عند الطلب'}</div><p class="muted">{html.escape(description)}</p><p>الدفع عند الاستلام · توصيل إلى الولايات المتاحة</p><a class="buy" href="{html.escape(purchase_url, quote=True)}">⚡ عرض المنتج والشراء</a></section></main>'''
    write_page(root / "product" / slug / "index.html", name + " | Bazar Dzair", description, canonical, body, jsonld, images[0])
    product_urls.append((canonical, name, updated_date(product, today)))
    product_rows.append((canonical, name, product, slug))

category_counts, category_urls = {}, []
for category in categories:
    name = str(category["name"])
    base = slugify(name, "category")
    count = category_counts.get(base, 0)
    category_counts[base] = count + 1
    slug = base if count == 0 else f"{base}-{count + 1}"
    cid = str(category.get("_id"))
    matched = [row for row in product_rows if str(row[2].get("category") or "") == cid or str(row[2].get("category") or "").strip().lower() == name.strip().lower()]
    url = SITE + "category/" + urllib.parse.quote(slug, safe="-._~") + "/"
    description = f"تصفح منتجات {name} المتوفرة في متجر Bazar Dzair."
    cards = ''.join(f'<article class="card"><h2>{html.escape(pn)}</h2><p>{html.escape(money(prod.get("price")))}</p><a href="{html.escape(pu, quote=True)}">مشاهدة المنتج</a></article>' for pu, pn, prod, _ in matched)
    body = f'<h1>{html.escape(name)}</h1><p>{html.escape(description)}</p>' + (cards or '<div class="card">لا توجد منتجات منشورة في هذا التصنيف حالياً.</div>')
    jsonld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": name, "description": description, "url": url, "mainEntity": {"@type": "ItemList", "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": pu, "name": pn} for i, (pu, pn, _, _) in enumerate(matched)]}}
    write_page(root / "category" / slug / "index.html", name + " | Bazar Dzair", description, url, body, jsonld, SITE + "logo.svg")
    category_urls.append((url, name, today))


def write_sitemap(path, rows):
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for url, lastmod, freq, priority in rows:
        lines.append(f'  <url><loc>{html.escape(url)}</loc><lastmod>{html.escape(lastmod)}</lastmod><changefreq>{freq}</changefreq><priority>{priority}</priority></url>')
    lines.append('</urlset>')
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")

all_rows = [(SITE, today, "daily", "1.0")]
all_rows += [(url, lastmod, "weekly", "0.9") for url, _, lastmod in product_urls]
all_rows += [(url, lastmod, "weekly", "0.8") for url, _, lastmod in category_urls]
write_sitemap(root / "sitemap.xml", all_rows)
write_sitemap(root / "sitemap-products.xml", [(url, lastmod, "weekly", "0.9") for url, _, lastmod in product_urls])
write_sitemap(root / "sitemap-categories.xml", [(url, lastmod, "weekly", "0.8") for url, _, lastmod in category_urls])

print(f"Generated {len(product_urls)} product pages and {len(category_urls)} category pages.")
