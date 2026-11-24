#!/usr/bin/env python3
"""يولّد merchant-feed.xml (RSS 2.0 + مساحة أسماء Google g:) لـ Google Merchant Center.

لا يتصل بـ Firestore: يقرأ بيانات كل منتج من الصفحات الثابتة المولَّدة أصلًا
(الـ JSON المضمّن في <script id="bazar-static-product">)، فيجب تشغيله بعد
scripts/generate_static_products.py. لا يخترع أي بيانات: الحقول غير المتوفرة تُحذف
(لا brand ولا gtin ولا mpn عندنا، لذلك identifier_exists=no كما تطلب Google).
"""
import html, json, re, sys
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://bazar-dzair.github.io'
OUT = ROOT / 'merchant-feed.xml'
STATIC_RE = re.compile(r'<script type="application/json" id="bazar-static-product">(.*?)</script>', re.S)
EMOJI_RE = re.compile(r'[☀-➿⬀-⯿\U0001F000-\U0001FAFF️‍]+')


def esc(v):
    return html.escape(str(v), quote=False)


def clean(text, limit):
    t = EMOJI_RE.sub(' ', str(text or ''))
    t = ' '.join(t.split())
    if len(t) <= limit:
        return t
    cut = t[:limit]
    sp = cut.rfind(' ')
    return (cut[:sp] if sp > 0 else cut).rstrip(' ,-–—') + '…'


def price_str(v):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return f'{n:.2f} DZD' if n > 0 else None


def tag(name, value):
    return f'<g:{name}>{esc(value)}</g:{name}>' if value not in (None, '') else ''


def main():
    items, skipped = [], 0
    for f in sorted((ROOT / 'product').glob('*/index.html')):
        m = STATIC_RE.search(f.read_text(encoding='utf-8'))
        if not m:
            skipped += 1
            continue
        d = json.loads(m.group(1).replace('<\\/', '</'))
        # اسم المجلد هو الرابط الحقيقي المنشور وهو فريد دائمًا (حقل slug قد يتكرر بين منتجين، مثل ...-tablette و ...-tablette-2)
        slug = f.parent.name
        price = price_str(d.get('price'))
        imgs = [i for i in (d.get('images') or [d.get('image')]) if i]
        title = clean(d.get('name'), 150)
        if not (d.get('published') and price and imgs and title):
            skipped += 1
            continue
        try:
            stock = float(d['stock']) if d.get('stock') not in (None, '') else None
        except (TypeError, ValueError):
            stock = None
        in_stock = stock is None or stock > 0
        link = f'{SITE}/product/{slug}/'
        desc = clean(d.get('description'), 4900) or title
        parts = [
            tag('id', slug), f'<title>{esc(title)}</title>', f'<description>{esc(desc)}</description>',
            f'<link>{esc(link)}</link>', tag('image_link', imgs[0]),
        ]
        parts += [tag('additional_image_link', i) for i in imgs[1:10]]
        parts += [
            tag('availability', 'in_stock' if in_stock else 'out_of_stock'),
            tag('price', price), tag('condition', 'new'),
            tag('product_type', d.get('category')), tag('identifier_exists', 'no'),
        ]
        old = price_str(d.get('oldPrice'))
        if d.get('showOldPrice') and old and float(d['oldPrice']) > float(d['price']):
            # Google: price = السعر الأصلي، sale_price = السعر الحالي
            parts[parts.index(tag('price', price))] = tag('price', old)
            parts.append(tag('sale_price', price))
        items.append('<item>' + ''.join(p for p in parts if p) + '</item>')

    now = datetime.now(timezone.utc).strftime('%a, %d %b %Y %H:%M:%S +0000')
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>'
        '<title>Bazar Dzair</title>'
        f'<link>{SITE}/</link><description>منتجات متجر Bazar Dzair</description>'
        f'<lastBuildDate>{now}</lastBuildDate>\n' + '\n'.join(items) + '\n</channel></rss>\n'
    )
    OUT.write_text(xml, encoding='utf-8')
    print(f'merchant-feed.xml: {len(items)} items, {skipped} skipped')


if __name__ == '__main__':
    sys.exit(main())
