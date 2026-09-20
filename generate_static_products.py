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


def fr_slug(x):
    """slug لاتيني (a-z0-9 و "-" فقط). نفس منطق frSlug في index.html/product.html/admin.html حرفيًا."""
    s=str(x or '').lower().replace('œ','oe').replace('æ','ae').replace('ß','ss')
    s=unicodedata.normalize('NFKD',s)
    s=''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+','-',s).strip('-')


def product_slug_base(p):
    """المنتج: name_fr، وإلا name إن كان بلا حروف عربية، وإلا produit-<6 أحرف من المعرّف>."""
    s=fr_slug(p.get('name_fr'))
    nm=str(p.get('name') or p.get('product') or '')
    if not s and not re.search(r'[\u0600-\u06ff]',nm): s=fr_slug(nm)
    return s or ('produit-'+fr_slug(p.get('_id'))[:6]).rstrip('-')


def category_slug_base(c):
    """التصنيف: رابط واحد ثابت لكل فئة مهما كانت لغة العرض.
    الأولوية: حقل slug المحفوظ في Firestore (تُثبّته لوحة التحكم مرة واحدة ولا يتغيّر بتعديل الاسم)،
    وإلا (فئات قديمة بلا slug) نفس الاشتقاق القديم تمامًا: name_fr، ثم المعرّف (key) اللاتيني، ثم categorie.
    بهذا لا يتغيّر أي رابط موجود حاليًا، ولا يتبدّل الرابط لاحقًا عند تعديل الاسم الفرنسي."""
    return fr_slug(c.get('slug')) or fr_slug(c.get('name_fr')) or fr_slug(c.get('_id')) or 'categorie'


