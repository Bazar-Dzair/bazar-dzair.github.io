#!/usr/bin/env python3
import json, re, html, unicodedata, urllib.parse, urllib.request
from pathlib import Path
from datetime import datetime, timezone

PROJECT='bazar-dzair-33816'
BASE=f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents'
SITE='https://bazar-dzair.github.io/'


def value(v):
    if not v: return None
    if 'stringValue' in v: return v['stringValue']
    if 'integerValue' in v: return int(v['integerValue'])
    if 'doubleValue' in v: return float(v['doubleValue'])
    if 'booleanValue' in v: return v['booleanValue']
    if 'timestampValue' in v: return v['timestampValue']
    if 'arrayValue' in v: return [value(x) for x in v.get('arrayValue',{}).get('values',[])]
    if 'mapValue' in v: return {k:value(x) for k,x in v.get('mapValue',{}).get('fields',{}).items()}
    return next(iter(v.values()), None)


def collection(name):
    out=[]; token=None
    while True:
        q={'pageSize':'1000'}
        if token: q['pageToken']=token
        req=urllib.request.Request(BASE+'/'+name+'?'+urllib.parse.urlencode(q),headers={'Accept':'application/json'})
        with urllib.request.urlopen(req,timeout=30) as r: data=json.load(r)
        for doc in data.get('documents',[]):
            fields=doc.get('fields',{})
            out.append({k:value(v) for k,v in fields.items()}|{'_id':doc['name'].rsplit('/',1)[-1]})
        token=data.get('nextPageToken')
        if not token: return out


def slugify(x, fallback='item'):
    s=unicodedata.normalize('NFKD',str(x or ''))
    s=''.join(c for c in s if not unicodedata.combining(c)).lower().strip()
    s=re.sub(r'[^\w\u0600-\u06ff]+','-',s,flags=re.UNICODE)
    s=re.sub(r'-+','-',s).strip('-')
    return s or fallback


def money(x):
    try: return f'{int(float(x or 0)):,} دج'.replace(',', '٬')
    except: return 'السعر عند الطلب'


def image_of(p):
    imgs=p.get('images') if isinstance(p.get('images'),list) else []
    return next((str(x) for x in imgs if x), str(p.get('image') or p.get('imageUrl') or p.get('photo') or SITE+'logo.svg'))


def is_published(p):
    return p.get('published') is not False


def write_page(path, title, description, canonical, body, jsonld):
    path.parent.mkdir(parents=True,exist_ok=True)
    doc=f'''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title><meta name="description" content="{html.escape(description, quote=True)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="{html.escape(canonical,quote=True)}"><meta property="og:type" content="website"><meta property="og:title" content="{html.escape(title,quote=True)}"><meta property="og:description" content="{html.escape(description,quote=True)}"><meta property="og:url" content="{html.escape(canonical,quote=True)}"><link rel="icon" href="/logo.svg"><style>body{{font-family:Arial,Tahoma,sans-serif;max-width:1000px;margin:auto;padding:24px;line-height:1.8;color:#172033}}a{{color:#e65c00;text-decoration:none}}.card{{border:1px solid #e5e7eb;border-radius:18px;padding:18px;margin:14px 0;background:#fff}}img{{max-width:100%;height:auto;object-fit:contain;max-height:420px}}.price{{font-size:24px;font-weight:800;color:#e65c00}}.btn{{display:inline-block;background:#16a34a;color:#fff;padding:12px 18px;border-radius:10px;font-weight:800}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}}body{{background:#f7f8fb}}</style><script type="application/ld+json">{json.dumps(jsonld,ensure_ascii=False)}</script></head><body>{body}</body></html>'''
    path.write_text(doc,encoding='utf-8')


root=Path(__file__).resolve().parents[1]
products=[p for p in collection('products') if is_published(p) and (p.get('name') or p.get('product'))]
categories=[c for c in collection('categories') if c.get('name')]

# Reset only generated SEO folders; never touch the live store files.
for folder in (root/'product',root/'product-category'):
    if folder.exists():
        import shutil; shutil.rmtree(folder)

