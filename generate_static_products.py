#!/usr/bin/env python3
"""Generate crawlable static SEO pages and sitemaps from the public Firestore REST API."""
import html
import json
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
    out = []
    token = None
    while True:
        params = {"pageSize": "1000"}
        if token:
            params["pageToken"] = token
        url = f"{BASE}/{urllib.parse.quote(name)}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Bazar-Dzair-SEO/1.0"})
        with urllib.request.urlopen(req, timeout=45) as response:
            data = json.load(response)
        for doc in data.get("documents", []):
            fields = doc.get("fields", {})
            row = {k: value(v) for k, v in fields.items()}
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


def money(value_):
    try:
        return f'{int(float(value_ or 0)):,} دج'.replace(",", "٬")
    except (TypeError, ValueError):
        return "السعر عند الطلب"


def image_of(product):
    images = product.get("images") if isinstance(product.get("images"), list) else []
    for image in images:
        if image:
            return str(image)
    return str(product.get("image") or product.get("imageUrl") or product.get("photo") or SITE + "logo.svg")


def is_published(product):
    return product.get("published") is not False


def updated_date(product, today):
    """Use a real product update date when present; otherwise use today's date."""
    for key in ("updatedAt", "updated_at", "lastmod", "createdAt", "created_at"):
        raw = product.get(key)
        if raw:
            text = str(raw)
            m = re.search(r"(\d{4}-\d{2}-\d{2})", text)
            if m:
                return m.group(1)
    return today


def write_page(path, title, description, canonical, body, jsonld, image):
    path.parent.mkdir(parents=True, exist_ok=True)
    safe_title = html.escape(title)
    safe_description = html.escape(description[:160], quote=True)
    safe_canonical = html.escape(canonical, quote=True)
    safe_image = html.escape(image, quote=True)
    document = f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{safe_title}</title>
