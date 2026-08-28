#!/usr/bin/env python3
"""Generate crawlable product/category pages and XML sitemaps from public Firestore REST data.

This script never edits index.html, product.html, admin.html, orders.html or success.html.
It only creates generated SEO files under product/, category/ and sitemap*.xml.
"""
from __future__ import annotations

import html
import json
import re
import shutil
import sys
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

SITE = "https://bazar-dzair.github.io"
PROJECT = "bazar-dzair-33816"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/"
ROOT = Path(__file__).resolve().parents[1]


def fs_value(v):
    if not isinstance(v, dict):
        return None
    if "nullValue" in v:
        return None
    for key in ("stringValue", "integerValue", "doubleValue", "booleanValue", "timestampValue"):
        if key in v:
            return v[key]
    if "arrayValue" in v:
        return [fs_value(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v:
        return {k: fs_value(x) for k, x in v["mapValue"].get("fields", {}).items()}
    return next(iter(v.values()), None)


def doc_data(doc):
    return {k: fs_value(v) for k, v in doc.get("fields", {}).items()}


def fetch_collection(name: str) -> list[dict]:
    out = []
    token = None
    while True:
        params = {"pageSize": "1000"}
        if token:
            params["pageToken"] = token
        url = BASE + urllib.parse.quote(name) + "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "BazarDzair-SEO-Generator/1.0"})
        with urllib.request.urlopen(req, timeout=45) as r:
            data = json.load(r)
        for doc in data.get("documents", []):
            item = doc_data(doc)
            item["_id"] = doc.get("name", "").rsplit("/", 1)[-1]
            out.append(item)
        token = data.get("nextPageToken")
        if not token:
            break
    return out


def slugify(value: str) -> str:
    s = unicodedata.normalize("NFKD", str(value or "product")).replace("\u200f", "").replace("\u200e", "")
    s = re.sub(r"[\u0300-\u036f]", "", s).lower().strip()
    s = re.sub(r"[^\w\u0600-\u06ff]+", "-", s, flags=re.UNICODE)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "product"


def unique_slug(name: str, used: set[str], suffix: str = "") -> str:
    base = slugify(name)
    if base not in used:
        used.add(base)
        return base
    extra = slugify(suffix) or "item"
    candidate = f"{base}-{extra}"
    n = 2
    while candidate in used:
        candidate = f"{base}-{extra}-{n}"
        n += 1
    used.add(candidate)
    return candidate


def esc(v) -> str:
    return html.escape(str(v if v is not None else ""), quote=True)


def jsonld(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def image_list(p: dict) -> list[str]:
    imgs = p.get("images") if isinstance(p.get("images"), list) else []
    imgs = [str(x) for x in imgs if x]
    first = p.get("image") or p.get("imageUrl") or p.get("photo")
    if first and str(first) not in imgs:
        imgs.insert(0, str(first))
    return imgs or [f"{SITE}/logo.svg"]


def product_name(p: dict) -> str:
    return str(p.get("name") or p.get("product") or "منتج بدون اسم").strip()


def product_description(p: dict) -> str:
    return str(p.get("description") or p.get("desc") or "منتج متوفر في متجر Bazar Dzair.").strip()


def is_published(p: dict) -> bool:
    # Missing published keeps the existing store behaviour: visible by default.
    return p.get("published") is not False


def build_product_page(p: dict, slug: str, category_name: str | None) -> str:
    name = product_name(p)
    desc = product_description(p)
    images = image_list(p)
    price = p.get("price")
    try:
        price_num = float(price) if price is not None and str(price) != "" else None
    except (TypeError, ValueError):
        price_num = None
    canonical = f"{SITE}/product/{urllib.parse.quote(slug, safe='-._~')}/"
    legacy = f"{SITE}/product.html?id={urllib.parse.quote(slug, safe='-._~')}"
    cat_url = None
    if category_name:
        cat_url = f"{SITE}/category/{urllib.parse.quote(slugify(category_name), safe='-._~')}/"

    offer = None
    if price_num is not None:
        offer = {
            "@type": "Offer",
            "url": canonical,
            "priceCurrency": "DZD",
            "price": str(int(price_num)) if price_num.is_integer() else str(price_num),
            "availability": "https://schema.org/InStock",
            "itemCondition": "https://schema.org/NewCondition",
        }
    product_ld = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": name,
        "description": desc[:5000],
        "image": images,
        "url": canonical,
        "brand": {"@type": "Brand", "name": "Bazar Dzair"},
    }
    if offer:
        product_ld["offers"] = offer

    breadcrumb_items = [
        {"@type": "ListItem", "position": 1, "name": "الرئيسية", "item": SITE + "/"}
    ]
    if category_name and cat_url:
        breadcrumb_items.append({"@type": "ListItem", "position": 2, "name": category_name, "item": cat_url})
        breadcrumb_items.append({"@type": "ListItem", "position": 3, "name": name, "item": canonical})
    else:
        breadcrumb_items.append({"@type": "ListItem", "position": 2, "name": name, "item": canonical})
    breadcrumb_ld = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": breadcrumb_items}

    img = images[0]
    price_html = (f'<div class="price">{esc(int(price_num) if price_num is not None and price_num.is_integer() else price_num)} دج</div>'
                  if price_num is not None else '<div class="price">السعر متوفر في المتجر</div>')
    cat_html = f'<a href="{esc(cat_url)}">{esc(category_name)}</a>' if category_name and cat_url else ''
    return f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(name)} | Bazar Dzair</title>
<meta name="description" content="{esc(desc[:155])}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<link rel="canonical" href="{esc(canonical)}">
<link rel="icon" href="{SITE}/logo.svg" type="image/svg+xml">
<meta property="og:type" content="product">
<meta property="og:locale" content="ar_DZ">
<meta property="og:site_name" content="Bazar Dzair">
<meta property="og:title" content="{esc(name)} | Bazar Dzair">
<meta property="og:description" content="{esc(desc[:200])}">
<meta property="og:url" content="{esc(canonical)}">
<meta property="og:image" content="{esc(img)}">
<script type="application/ld+json">{jsonld(product_ld)}</script>
<script type="application/ld+json">{jsonld(breadcrumb_ld)}</script>
<style>
body{{margin:0;background:#f5f7fa;color:#172033;font-family:Arial,Tahoma,sans-serif;line-height:1.7}}
.wrap{{max-width:1050px;width:94%;margin:28px auto 60px}}a{{color:#071b33;text-decoration:none}}.crumb{{font-size:13px;color:#667085;margin-bottom:14px}}.card{{background:#fff;border:1px solid #e4e7ec;border-radius:22px;display:grid;grid-template-columns:1fr 1fr;gap:30px;padding:25px;box-shadow:0 8px 30px #0000000c}}.photo{{background:#f8fafc;border-radius:16px;aspect-ratio:1/1;width:100%;object-fit:contain}}h1{{font-size:32px;line-height:1.3;margin:5px 0 15px}}.price{{font-size:28px;font-weight:900;color:#ff6a00;margin:15px 0}}.desc{{white-space:pre-line;color:#667085}}.buy{{display:inline-block;background:#16a34a;color:#fff;padding:14px 20px;border-radius:12px;font-weight:800;margin-top:15px}}.back{{display:inline-block;background:#071b33;color:#fff;padding:12px 18px;border-radius:12px;margin-top:15px;margin-left:8px}}
@media(max-width:760px){{.card{{grid-template-columns:1fr;padding:14px}}h1{{font-size:25px}}}}
</style>
</head>
<body>
<main class="wrap">
<nav class="crumb"><a href="{SITE}/">الرئيسية</a> › {cat_html}{' › ' if cat_html else ''}<span>{esc(name)}</span></nav>
<article class="card">
<section><img class="photo" src="{esc(img)}" alt="{esc(name)}" loading="eager" decoding="async"></section>
<section>
<h1>{esc(name)}</h1>
{price_html}
<p class="desc">{esc(desc)}</p>
<p><strong>الدفع عند الاستلام</strong> · <strong>توصيل داخل الجزائر</strong></p>
<a class="buy" href="{esc(legacy)}">⚡ اشترِ الآن</a>
<a class="back" href="{SITE}/">← العودة للمتجر</a>
</section>
</article>
</main>
</body>
</html>
'''


def build_category_page(name: str, slug: str, products: list[tuple[dict, str]]) -> str:
    canonical = f"{SITE}/category/{urllib.parse.quote(slug, safe='-._~')}/"
    cards = []
    for p, ps in products:
        n = product_name(p); d = product_description(p); im = image_list(p)[0]
        cards.append(f'<article class="card"><a href="{SITE}/product/{urllib.parse.quote(ps, safe="-._~")}/"><img src="{esc(im)}" alt="{esc(n)}" loading="lazy"><h2>{esc(n)}</h2></a><p>{esc(d[:120])}</p></article>')
    return f'''<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(name)} | Bazar Dzair</title><meta name="description" content="منتجات {esc(name)} في متجر Bazar Dzair.">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><link rel="canonical" href="{esc(canonical)}"><link rel="icon" href="{SITE}/logo.svg" type="image/svg+xml">
<style>body{{margin:0;background:#f5f7fa;color:#172033;font-family:Arial,Tahoma,sans-serif}}.wrap{{max-width:1100px;width:94%;margin:28px auto 60px}}a{{color:inherit;text-decoration:none}}.crumb{{font-size:13px;color:#667085;margin-bottom:14px}}h1{{font-size:30px}}.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}}.card{{background:#fff;border:1px solid #e4e7ec;border-radius:18px;overflow:hidden;padding:12px}}.card img{{width:100%;aspect-ratio:1/1;object-fit:contain;background:#f8fafc;border-radius:12px}}.card h2{{font-size:17px;line-height:1.5}}.card p{{color:#667085;font-size:13px;line-height:1.6}}@media(max-width:800px){{.grid{{grid-template-columns:repeat(2,1fr)}}}}@media(max-width:520px){{.grid{{grid-template-columns:1fr 1fr;gap:10px}}.card h2{{font-size:14px}}}}</style>
</head><body><main class="wrap"><nav class="crumb"><a href="{SITE}/">الرئيسية</a> › {esc(name)}</nav><h1>{esc(name)}</h1><p>تصفح منتجات {esc(name)} المتوفرة في متجر Bazar Dzair.</p><section class="grid">{''.join(cards) or '<p>لا توجد منتجات منشورة في هذا التصنيف حالياً.</p>'}</section></main></body></html>'''


def write_sitemap(filename: str, urls: list[str]):
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        lines.append(f'  <url><loc>{html.escape(u)}</loc></url>')
    lines.append('</urlset>')
    (ROOT / filename).write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    # Remove only previously generated SEO folders; never touch the live application files.
    for generated_dir in (ROOT / "product", ROOT / "category"):
        if generated_dir.exists():
            shutil.rmtree(generated_dir)

    products_raw = fetch_collection("products")
    categories_raw = fetch_collection("categories")
    products = [p for p in products_raw if is_published(p) and product_name(p)]

    # Map category id/name to a display name.
    cat_by_id = {}
    for c in categories_raw:
        n = str(c.get("name") or c.get("title") or "").strip()
        if n:
            cat_by_id[str(c.get("_id"))] = n
            cat_by_id[n] = n
    for p in products:
        c = p.get("category")
        if c and str(c) not in cat_by_id:
            cat_by_id[str(c)] = str(c)

    used_product = set()
    product_entries = []
    for p in products:
        slug = unique_slug(product_name(p), used_product, str(p.get("_id", "")))
        p["_slug"] = slug
        cat = p.get("category")
        p["_category_name"] = cat_by_id.get(str(cat), str(cat) if cat else None)
        out = ROOT / "product" / slug / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(build_product_page(p, slug, p["_category_name"]), encoding="utf-8")
        product_entries.append((p, slug))

    # Category pages.
    category_products: dict[str, list[tuple[dict, str]]] = {}
    category_names: dict[str, str] = {}
    for p, slug in product_entries:
        n = p.get("_category_name")
        if not n:
            continue
        cs = slugify(n)
        category_names[cs] = n
        category_products.setdefault(cs, []).append((p, slug))
    for c in categories_raw:
        n = str(c.get("name") or c.get("title") or "").strip()
        if n:
            cs = slugify(n); category_names.setdefault(cs, n); category_products.setdefault(cs, [])

    category_urls = []
    for cs, n in sorted(category_names.items()):
        out = ROOT / "category" / cs / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(build_category_page(n, cs, category_products.get(cs, [])), encoding="utf-8")
        category_urls.append(f"{SITE}/category/{urllib.parse.quote(cs, safe='-._~')}/")

    product_urls = [f"{SITE}/product/{urllib.parse.quote(slug, safe='-._~')}/" for _, slug in product_entries]
    write_sitemap("sitemap-products.xml", product_urls)
    write_sitemap("sitemap-categories.xml", category_urls)
    index_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        f'  <sitemap><loc>{SITE}/sitemap-products.xml</loc></sitemap>',
        f'  <sitemap><loc>{SITE}/sitemap-categories.xml</loc></sitemap>',
        '</sitemapindex>',
    ]
    (ROOT / "sitemap.xml").write_text("\n".join(index_lines) + "\n", encoding="utf-8")
    print(f"Generated {len(product_entries)} product pages and {len(category_urls)} category pages.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
