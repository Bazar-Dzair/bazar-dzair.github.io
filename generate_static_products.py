#!/usr/bin/env python3
import json, re, html, unicodedata, urllib.parse, urllib.request, urllib.error, shutil, os, sys, tempfile
from pathlib import Path
from datetime import datetime, timezone

PROJECT = "bazar-dzair-33816"
API_KEY = os.environ.get("FIREBASE_WEB_API_KEY", "AIzaSyBWdA_QIy_2gOBl-bP1S1tLaGIqaZjpar8")
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
SITE = "https://bazar-dzair.github.io/"


def value(v):
    if not v: return None
    if "stringValue" in v: return v["stringValue"]
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return float(v["doubleValue"])
    if "booleanValue" in v: return v["booleanValue"]
    if "timestampValue" in v: return v["timestampValue"]
    if "arrayValue" in v: return [value(x) for x in v.get("arrayValue", {}).get("values", [])]
    if "mapValue" in v: return {k: value(x) for k, x in v.get("mapValue", {}).get("fields", {}).items()}
    return None


def collection(name):
    out, token = [], None
    while True:
        params = {"pageSize": "1000"}
        if API_KEY: params["key"] = API_KEY
        if token: params["pageToken"] = token
        url = f"{BASE}/{name}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Bazar-Dzair-SEO/1.0"})
        last = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = json.load(r)
                last = None
                break
            except Exception as e:
                last = e
                import time; time.sleep(2 * (attempt + 1))
        if last:
            raise RuntimeError(f"Firestore collection '{name}' could not be read: {last}")
        for doc in data.get("documents", []):
            fields = doc.get("fields", {})
            out.append({k: value(v) for k, v in fields.items()} | {"_id": doc["name"].rsplit("/", 1)[-1]})
        token = data.get("nextPageToken")
        if not token: return out


