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
    for name in HTML_FILES:
        html_path = ROOT / name
        if not html_path.is_file():
            continue
        if process_file(html_path):
            print(f"Updated asset versions in {name}")
            changed_any = True
    if not changed_any:
        print("No asset version changes needed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
