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


def money_fr(x):
    try: return f'{int(float(x or 0)):,} DA'.replace(',', ' ')
    except: return 'Prix sur demande'


def image_of(p):
    imgs=p.get('images') if isinstance(p.get('images'),list) else []
    return next((str(x) for x in imgs if x), str(p.get('image') or p.get('imageUrl') or p.get('photo') or SITE+'logo.svg'))


def is_published(p):
    return p.get('published') is not False


def write_page(path, title, description, canonical, body, jsonld):
    # هذه الدالة تُستخدم حالياً فقط لصفحات التصنيفات (product-category). هي صفحة SEO
    # ثابتة بسيطة بدون Firebase وبدون أي علاقة بنظام الطلبات؛ التصفح الفعلي للزبون
    # بين التصنيفات يتم داخل index.html (SPA). لذلك إضافة الفرنسية هنا لا تلمس
    # الطلبات أو Telegram أو Firestore إطلاقًا — فقط نص العرض في هذه الصفحة الثابتة.
    #
    # اللغة الافتراضية عند التحميل الأول تبقى العربية (مهم لمحركات البحث)، ثم سكربت
    # صغير في أسفل الصفحة يقرأ تفضيل اللغة المحفوظ (bazarLang في localStorage عبر
    # BazarI18n) ويُبدّل النصوص القابلة للترجمة فوريًا دون إعادة تحميل الصفحة.
    path.parent.mkdir(parents=True,exist_ok=True)
    doc=f'''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title><meta name="description" content="{html.escape(description, quote=True)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="{html.escape(canonical,quote=True)}"><meta property="og:type" content="website"><meta property="og:title" content="{html.escape(title,quote=True)}"><meta property="og:description" content="{html.escape(description,quote=True)}"><meta property="og:url" content="{html.escape(canonical,quote=True)}"><link rel="icon" href="/logo.svg"><script src="/i18n.js"></script><style>body{{font-family:Arial,Tahoma,sans-serif;max-width:1000px;margin:auto;padding:24px;line-height:1.8;color:#172033}}a{{color:#e65c00;text-decoration:none}}.card{{border:1px solid #e5e7eb;border-radius:18px;padding:18px;margin:14px 0;background:#fff}}img{{max-width:100%;height:auto;object-fit:contain;max-height:420px}}.price{{font-size:24px;font-weight:800;color:#e65c00}}.btn{{display:inline-block;background:#16a34a;color:#fff;padding:12px 18px;border-radius:10px;font-weight:800}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}}body{{background:#f7f8fb}}.top-bar{{display:flex;justify-content:flex-end;margin-bottom:10px}}#langToggleBtn{{border:1px solid #d8dee8;background:#fff;color:#172033;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit}}#langToggleBtn:hover{{background:#f1f4f9}}</style><script type="application/ld+json">{json.dumps(jsonld,ensure_ascii=False)}</script></head><body><div class="top-bar"><button id="langToggleBtn" type="button" onclick="BazarI18n.toggleLang()" aria-label="Français / العربية">FR</button></div>{body}<script>
(function(){{
  // نصوص خاصة بهذه الصفحة فقط (غير موجودة في قاموس i18n.js المشترك)، بنفس أسلوب
  // PAGE_DICT المُستخدم في product.html حتى لا نحتاج لتعديل i18n.js من هذا الملف.
  var PAGE_DICT={{
    view_product:{{ar:"مشاهدة المنتج",fr:"Voir le produit"}},
    category_empty:{{ar:"لا توجد منتجات منشورة في هذا التصنيف حالياً.",fr:"Aucun produit publié dans cette catégorie pour le moment."}}
  }};
  function lang(){{return (window.BazarI18n&&BazarI18n.getLang)?BazarI18n.getLang():"ar";}}
  function pt(key){{
    var e=PAGE_DICT[key];
    if(e) return e[lang()]||e.ar;
    return (window.BazarI18n&&BazarI18n.t)?BazarI18n.t(key):key;
  }}
  function applyPage(){{
    var l=lang();
    document.querySelectorAll("[data-i18n]").forEach(function(el){{
      var k=el.getAttribute("data-i18n");
      if(k) el.textContent=pt(k);
    }});
    if(l==="fr"){{
      document.querySelectorAll(".card,.cat-head").forEach(function(el){{
        var nf=el.getAttribute("data-name-fr");
        var nameEl=el.querySelector("h1,h2");
        if(nameEl&&nf) nameEl.textContent=nf;
        var pf=el.getAttribute("data-price-fr");
        var priceEl=el.querySelector(".price");
        if(priceEl&&pf) priceEl.textContent=pf;
        var df=el.getAttribute("data-desc-fr");
        var descEl=el.querySelector(".cat-desc");
        if(descEl&&df) descEl.textContent=df;
      }});
    }}
    var btn=document.getElementById("langToggleBtn");
    if(btn) btn.textContent=l==="ar"?"FR":"AR";
    document.documentElement.setAttribute("lang",l==="fr"?"fr":"ar");
    document.documentElement.setAttribute("dir",l==="fr"?"ltr":"rtl");
  }}
  if(window.BazarI18n){{applyPage();}}else{{document.addEventListener("DOMContentLoaded",applyPage);}}
}})();
</script></body></html>'''
    path.write_text(doc,encoding='utf-8')