def slugify(x, fallback="item"):
    s = unicodedata.normalize("NFKD", str(x or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower().strip()
    s = re.sub(r"[^\w\u0600-\u06ff]+", "-", s, flags=re.UNICODE)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or fallback


def image_of(p):
    imgs = p.get("images") if isinstance(p.get("images"), list) else []
    return next((str(x) for x in imgs if x), str(p.get("image") or p.get("imageUrl") or p.get("photo") or SITE + "logo.svg"))


def money(x):
    try: return f'{int(float(x or 0)):,} دج'.replace(',', '٬')
    except Exception: return 'السعر عند الطلب'


def esc(v): return html.escape(str(v or ""), quote=True)


def write_page(path, title, description, canonical, body, jsonld):
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = f'''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)}</title><meta name="description" content="{esc(description)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="{esc(canonical)}"><meta property="og:type" content="website"><meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(description)}"><meta property="og:url" content="{esc(canonical)}"><meta property="og:site_name" content="Bazar Dzair"><link rel="icon" href="/logo.svg"><script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script><style>body{{font-family:Arial,Tahoma,sans-serif;max-width:1100px;margin:auto;padding:24px;line-height:1.8;color:#172033;background:#f7f8fb}}a{{color:#d85b00;text-decoration:none}}.card{{border:1px solid #e5e7eb;border-radius:18px;padding:18px;margin:14px 0;background:#fff}}img{{max-width:100%;height:auto;object-fit:contain;max-height:420px}}.price{{font-size:24px;font-weight:800;color:#d85b00}}.btn{{display:inline-block;background:#16a34a;color:#fff;padding:12px 18px;border-radius:10px;font-weight:800}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}}h1,h2{{color:#172033}}</style></head><body>{body}</body></html>'''
    path.write_text(doc, encoding="utf-8")


root = Path(__file__).resolve().parents[1]
products_raw = collection("products")
categories = collection("categories")
products = [p for p in products_raw if p.get("published") is not False and (p.get("name") or p.get("product"))]
if not products and products_raw:
    raise RuntimeError("Firestore returned products, but none have a usable name.")

# Generate in a temporary directory first; never delete live generated pages before a successful fetch.
tmp = Path(tempfile.mkdtemp(prefix="bazar-seo-"))
try:
    product_dir = tmp / "product"
    category_dir = tmp / "category"
    seen, product_urls = {}, []
    for p in products:
        name = str(p.get("name") or p.get("product"))
        base = slugify(name, "product")
        n = seen.get(base, 0); seen[base] = n + 1
        slug = base if n == 0 else f"{base}-{n+1}"
        url = SITE + "product/" + urllib.parse.quote(slug, safe="-._~") + "/"
        desc = str(p.get("description") or p.get("desc") or f"شراء {name} من متجر Bazar Dzair.")
        price = float(p.get("price") or 0)
        img = image_of(p)
        ld = {"@context":"https://schema.org","@type":"Product","name":name,"image":[img],"description":desc[:500],"url":url,"offers":{"@type":"Offer","url":url,"priceCurrency":"DZD","price":str(price),"availability":"https://schema.org/InStock"}}
        body = f'''<p><a href="/">Bazar Dzair</a> / منتج</p><main class="card"><img src="{esc(img)}" alt="{esc(name)}"><h1>{esc(name)}</h1><p>{esc(desc)}</p><p class="price">{esc(money(price))}</p><a class="btn" href="/product.html?id={urllib.parse.quote(slug, safe='-._~')}">اشترِ الآن</a></main>'''
        write_page(product_dir / slug / "index.html", name + " | Bazar Dzair", desc[:155], url, body, ld)
        product_urls.append((url, name, p, slug))

    cat_seen, cat_urls = {}, []
    for c in categories:
        name = str(c.get("name") or "").strip()
        if not name: continue
        base = slugify(name, "category")
        n = cat_seen.get(base, 0); cat_seen[base] = n + 1
        slug = base if n == 0 else f"{base}-{n+1}"
        cid = str(c.get("_id") or "")
        keys = {cid.lower(), name.lower(), slug.lower(), str(c.get("slug") or "").lower()}
        matched = [x for x in product_urls if str(x[2].get("category") or "").strip().lower() in keys]
        url = SITE + "category/" + urllib.parse.quote(slug, safe="-._~") + "/"
        desc = f"تصفح منتجات {name} المتوفرة في متجر Bazar Dzair."
        cards = []
        for pu, pn, p, _ in matched:
            cards.append(f'<article class="card"><img src="{esc(image_of(p))}" alt="{esc(pn)}"><h2>{esc(pn)}</h2><p class="price">{esc(money(p.get("price")))}</p><a class="btn" href="{esc(pu)}">مشاهدة المنتج</a></article>')
        body = f'<p><a href="/">Bazar Dzair</a> / {esc(name)}</p><h1>{esc(name)}</h1><p>{esc(desc)}</p><section class="grid">'+(''.join(cards) or '<div class="card">لا توجد منتجات منشورة في هذا التصنيف حالياً.</div>')+'</section>'
        ld = {"@context":"https://schema.org","@type":"CollectionPage","name":name,"description":desc,"url":url,"mainEntity":{"@type":"ItemList","itemListElement":[{"@type":"ListItem","position":i+1,"url":pu,"name":pn} for i,(pu,pn,_,_) in enumerate(matched)]}}
        write_page(category_dir / slug / "index.html", name + " | Bazar Dzair", desc, url, body, ld)
        cat_urls.append((url, name))

    today = datetime.now(timezone.utc).date().isoformat()
    urls = [(SITE,'daily','1.0')] + [(u,'weekly','0.9') for u,_,_,_ in product_urls] + [(u,'weekly','0.8') for u,_ in cat_urls]
    def sitemap(items):
        lines=['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
        for u,freq,priority in items:
            lines.append(f'<url><loc>{esc(u)}</loc><lastmod>{today}</lastmod><changefreq>{freq}</changefreq><priority>{priority}</priority></url>')
        lines.append('</urlset>'); return '\n'.join(lines)+'\n'
    (tmp/'sitemap.xml').write_text(sitemap(urls),encoding='utf-8')
    (tmp/'sitemap-products.xml').write_text(sitemap([(u,'weekly','0.9') for u,_,_,_ in product_urls]),encoding='utf-8')
    (tmp/'sitemap-categories.xml').write_text(sitemap([(u,'weekly','0.8') for u,_ in cat_urls]),encoding='utf-8')

    for folder in (root/'product', root/'category'):
        if folder.exists(): shutil.rmtree(folder)
    shutil.copytree(product_dir, root/'product')
    shutil.copytree(category_dir, root/'category')
    for name in ('sitemap.xml','sitemap-products.xml','sitemap-categories.xml'):
        shutil.copy2(tmp/name, root/name)
    print(f"Generated {len(product_urls)} product pages and {len(cat_urls)} category pages.")
finally:
    shutil.rmtree(tmp, ignore_errors=True)
