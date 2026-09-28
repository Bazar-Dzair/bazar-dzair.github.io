#!/usr/bin/env python3
"""ينتج index.html المحسّن للنشر من المصدر المقروء: يضمّن index-style.css داخل <style>
ويصغّر السكربتات المضمّنة (esbuild). المصدر المقروء: source/index.html (يُحرَّر هناك فقط)."""
import re, subprocess, pathlib, shutil, sys
src = pathlib.Path('source/index.html').read_text(encoding='utf-8')
css = pathlib.Path('index-style.css').read_text(encoding='utf-8').strip()
block = '<!--INLINE_CSS_START--><style>' + css + '</style><!--INLINE_CSS_END-->'
if '<!--INLINE_CSS_START-->' in src:
    src = re.sub(r'<!--INLINE_CSS_START-->.*?<!--INLINE_CSS_END-->', lambda m: block, src, flags=re.S)
else:
    src, n = re.subn(r'<link rel="stylesheet" href="/index-style\.css[^"]*">', lambda m: block, src, count=1)
    if n != 1: sys.exit('stylesheet link not found')
def mini(m):
    if m.group(1).strip() or not m.group(2).strip(): return m.group(0)
    r = subprocess.run(['npx', '--yes', 'esbuild', '--minify', '--target=es2019'], input=m.group(2), capture_output=True, text=True, encoding='utf-8')
    return '<script>' + r.stdout.strip() + '</script>' if r.returncode == 0 else m.group(0)
out = re.sub(r'<script([^>]*)>(.*?)</script>', mini, src, flags=re.S)
pathlib.Path('index.html').write_text(out, encoding='utf-8')
print('built index.html', len(out.encode()), 'bytes')