# شارة المنتج (productBadge) تُخزَّن في Firestore ككود ثابت من قائمة لوحة التحكم
# (new/featured/offer/best)، وليست نصًا جاهزًا للعرض. النسخة الثابتة (SEO) عربية
# دائمًا، لذلك نستعمل هنا الترجمة العربية فقط — نفس النصوص المستعملة في i18n.js.
# بعض المنتجات القديمة قد تحتوي حقل "badge" قديم بنص عربي حر مباشر (قبل اعتماد
# نظام الأكواد) — في هذه الحالة (كود غير معروف) نعرض النص كما هو دون تغيير.
BADGE_LABELS_AR = {
    'new': '🆕 جديد',
    'featured': '⭐ مميز',
    'offer': '🔥 عرض',
    'best': '🏆 الأكثر مبيعًا',
}


def badge_label(code):
    if not code:
        return None
    return BADGE_LABELS_AR.get(code, str(code))


def static_product_html(name, desc, price, images, available=True, badge=None, old_price=None):
    # Server-rendered fallback so Google (and any user before JS/Firestore loads)
    # sees the REAL product content immediately in the raw HTML — not a spinner.
    # The client JS still overwrites #product's innerHTML once Firestore data
    # arrives (for full interactivity: gallery clicks, buy button, live stock).
    #
    # IMPORTANT: this markup intentionally reuses the *exact same CSS classes*
    # as the JS-rendered version in product.html's render() function (photo-wrap,
    # price-row, trust-grid, action-row, btn-cart/btn-buy, etc.) — since both are
    # served inside the same product.html <style> block. This way, when the JS
    # takes over a second or two later, the layout/size/styling stays visually
    # identical and there is no jarring flash/resize as the page "snaps" from the
    # plain SEO fallback card into the full interactive one.
    #
    # It deliberately does NOT reuse the ids #photoWrap/#infoCol/#infoContent —
    # those are what ensureSkeleton() in product.html checks for to decide whether
    # it needs to (re)build the skeleton and move #checkout into place. Keeping
    # those ids out of this static markup means that logic runs exactly as it
    # always has, untouched.
    imgs = [i for i in images if i] or ['/logo.svg']
    thumbs = ''.join(
        f'<button class="thumb{" active" if i==0 else ""}"><img src="{html.escape(im,quote=True)}" alt="{html.escape(name,quote=True)} {i+1}" loading="lazy"></button>'
        for i, im in enumerate(imgs)
    )
    photo_wrap = (
        f'<div class="photo-wrap"><div class="main-photo-box">'
        f'<img class="photo" src="{html.escape(imgs[0],quote=True)}" alt="{html.escape(name,quote=True)}">'
        f'<span class="gallery-count">1 / {len(imgs)}</span></div>'
        f'<div class="thumbs">{thumbs}</div></div>'
    )

    badge_text = badge_label(badge)
    if available and badge_text:
        badge_html = f'<span class="badge-featured">{html.escape(badge_text)}</span>'
    elif not available:
        badge_html = '<span class="badge-featured unavailable">غير متوفر حاليًا</span>'
    else:
        badge_html = ''

    has_discount = False
    try:
        op = float(old_price) if old_price not in (None, '') else None
        if op is not None and op > float(price or 0):
            has_discount = True
            discount_pct = round((op - float(price or 0)) / op * 100)
    except Exception:
        op = None
    price_row = f'<div class="price-row"><span class="price-current">{html.escape(money(price))}</span>'
    if has_discount:
        price_row += f'<span class="price-old">{html.escape(money(op))}</span><span class="discount-badge">-{discount_pct}%</span>'
    price_row += '</div>'

    delivery_strip = '<div class="delivery-strip"><span aria-hidden="true">🚚</span> <span>توصيل سريع لجميع الولايات</span></div>'
    trust_grid = (
        '<div class="trust-grid">'
        '<div class="trust-card"><span class="ic">🛡️</span><span>منتوج أصلي ومضمون</span></div>'
        '<div class="trust-card"><span class="ic">🚚</span><span>توصيل سريع لجميع الولايات</span></div>'
        '<div class="trust-card"><span class="ic">🎧</span><span>خدمة ما بعد البيع</span></div>'
        '<div class="trust-card"><span class="ic">💵</span><span>دفع عند الاستلام</span></div>'
        '</div>'
    )

    if available:
        action_row = (
            '<div class="action-row">'
            '<button type="button" class="btn-cart">🛒 إضافة إلى السلة</button>'
            '<button type="button" class="btn-buy">⚡ اشترِ الآن</button>'
            '</div>'
        )
    else:
        action_row = (
            '<div class="action-row">'
            '<button type="button" class="btn-cart" disabled>غير متوفر حاليًا</button>'
            '<button type="button" class="btn-buy" disabled>غير متوفر حاليًا</button>'
            '</div>'
        )
    purchase_controls = (
        '<div class="purchase-controls"><div class="qty"><button disabled>−</button>'
        f'<span>1</span><button disabled>+</button></div>{action_row}</div>'
    )

    info = (
        f'<div class="info">{badge_html}<h1 class="title">{html.escape(name)}</h1>'
        f'{price_row}{delivery_strip}{trust_grid}{purchase_controls}</div>'
    )
    return photo_wrap + info


