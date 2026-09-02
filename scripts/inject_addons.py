#!/usr/bin/env python3
"""
Bazar Dzair — حقن الإضافات في مصدر HTML الساكن (Static injection)
-------------------------------------------------------------------
لماذا هذا الملف ضروري:
  الموقع مستضاف على GitHub Pages (ملفات ثابتة بدون خادم). أدوات مثل
  Google Analytics / Search Console تتحقق من الموقع بقراءة ملف HTML
  المصدر مباشرة، وهي لا تُشغّل JavaScript. حقن كود التتبّع عبر
  addons.js (بعد تحميل الصفحة) لا يظهر أبدًا في "عرض المصدر"، لذلك
  يفشل التحقق دائمًا.

  هذا السكربت يقرأ إعدادات الإضافات من Firestore (settings/addons) —
  نفس المصدر الذي تحفظ فيه لوحة التحكم — ثم يكتب كود كل خدمة مفعّلة
  حرفيًا داخل وسم <head>/<body> للملفات الثابتة: index.html,
  product.html, كل صفحة product/*/index.html, وكل صفحة
  product-category/*/index.html.

  يعمل تلقائيًا ضمن GitHub Actions (كل 15 دقيقة + عند كل push)، لذا
  أي تغيير تفعّله من لوحة التحكم ينعكس في مصدر HTML الحقيقي خلال دقائق
  بدون أي تدخل يدوي.

  السكربت idempotent: يعيد كتابة المحتوى بين علامتين ثابتتين في كل
  مرة، فإن عطّلت إضافة تُحذف من المصدر تلقائيًا، وإن غيّرت المعرّف
  يُستبدل بالجديد.
"""
import json, re, urllib.request
from pathlib import Path

PROJECT = 'bazar-dzair-33816'
BASE = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents'

HEAD_START = '<!-- BAZAR_ADDONS_HEAD_START -->'
HEAD_END = '<!-- BAZAR_ADDONS_HEAD_END -->'
BODY_START = '<!-- BAZAR_ADDONS_BODY_START -->'
BODY_END = '<!-- BAZAR_ADDONS_BODY_END -->'


def value(v):
    if not v: return None
    if 'stringValue' in v: return v['stringValue']
    if 'integerValue' in v: return int(v['integerValue'])
    if 'doubleValue' in v: return float(v['doubleValue'])
    if 'booleanValue' in v: return v['booleanValue']
    if 'timestampValue' in v: return v['timestampValue']
    if 'arrayValue' in v: return [value(x) for x in v.get('arrayValue', {}).get('values', [])]
    if 'mapValue' in v: return {k: value(x) for k, x in v.get('mapValue', {}).get('fields', {}).items()}
    return next(iter(v.values()), None)


def fetch_addons():
    req = urllib.request.Request(BASE + '/settings/addons', headers={'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
    except Exception as e:
        print(f'[inject_addons] تعذّرت قراءة settings/addons: {e}')
        return {}
    fields = data.get('fields', {})
    return {k: value(v) for k, v in fields.items()}


def esc_attr(s):
    return str(s or '').replace('"', '&quot;')


def build_head_snippet(cfg):
    parts = []

    ga = cfg.get('googleAnalytics') or {}
    if ga.get('enabled') is True:
        gid = str(ga.get('id') or '').strip()
        if re.match(r'^(G|T|GT|AW)-[A-Za-z0-9-]{6,}$', gid):
            safe = gid.replace('"', '')
            parts.append(
                f'<script async src="https://www.googletagmanager.com/gtag/js?id={safe}"></script>'
                f"<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}"
                f"gtag('js',new Date());gtag('config','{safe}',{{'send_page_view':true}});</script>"
            )

    gtm = cfg.get('googleTagManager') or {}
    if gtm.get('enabled') is True:
        gid = str(gtm.get('id') or '').strip()
        if re.match(r'^GTM-[A-Za-z0-9]+$', gid):
            safe = gid.replace('"', '')
            parts.append(
                "<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});"
                "var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';"
                "j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);"
                f"}})(window,document,'script','dataLayer','{safe}');</script>"
            )

    mp = cfg.get('metaPixel') or {}
    if mp.get('enabled') is True:
        mid = str(mp.get('id') or '').strip()
        if re.match(r'^[0-9]{8,20}$', mid):
            parts.append(
                "<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments);};"
                "if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;"
                "t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');"
                f"fbq('init','{mid}');fbq('track','PageView');</script>"
                f'<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id={mid}&ev=PageView&noscript=1"></noscript>'
            )

    tt = cfg.get('tiktokPixel') or {}
    if tt.get('enabled') is True:
        tid = str(tt.get('id') or '').strip()
        if re.match(r'^[A-Za-z0-9]{9,25}$', tid):
            parts.append(
                "<script>!function (w, d, t) { w.TiktokAnalyticsObject=t; var ttq=w[t]=w[t]||[];"
                "ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie','holdConsent','revokeConsent','grantConsent'];"
                "ttq.setUseStrictMode=ttq.setUseStrictMode||function(){};"
                "var p1=d.createElement('script'),s=d.getElementsByTagName('script')[0];p1.async=!0;p1.src=t;s.parentNode.insertBefore(p1,s);"
                "}(window, document, 'https://analytics.tiktok.com/i18n/pixel/events.js');"
                f"ttq.load('{tid}');ttq.page();</script>"
            )

    sc = cfg.get('searchConsole') or {}
    if sc.get('enabled') is True:
        code = str(sc.get('id') or '').strip()
        if code:
            parts.append(f'<meta name="google-site-verification" content="{esc_attr(code)}">')

    return ''.join(parts)


def build_body_snippet(cfg):
    gtm = cfg.get('googleTagManager') or {}
    if gtm.get('enabled') is True:
        gid = str(gtm.get('id') or '').strip()
        if re.match(r'^GTM-[A-Za-z0-9]+$', gid):
            return (f'<noscript><iframe src="https://www.googletagmanager.com/ns.html?id={gid}" '
                    'height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>')
    return ''


def patch_file(path: Path, head_snippet: str, body_snippet: str) -> bool:
    try:
        s = path.read_text(encoding='utf-8')
    except Exception:
        return False
    changed = False
    if HEAD_START in s and HEAD_END in s:
        new_s = re.sub(
            re.escape(HEAD_START) + r'.*?' + re.escape(HEAD_END),
            HEAD_START + head_snippet + HEAD_END,
            s, count=1, flags=re.DOTALL)
        if new_s != s:
            s = new_s
            changed = True
    if BODY_START in s and BODY_END in s:
        new_s = re.sub(
            re.escape(BODY_START) + r'.*?' + re.escape(BODY_END),
            BODY_START + body_snippet + BODY_END,
            s, count=1, flags=re.DOTALL)
        if new_s != s:
            s = new_s
            changed = True
    if changed:
        path.write_text(s, encoding='utf-8')
    return changed


def main():
    root = Path(__file__).resolve().parent.parent
    cfg = fetch_addons()
    head_snippet = build_head_snippet(cfg)
    body_snippet = build_body_snippet(cfg)

    targets = []
    for name in ('index.html', 'product.html'):
        p = root / name
        if p.exists():
            targets.append(p)
    for folder in ('product', 'product-category'):
        d = root / folder
        if d.exists():
            targets.extend(sorted(d.glob('*/index.html')))

    touched = 0
    for p in targets:
        if patch_file(p, head_snippet, body_snippet):
            touched += 1

    print(f'[inject_addons] تم فحص {len(targets)} ملف — تم تحديث {touched} ملف.')


if __name__ == '__main__':
    main()
