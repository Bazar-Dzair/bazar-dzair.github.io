"""
يفحص أن كل مفتاح ترجمة مستعمل في صفحات HTML (data-i18n / data-i18n-ph / data-i18n-ar...)
أو في استدعاءات pt("...") موجود فعلًا في قاموس i18n.js أو PAGE_DICT داخل product-app.js،
وأن لكل مفتاح نصًّا عربيًا وفرنسيًا. يفشل (exit 1) إن وجد نقصًا، فيظهر قبل النشر لا عند الزبون.
تشغيل:  python3 scripts/check_i18n.py
"""
import pathlib, re, sys

_here = pathlib.Path(__file__).resolve().parent
# يعمل سواء وُضع الملف في scripts/ أو في جذر المستودع
ROOT = _here if (_here / "product.html").exists() else _here.parent
read = lambda n: (ROOT / n).read_text(encoding="utf-8")

i18n, app = read("i18n.js"), read("product-app.js")

# مفاتيح معرّفة:  key: { ar: "...", fr: "..." }  أو  key:{ar:"...",fr:"..."}
DEF_RE = re.compile(r'([A-Za-z_][\w]*)\s*:\s*\{\s*ar\s*:\s*(.+?)\s*,\s*fr\s*:\s*(.+?)\s*\}\s*,?\s*$', re.M)
defined = {}
for src in (i18n, app):
    for m in DEF_RE.finditer(src):
        defined[m.group(1)] = (m.group(2).strip(), m.group(3).strip())

# مفاتيح تُستعمل في HTML الجذر والقالب فقط (الصفحات المولَّدة تُبنى منه)
pages = ["product.html", "index.html", "orders.html", "policies.html", "404.html"]
used = {}
for f in pages:
    p = ROOT / f
    if not p.exists():
        continue
    for m in re.finditer(r'data-i18n(?:-ph|-title|-aria)?="([\w]+)"', p.read_text(encoding="utf-8")):
        used.setdefault(m.group(1), set()).add(f)
for m in re.finditer(r'\bpt\(\s*"([\w]+)"\s*\)', app):
    used.setdefault(m.group(1), set()).add("product-app.js")

missing = {k: v for k, v in used.items() if k not in defined}
empty = [k for k, (ar, fr) in defined.items() if k in used and (ar in ('""', "''") or fr in ('""', "''"))]

if missing:
    print("❌ مفاتيح مستعملة وغير معرّفة:")
    for k, v in sorted(missing.items()):
        print(f"   {k}   ←  {', '.join(sorted(v))}")
if empty:
    print("❌ مفاتيح بنص فارغ:", ", ".join(empty))
if missing or empty:
    sys.exit(1)
print(f"✅ كل مفاتيح الترجمة سليمة ({len(used)} مفتاحًا مستعملًا)")