def inject_product_seo(template, name, desc, url, price, img, images=None, available=True, badge=None, old_price=None):
    d155=(desc or '').strip()[:155]
    title_tag=f'<title>{html.escape(name)} | Bazar Dzair</title>'
    desc_tag=f'<meta id="metaDescription" name="description" content="{html.escape(d155,quote=True)}">'
    canonical_tag=f'<link id="canonical" rel="canonical" href="{html.escape(url,quote=True)}">'
    ld={'@context':'https://schema.org','@type':'Product','name':name,'image':[img],'description':(desc or '')[:500],'url':url,'offers':{'@type':'Offer','url':url,'priceCurrency':'DZD','price':str(price),'availability':'https://schema.org/InStock'}}
    bc={'@context':'https://schema.org','@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'الرئيسية','item':SITE},{'@type':'ListItem','position':2,'name':name,'item':url}]}
    extra=(
        f'<meta id="ogTitle" property="og:title" content="{html.escape(name,quote=True)}">'
        f'<meta id="ogDescription" property="og:description" content="{html.escape(d155,quote=True)}">'
        f'<meta id="ogUrl" property="og:url" content="{html.escape(url,quote=True)}">'
        f'<meta id="ogImage" property="og:image" content="{html.escape(img,quote=True)}">'
        f'<script type="application/ld+json" id="bazar_product_jsonld">{json.dumps(ld,ensure_ascii=False)}</script>'
        f'<script type="application/ld+json" id="bazar_breadcrumb_jsonld">{json.dumps(bc,ensure_ascii=False)}</script>'
    )
    out=template.replace('<title>المنتج | Bazar Dzair</title>',title_tag,1)
    out=out.replace('<meta id="metaDescription" name="description" content="منتج من متجر Bazar Dzair">',desc_tag,1)
    out=out.replace('<link id="canonical" rel="canonical">',canonical_tag+extra,1)
    static_body=static_product_html(name, desc, price, images or [img], available, badge=badge, old_price=old_price)
    # ملاحظة: product.html أصبح يحتوي على data-i18n="product_loading" على هذا العنصر
    # (بعد إضافة دعم اللغة الفرنسية للواجهة)، لذلك يجب مطابقة النص الجديد بالضبط هنا
    # وإلا سيفشل الاستبدال بصمت ولن تُحقن صفحات SEO الثابتة بالمحتوى الحقيقي للمنتج.
    out=out.replace('<div class="loading" data-i18n="product_loading">⏳ جاري تحميل المنتج...</div>',static_body,1)
    return out


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
    # SEO tags (title/description/canonical/OG/JSON-LD) are injected server-side here so every
    # product page has genuinely unique raw HTML — this is required so Google doesn't merge
    # different products into one "duplicate" canonical before JS ever runs.
    imgs_list=p.get('images') if isinstance(p.get('images'),list) else []
    imgs_list=[str(x) for x in imgs_list if x] or [img]
    available=p.get('published') is not False
    badge=p.get('productBadge') or p.get('badge') or None
    old_price=p.get('oldPrice') or p.get('old_price') or p.get('compareAtPrice') or p.get('compare_at_price') or None
    template=(root/'product.html').read_text(encoding='utf-8')
    template=inject_product_seo(template,name,desc,url,price,img,imgs_list,available,badge=badge,old_price=old_price)
    (root/'product'/slug).mkdir(parents=True,exist_ok=True)
    (root/'product'/slug/'index.html').write_text(template,encoding='utf-8')
    product_urls.append((url,name,p,slug))

# Category pages: match products by category document id first, then by category name.
# ملاحظة الفرنسية: لا نُخمّن أي ترجمة. نستخدم name_fr/description_fr فقط إن كانت
# موجودة فعلاً في مستند الفئة أو المنتج في Firestore، وإلا يبقى النص عربيًا كما هو —
# نفس فلسفة translateProduct في i18n.js تمامًا.
cat_seen={}; cat_urls=[]
for c in categories:
    name=str(c['name']); base=slugify(name,'category'); n=cat_seen.get(base,0); cat_seen[base]=n+1
    slug=base if n==0 else f'{base}-{n+1}'
    cid=str(c['_id'])
    name_fr=str(c.get('name_fr') or '').strip()
    desc_fr=str(c.get('description_fr') or '').strip()
    matched=[x for x in product_urls if str(x[2].get('category') or '')==cid or str(x[2].get('category') or '').strip().lower()==name.strip().lower()]
    url=SITE+'product-category/'+urllib.parse.quote(slug,safe='-._~')+'/'
    desc=f'تصفح منتجات {name} المتوفرة في متجر Bazar Dzair.'
    cards=[]
    for pu,pn,p,pslug in matched:
        pn_fr=str(p.get('name_fr') or '').strip()
        name_fr_attr=f' data-name-fr="{html.escape(pn_fr,quote=True)}"' if pn_fr else ''
        price_fr_attr=f' data-price-fr="{html.escape(money_fr(p.get("price")),quote=True)}"'
        cards.append(
            f'<article class="card"{name_fr_attr}{price_fr_attr}>'
            f'<img src="{html.escape(image_of(p),quote=True)}" alt="{html.escape(pn,quote=True)}">'
            f'<h2>{html.escape(pn)}</h2>'
            f'<p class="price">{html.escape(money(p.get("price")))}</p>'
            f'<a class="btn" href="{html.escape(pu,quote=True)}" data-i18n="view_product">مشاهدة المنتج</a>'
            f'</article>'
        )
    cat_head_attrs=''
    if name_fr: cat_head_attrs+=f' data-name-fr="{html.escape(name_fr,quote=True)}"'
    if desc_fr: cat_head_attrs+=f' data-desc-fr="{html.escape(desc_fr,quote=True)}"'
    body=(
        f'<p><a href="/">Bazar Dzair</a> / {html.escape(name)}</p>'
        f'<div class="cat-head"{cat_head_attrs}><h1>{html.escape(name)}</h1><p class="cat-desc">{html.escape(desc)}</p></div>'
        f'<section class="grid">'
        + (''.join(cards) or '<div class="card" data-i18n="category_empty">لا توجد منتجات منشورة في هذا التصنيف حالياً.</div>')
        + '</section>'
    )
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