def redirect_stub_html(target):
    """صفحة تحويل خفيفة توضع في مسار الرابط العربي القديم (GitHub Pages لا يدعم 301): canonical + meta refresh + JS.
    كل فئة/منتج له سلاغ واحد حقيقي فقط (الفرنسي)؛ هذه الصفحة ليست نسخة ثانية من
    المحتوى، بل مجرد جسر تحويل للروابط القديمة المفهرسة/المشارَكة سابقًا. لذلك:
    - noindex صريح: تمنع نهائيًا أي احتمال فهرسة Google لهذا المسار كصفحة مستقلة،
      حتى قبل أن ينفّذ الزاحف التحويل (canonical وحده لا يضمن ذلك دائمًا).
    - غير مُدرجة في أي sitemap (انظر أدناه) وغير مرتبطة من أي مكان في الموقع —
      لا يصل إليها أحد إلا عبر رابط قديم مباشر.
    النتيجة: سلاغ واحد فعلي لكل فئة/منتج (/product-category/outils/ مثلاً)، بلا أي ازدواجية SEO حقيقية."""
    t=html.escape(target,quote=True)
    rel=target[len(SITE)-1:] if target.startswith(SITE) else target  # مسار نسبي للجذر: يعمل على أي دومين
    r=html.escape(rel,quote=True)
    return ('<!doctype html><html lang="fr"><head><meta charset="utf-8">'
            f'<title>Redirection | Bazar Dzair</title><link rel="canonical" href="{t}">'
            '<meta name="robots" content="noindex,follow">'
            f'<meta http-equiv="refresh" content="0;url={r}">'
            f'<script>location.replace({json.dumps(rel)}+location.hash);</script></head>'
            f'<body><p><a href="{r}">Bazar Dzair</a></p></body></html>')


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
    doc=f'''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><script>(function(){{try{{var ua=navigator.userAgent||"";if(/bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|twitterbot|linkedin|pinterest|embedly|preview/i.test(ua))return;var m=location.pathname.match(/\\/product-category\\/([^\\/]+)\\/?$/);if(m)location.replace("/?category="+m[1]);}}catch(e){{}}}})();</script><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title><meta name="description" content="{html.escape(description, quote=True)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="{html.escape(canonical,quote=True)}"><meta property="og:type" content="website"><meta property="og:title" content="{html.escape(title,quote=True)}"><meta property="og:description" content="{html.escape(description,quote=True)}"><meta property="og:url" content="{html.escape(canonical,quote=True)}"><link rel="icon" href="/logo.svg"><script src="/i18n.js"></script><style>body{{font-family:Arial,Tahoma,sans-serif;max-width:1000px;margin:auto;padding:24px;line-height:1.8;color:#172033}}a{{color:#e65c00;text-decoration:none}}.card{{border:1px solid #e5e7eb;border-radius:18px;padding:18px;margin:14px 0;background:#fff}}img{{max-width:100%;height:auto;object-fit:contain;max-height:420px}}.price{{font-size:24px;font-weight:800;color:#e65c00}}.btn{{display:inline-block;background:#16a34a;color:#fff;padding:12px 18px;border-radius:10px;font-weight:800}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}}body{{background:#f7f8fb}}.top-bar{{display:flex;justify-content:flex-end;margin-bottom:10px}}#langToggleBtn{{border:1px solid #d8dee8;background:#fff;color:#172033;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit}}#langToggleBtn:hover{{background:#f1f4f9}}</style><script type="application/ld+json">{json.dumps(jsonld,ensure_ascii=False)}</script></head><body><div class="top-bar"><button id="langToggleBtn" type="button" onclick="BazarI18n.toggleLang()" aria-label="Français / العربية">FR</button></div>{body}<script>
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

    if not available:
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


def make_meta_description(desc, limit=155):
    """يبني وصف Meta نظيف: يفكّك القوائم النقطية إلى سطر واحد (بدون أسطر جديدة خام)،
    ولا يقطع الكلمة أو الإيموجي الأخير في المنتصف — يوقف عند آخر مسافة قبل الحد."""
    flat = ' '.join((desc or '').split())  # يجمع كل الأسطر/المسافات المتكررة في سطر واحد نظيف
    if len(flat) <= limit:
        return flat
    cut = flat[:limit]
    last_space = cut.rfind(' ')
    if last_space > 0:
        cut = cut[:last_space]
    return cut.rstrip(' ,-–—') + '…'


def inject_product_seo(template, name, desc, url, price, img, images=None, available=True, badge=None, old_price=None, static_product_data=None):
    d155=make_meta_description(desc)
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
    if static_product_data is not None:
        # ===== إصلاح "الطبقتين" =====
        # قبل هذا التعديل كانت هذه الصفحة الثابتة (SSG) تحتوي فقط على HTML جامد
        # للعرض/الفهرسة، بينما بيانات المنتج الحقيقية التي يحتاجها JS (render(),
        # إضافة للسلة، إرسال الطلب...) تُطلب من جديد بالكامل من Firestore بعد
        # تحميل الصفحة — إما عبر استعلام where("slug","==",...) أو، في أسوأ
        # الحالات (عندما لا يملك المنتج حقل slug بعد)، بتحميل كل مجموعة products.
        # أي زيارة = طلب Firestore إضافي حتى لو كانت كل البيانات متوفرة أصلاً هنا
        # وقت البناء.
        #
        # الحل: نُضمّن بيانات المنتج الحقيقية (كما أتت من Firestore وقت البناء،
        # + firestoreId) كـ JSON خام داخل الصفحة نفسها. هكذا تصبح الصفحة الثابتة
        # هي المصدر الفوري لعرض المنتج بالكامل (render() يعمل عليها مباشرة، بدون
        # أي شبكة) — و JS يستخدم Firestore بعد ذلك فقط لتحديث اختياري وخفيف
        # (وثيقة واحدة بالمعرّف المباشر، لا استعلام ولا مسح للمجموعة كاملة) في
        # حال تغيّر السعر/المخزون بعد توليد الصفحة. انظر التعديل المقابل في
        # product.html (دالة load()).
        data_json=json.dumps(static_product_data,ensure_ascii=False).replace('</','<\\/')
        extra+=f'<script type="application/json" id="bazar-static-product">{data_json}</script>'
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

seen={}; legacy_seen={}; product_urls=[]; legacy_product_redirects=[]
for p in products:
    name=str(p.get('name') or p.get('product'))
    base=product_slug_base(p)
    n=seen.get(base,0); seen[base]=n+1
    slug=base if n==0 else f'{base}-{n+1}'
    # الرابط القديم (من الاسم العربي، بنفس ترقيم التكرار القديم) → صفحة تحويل إلى الرابط الفرنسي الجديد.
    lbase=slugify(name,'product'); ln=legacy_seen.get(lbase,0); legacy_seen[lbase]=ln+1
    legacy_product_redirects.append((lbase if ln==0 else f'{lbase}-{ln+1}',slug))
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
    # نفس الوثيقة الحقيقية القادمة من Firestore (كل الحقول: stock, category,
    # specifications, deliveryMethod, shippingHome/Office...) + firestoreId،
    # بنفس الشكل الذي يبنيه product.html عادةً من {...snap.data(), firestoreId: snap.id}.
    # هذا ما يُضمَّن في الصفحة (انظر static_product_data في inject_product_seo).
    static_product_data={**p, 'firestoreId': p['_id']}
    static_product_data.pop('_id', None)
    # لا نُضمّن في الصفحة الثابتة أي تقييم يدوي قديم (reviewRating/reviewCount/reviews...): التقييمات الحقيقية تُجلب من مجموعة reviews فقط.
    for _k in ('reviewRating','reviewCount','aggregateRating','rating','ratingValue','ratingCount','reviews'):
        static_product_data.pop(_k, None)
    template=inject_product_seo(template,name,desc,url,price,img,imgs_list,available,badge=badge,old_price=old_price,static_product_data=static_product_data)
    (root/'product'/slug).mkdir(parents=True,exist_ok=True)
    (root/'product'/slug/'index.html').write_text(template,encoding='utf-8')
    product_urls.append((url,name,p,slug))

# Category pages: match products by category document id first, then by category name.
# ملاحظة الفرنسية: لا نُخمّن أي ترجمة. نستخدم name_fr/description_fr فقط إن كانت
# موجودة فعلاً في مستند الفئة أو المنتج في Firestore، وإلا يبقى النص عربيًا كما هو —
# نفس فلسفة translateProduct في i18n.js تمامًا.
cat_seen={}; cat_legacy_seen={}; cat_urls=[]; cat_url_map={}; legacy_category_redirects=[]
for c in categories:
    name=str(c['name']); base=category_slug_base(c); n=cat_seen.get(base,0); cat_seen[base]=n+1
    slug=base if n==0 else f'{base}-{n+1}'
    lbase=slugify(name,'category'); ln=cat_legacy_seen.get(lbase,0); cat_legacy_seen[lbase]=ln+1
    legacy_category_redirects.append((lbase if ln==0 else f'{lbase}-{ln+1}',slug))
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
    cat_url_map[cid]=url

# ===== تحويل الروابط العربية القديمة إلى الروابط الفرنسية الجديدة =====
# المجلدات القديمة حُذفت أعلاه، فنضع مكانها صفحات تحويل (لا تدخل في sitemap) حتى لا تنكسر
# الروابط المفهرسة في Google أو المشاركة على واتساب/فيسبوك. لا نكتب فوق أي صفحة جديدة.
def write_redirect_stubs(folder, redirects, pretty_prefix):
    new_slugs={new for _,new in redirects}; done=0
    for old,new in redirects:
        if old==new or old in new_slugs: continue
        d=root/folder/old
        if (d/'index.html').exists(): continue
        d.mkdir(parents=True,exist_ok=True)
        (d/'index.html').write_text(redirect_stub_html(SITE+pretty_prefix+urllib.parse.quote(new,safe='-._~')+'/'),encoding='utf-8')
        done+=1
    return done
n_ps=write_redirect_stubs('product',legacy_product_redirects,'product/')
# التصنيفات: مجلد واحد فقط لكل فئة (السلاغ اللاتيني). لا نُنشئ مجلدات عربية مكررة داخل product-category/.
# الروابط العربية القديمة تبقى تعمل للزائر: 404.html يفكّ ترميزها ويفتح /?category=<الاسم>، و index.html
# (findCategory) يطابقها مع الفئة الصحيحة ثم يصحّح الرابط إلى /product-category/<slug>/ تلقائيًا.
# للعودة إلى صفحات التحويل الثابتة (مفيدة فقط لو كانت روابط عربية مفهرسة في Google وتريد نقل إشاراتها) غيّر القيمة إلى True.
KEEP_LEGACY_CATEGORY_STUBS=False
n_cs=write_redirect_stubs('product-category',legacy_category_redirects,'product-category/') if KEEP_LEGACY_CATEGORY_STUBS else 0
print(f'Wrote {n_ps} product and {n_cs} category redirect stubs for legacy Arabic URLs.')

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

# ===================== محتوى ثابت للصفحة الرئيسية (SEO) =====================
# قبل هذا التعديل، الصفحة الرئيسية (index.html) لم تكن تحتوي أي محتوى ثابت —
# قائمة الفئات وقائمة المنتجات تُبنيان بالكامل عبر JavaScript بعد وصول بيانات
# Firestore، فيرى أي زائر (أو محرك بحث لا يُنفّذ JS بالكامل) صفحة شبه فارغة
# لحظة الوصول. هنا نحقن نسخة ثابتة — نفس بنية الـHTML التي يولّدها displayProducts()
# و renderStoreCategories() في index.html تمامًا — بين علامتي SSG المضبوطتين مسبقًا
# في index.html، فيظهر محتوى حقيقي فورًا في الـHTML الخام. الـJS يبقى يستبدل هذا
# المحتوى بالكامل (innerHTML=...) بمجرد وصول البيانات الحية — بدون أي تغيير في
# السلوك التفاعلي، فقط لحظة الوصول الأولى تصبح محتوى حقيقي بدل فراغ.


def inject_between_markers(text, start_marker, end_marker, new_inner):
    pattern = re.compile(re.escape(start_marker) + '.*?' + re.escape(end_marker), re.DOTALL)
    replacement = start_marker + new_inner + end_marker
    new_text, n = pattern.subn(replacement, text, count=1)
    if n == 0:
        raise RuntimeError(f'SSG markers not found in index.html: {start_marker} ... {end_marker}')
    return new_text


def homepage_product_card(url, name, price, img):
    safe_url = html.escape(url, quote=True)
    safe_name = html.escape(name, quote=True)
    return (
        f'<article class="product"><a class="pic" href="{safe_url}" aria-label="{safe_name}" '
        f'style="display:block;color:inherit;text-decoration:none">'
        f'<img src="{html.escape(img, quote=True)}" alt="{safe_name}" loading="lazy" decoding="async"></a>'
        f'<div class="info"><a class="name" href="{safe_url}" style="color:inherit;text-decoration:none">{html.escape(name)}</a>'
        f'<div class="price">{html.escape(money(price))}</div></div></article>'
    )


HOME_MAX_PRODUCTS = 12
home_products_html = ''.join(
    homepage_product_card(u, pn, float(p.get('price') or 0), image_of(p))
    for u, pn, p, _slug in product_urls[:HOME_MAX_PRODUCTS]
)

home_cats_sorted = sorted(
    (c for c in categories if c.get('hidden') is not True),
    key=lambda c: str(c.get('name') or '')
)
home_cats_html = ''.join(
    f'<a class="cat" href="{html.escape(cat_url_map.get(str(c["_id"]), SITE), quote=True)}" '
    f'style="color:inherit;text-decoration:none">'
    f'<i>{html.escape(str(c.get("icon") or "🛍️"))}</i>{html.escape(str(c.get("name") or ""))}</a>'
    for c in home_cats_sorted
)

home_index_path = root / 'index.html'
home = home_index_path.read_text(encoding='utf-8')
home = inject_between_markers(home, '<!--SSG:PRODUCTS_START-->', '<!--SSG:PRODUCTS_END-->', home_products_html)
home = inject_between_markers(home, '<!--SSG:CATS_START-->', '<!--SSG:CATS_END-->', home_cats_html)
home_index_path.write_text(home, encoding='utf-8')
print(f'Injected {len(product_urls[:HOME_MAX_PRODUCTS])} static product cards and {len(home_cats_sorted)} static categories into index.html.')