<meta name="description" content="{safe_description}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<link rel="canonical" href="{safe_canonical}">
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<meta property="og:type" content="product">
<meta property="og:locale" content="ar_DZ">
<meta property="og:site_name" content="Bazar Dzair">
<meta property="og:title" content="{safe_title}">
<meta property="og:description" content="{safe_description}">
<meta property="og:url" content="{safe_canonical}">
<meta property="og:image" content="{safe_image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{safe_title}">
<meta name="twitter:description" content="{safe_description}">
<meta name="twitter:image" content="{safe_image}">
<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>
<style>
body{{font-family:Arial,Tahoma,sans-serif;background:#f7f8fb;color:#172033;margin:0;line-height:1.8}}
.wrap{{max-width:1050px;margin:auto;padding:20px}}
a{{color:#e65c00;text-decoration:none;font-weight:700}}
.card{{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:22px;margin-top:18px;box-shadow:0 8px 28px #0000000a}}
.product{{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px;align-items:start}}
.photo{{width:100%;max-height:520px;object-fit:contain;border-radius:16px;background:#fff;display:block}}
h1{{font-size:34px;line-height:1.3;margin:8px 0 14px}}
.price{{font-size:28px;font-weight:900;color:#e65c00;margin:12px 0}}
.buy{{display:inline-block;background:#16a34a;color:#fff;padding:13px 22px;border-radius:12px}}
.muted{{color:#667085}}
@media(max-width:750px){{.product{{grid-template-columns:1fr}}h1{{font-size:27px}}}}
</style>
</head>
<body>
<div class="wrap">
<p><a href="/">🛍️ Bazar Dzair</a> / المنتج</p>
{body}
</div>
</body>
</html>
'''
    path.write_text(document, encoding="utf-8")


root = Path(__file__).resolve().parents[1]
today = datetime.now(timezone.utc).date().isoformat()

products = [p for p in collection("products") if is_published(p) and (p.get("name") or p.get("product"))]
categories = [c for c in collection("categories") if c.get("name")]

# Only generated SEO directories are removed. Live store/admin files are never touched.
for folder in (root / "product", root / "category"):
    if folder.exists():
        shutil.rmtree(folder)

# Match the exact slug algorithm used by product.html/index.html.
slug_counts = {}
product_urls = []
product_rows = []
for product in products:
    name = str(product.get("name") or product.get("product"))
    base = slugify(name, "product")
    count = slug_counts.get(base, 0)
    slug_counts[base] = count + 1
    slug = base if count == 0 else f"{base}-{count + 1}"
    url = SITE + "product/" + urllib.parse.quote(slug, safe="-._~") + "/"
    dynamic_url = SITE + "product.html?id=" + urllib.parse.quote(slug, safe="-._~")
    description = str(product.get("description") or product.get("desc") or f"شراء {name} من متجر Bazar Dzair.").strip()
    image = image_of(product)
    try:
        price = float(product.get("price") or 0)
    except (TypeError, ValueError):
        price = 0

    availability = "https://schema.org/OutOfStock" if str(product.get("stock", "")) == "0" else "https://schema.org/InStock"
    jsonld = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": name,
        "image": [image],
        "description": description[:500],
        "url": url,
        "brand": {"@type": "Brand", "name": "Bazar Dzair"},
        "offers": {
            "@type": "Offer",
            "url": url,
            "priceCurrency": "DZD",
            "price": price,
            "availability": availability,
        },
    }

    # Add ratings/reviews only when real values exist in Firestore.
    rating = product.get("aggregateRating") or product.get("rating")
    if isinstance(rating, dict):
        try:
            rating_value = float(rating.get("ratingValue", rating.get("value")))
            review_count = int(float(rating.get("reviewCount", rating.get("count"))))
            if 1 <= rating_value <= 5 and review_count > 0:
                jsonld["aggregateRating"] = {
                    "@type": "AggregateRating",
                    "ratingValue": rating_value,
                    "reviewCount": review_count,
                }
        except (TypeError, ValueError):
            pass

    reviews = product.get("reviews") if isinstance(product.get("reviews"), list) else []
    valid_reviews = []
    for review in reviews:
        if not isinstance(review, dict):
            continue
        text = str(review.get("text") or review.get("reviewBody") or "").strip()
        author = str(review.get("author") or review.get("authorName") or "").strip()
        date = str(review.get("datePublished") or "").strip()
        if text and author and date:
            item = {
                "@type": "Review",
                "author": {"@type": "Person", "name": author},
                "datePublished": date,
                "reviewBody": text,
            }
            try:
                rv = float(review.get("ratingValue"))
                if 1 <= rv <= 5:
                    item["reviewRating"] = {"@type": "Rating", "ratingValue": rv, "bestRating": 5, "worstRating": 1}
            except (TypeError, ValueError):
                pass
            valid_reviews.append(item)
    if valid_reviews:
        jsonld["review"] = valid_reviews[:10]

    body = f'''<main class="card product">
<section><img class="photo" src="{html.escape(image, quote=True)}" alt="{html.escape(name, quote=True)}" loading="eager" decoding="async"></section>
<section>
<h1>{html.escape(name)}</h1>
<div class="price">{html.escape(money(price))}</div>
<p class="muted">{html.escape(description)}</p>
<p>الدفع عند الاستلام · توصيل إلى الولايات المتاحة</p>
<a class="buy" href="{html.escape(dynamic_url, quote=True)}">⚡ اشترِ الآن</a>
</section>
</main>'''
    write_page(root / "product" / slug / "index.html", name + " | Bazar Dzair", description, url, body, jsonld, image)
    product_urls.append((url, name, updated_date(product, today)))
    product_rows.append((url, name, product, slug))

# Generate category pages using the same product URLs.
category_counts = {}
category_urls = []
for category in categories:
    name = str(category["name"])
    base = slugify(name, "category")
    count = category_counts.get(base, 0)
    category_counts[base] = count + 1
    slug = base if count == 0 else f"{base}-{count + 1}"
    cid = str(category["_id"])
    matched = [row for row in product_rows if str(row[2].get("category") or "") == cid or str(row[2].get("category") or "").strip().lower() == name.strip().lower()]
    url = SITE + "category/" + urllib.parse.quote(slug, safe="-._~") + "/"
    description = f"تصفح منتجات {name} المتوفرة في متجر Bazar Dzair."
    cards = []
    for product_url, product_name, product, _ in matched:
        cards.append(f'''<article class="card"><h2>{html.escape(product_name)}</h2><p>{html.escape(money(product.get("price")))}</p><a href="{html.escape(product_url, quote=True)}">مشاهدة المنتج</a></article>''')
    body = f'<h1>{html.escape(name)}</h1><p>{html.escape(description)}</p>' + (''.join(cards) or '<div class="card">لا توجد منتجات منشورة في هذا التصنيف حالياً.</div>')
    jsonld = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": name,
        "description": description,
        "url": url,
        "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "url": pu, "name": pn}
                for i, (pu, pn, _, _) in enumerate(matched)
            ],
        },
    }
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
