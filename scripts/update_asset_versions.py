"""
يحدّث تلقائيًا ?v=... في روابط ملفات CSS/JS المحلية داخل صفحات HTML، بحساب بصمة (hash)
قصيرة من محتوى كل ملف. أي تعديل حقيقي في admin-style.css أو admin-app.js أو غيرهما
يغيّر بصمته تلقائيًا، فيجبر المتصفح على تحميل النسخة الجديدة بدل القديمة من الكاش،
بدون أي تدخل يدوي (ولا حاجة لتذكر تغيير رقم بنفسك بعد كل تعديل).

لا يلمس أي رابط خارجي (http:// أو https://)، فقط الملفات المحلية الموجودة فعليًا
في المستودع (css أو js في جذر الموقع).
"""
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# صفحات HTML التي قد تحتوي روابط CSS/JS محلية يجب تحديث بصمتها
HTML_FILES = [
    "admin.html",
    "index.html",
    "product.html",
    "orders.html",
    "404.html",
    "policies.html",
    "success.html",
]

# صفحات مولَّدة (يعيد generate_static_products.py كتابتها). كانت خارج هذا السكربت، فتبقى
# بصمة product-app.js القديمة في كل صفحات /product/ و/fr/product/ (وبلا بصمة أصلًا في
# الفئات و/latest/) حتى التشغيل المجدول التالي للتوليد، فيخدم الكاش نسخة JS قديمة للزائر.
HTML_GLOBS = [
    "product/*/index.html",
    "fr/product/*/index.html",
    "product-category/*/index.html",
    "latest/index.html",
]

# href="...css?v=xxx"  أو  src="...js?v=xxx"  (مع أو بدون / في البداية، مع أو بدون ?v= أصلًا)
ASSET_RE = re.compile(
    r'((?:href|src)=")(/?)([\w.-]+\.(?:css|js))(?:\?[^"]*)?(")'
)


def file_hash(path: pathlib.Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()[:8]


def process_file(html_path: pathlib.Path) -> bool:
    text = html_path.read_text(encoding="utf-8")

    def repl(m: re.Match) -> str:
        prefix, leading_slash, filename, suffix = m.groups()
        asset_path = ROOT / filename
        if not asset_path.is_file():
            # ملف غير موجود محليًا (مثلاً مسار خارجي أُخذ خطأً) — لا نغيّره
            return m.group(0)
        version = file_hash(asset_path)
        return f"{prefix}{leading_slash}{filename}?v={version}{suffix}"

    new_text = ASSET_RE.sub(repl, text)
    if new_text != text:
        html_path.write_text(new_text, encoding="utf-8")
        return True
    return False


def main() -> int:
    changed_any = False
    targets = [ROOT / name for name in HTML_FILES]
    for pattern in HTML_GLOBS:
        targets.extend(sorted(ROOT.glob(pattern)))
    updated_generated = 0
    for html_path in targets:
        if not html_path.is_file():
            continue
        if process_file(html_path):
            rel = html_path.relative_to(ROOT).as_posix()
            if "/" in rel:
                updated_generated += 1  # صفحات مولَّدة كثيرة: نطبع عددها فقط
            else:
                print(f"Updated asset versions in {rel}")
            changed_any = True
    if updated_generated:
        print(f"Updated asset versions in {updated_generated} generated pages")
    if not changed_any:
        print("No asset version changes needed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