seen={}; product_urls=[]
for p in products:
    name=str(p.get('name') or p.get('product'))
    base=slugify(name,'product')
    n=seen.get(base,0); seen[base]=n+1
    slug=base if n==0 else f'{base}-{n+1}'
    url=SITE+'product/'+urllib.parse.quote(slug,safe='-._~')+'/'
    desc=str(p.get('description') or p.get('desc') or f'شراء {name} من متجر Bazar Dzair.')
    price=float(p.get('price') or 0)
    img=image_of(p)
    cat_id=str(p.get('category') or '')
    ld={'@context':'https://schema.org','@type':'Product','name':name,'image':[img],'description':desc[:500],'url':url,'offers':{'@type':'Offer','url':url,'priceCurrency':'DZD','price':str(price),'availability':'https://schema.org/InStock'}}
    # Each pretty URL is a real static directory containing the functional product app.
    # product.html reads the slug from /product/<slug>/ and loads the matching product.
    template=(root/'product.html').read_text(encoding='utf-8')
    (root/'product'/slug).mkdir(parents=True,exist_ok=True)
    (root/'product'/slug/'index.html').write_text(template,encoding='utf-8')
    product_urls.append((url,name,p,slug))

# Category pages: match products by category document id first, then by category name.
cat_seen={}; cat_urls=[]
for c in categories:
    name=str(c['name']); base=slugify(name,'category'); n=cat_seen.get(base,0); cat_seen[base]=n+1
    slug=base if n==0 else f'{base}-{n+1}'
    cid=str(c['_id'])
    matched=[x for x in product_urls if str(x[2].get('category') or '')==cid or str(x[2].get('category') or '').strip().lower()==name.strip().lower()]
    url=SITE+'product-category/'+urllib.parse.quote(slug,safe='-._~')+'/'
    desc=f'تصفح منتجات {name} المتوفرة في متجر Bazar Dzair.'
    cards=[]
    for pu,pn,p,pslug in matched:
        cards.append(f'<article class="card"><img src="{html.escape(image_of(p),quote=True)}" alt="{html.escape(pn,quote=True)}"><h2>{html.escape(pn)}</h2><p class="price">{html.escape(money(p.get("price")))}</p><a class="btn" href="{html.escape(pu,quote=True)}">مشاهدة المنتج</a></article>')
    body=f'<p><a href="/">Bazar Dzair</a> / {html.escape(name)}</p><h1>{html.escape(name)}</h1><p>{html.escape(desc)}</p><section class="grid">'+(''.join(cards) or '<div class="card">لا توجد منتجات منشورة في هذا التصنيف حالياً.</div>')+'</section>'
    ld={'@context':'https://schema.org','@type':'CollectionPage','name':name,'description':desc,'url':url,'mainEntity':{'@type':'ItemList','itemListElement':[{'@type':'ListItem','position':i+1,'url':pu,'name':pn} for i,(pu,pn,_,_) in enumerate(matched)]},'breadcrumb':{'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'الرئيسية','item':SITE},{'@type':'ListItem','position':2,'name':name,'item':url}]}}
    write_page(root/'product-category'/slug/'index.html',name+' | Bazar Dzair',desc,url,body,ld)
    cat_urls.append((url,name))

# Sitemap index-like single sitemap with all public SEO URLs.
today=datetime.now(timezone.utc).date().isoformat()
urls=[(SITE,'daily','1.0')]+[(u,'weekly','0.9') for u,_,_,_ in product_urls]+[(u,'weekly','0.8') for u,_ in cat_urls]
xml=['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for u,freq,priority in urls:
    xml.append(f'<url><loc>{html.escape(u)}</loc><lastmod>{today}</lastmod><changefreq>{freq}</changefreq><priority>{priority}</priority></url>')
xml.append('</urlset>')
(root/'sitemap.xml').write_text('\n'.join(xml)+'\n',encoding='utf-8')
(root/'sitemap-products.xml').write_text('\n'.join(['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']+[f'<url><loc>{html.escape(u)}</loc><lastmod>{today}</lastmod></url>' for u,_,_,_ in product_urls]+['</urlset>'])+'\n',encoding='utf-8')
(root/'sitemap-categories.xml').write_text('\n'.join(['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']+[f'<url><loc>{html.escape(u)}</loc><lastmod>{today}</lastmod></url>' for u,_ in cat_urls]+['</urlset>'])+'\n',encoding='utf-8')
print(f'Generated {len(product_urls)} product pages and {len(cat_urls)} category pages.')
