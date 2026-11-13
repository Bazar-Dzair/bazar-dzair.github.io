#!/usr/bin/env python3
"""Validate Bazar Dzair XML sitemaps before publishing generated SEO files."""
from pathlib import Path
from urllib.parse import urlparse
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://bazar-dzair.github.io'
NS = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
FILES = ('sitemap.xml', 'sitemap-bazar.xml', 'sitemap-products.xml', 'sitemap-categories.xml')
errors = []

for filename in FILES:
    path = ROOT / filename
    if not path.is_file():
        errors.append(f'{filename}: file is missing')
        continue
    try:
        tree = ET.parse(path)
    except ET.ParseError as exc:
        errors.append(f'{filename}: invalid XML ({exc})')
        continue
    sitemap_root = tree.getroot()
    if sitemap_root.tag != '{http://www.sitemaps.org/schemas/sitemap/0.9}urlset':
        errors.append(f'{filename}: root element must be urlset')
        continue
    entries = sitemap_root.findall('sm:url', NS)
    if not entries:
        errors.append(f'{filename}: contains no URL entries')
    if len(entries) > 50000:
        errors.append(f'{filename}: exceeds the 50,000 URL limit')
    seen = set()
    for entry in entries:
        loc = entry.findtext('sm:loc', default='', namespaces=NS).strip()
        if not loc:
            errors.append(f'{filename}: URL entry has no loc')
            continue
        parsed = urlparse(loc)
        if parsed.scheme != 'https' or parsed.netloc != 'bazar-dzair.github.io':
            errors.append(f'{filename}: URL is outside the canonical HTTPS host: {loc}')
        if parsed.query or parsed.fragment:
            errors.append(f'{filename}: query strings/fragments are not allowed in sitemap URLs: {loc}')
        if loc in seen:
            errors.append(f'{filename}: duplicate URL: {loc}')
        seen.add(loc)
        # Every generated static route must resolve to a file in the repository.
        rel = parsed.path.lstrip('/')
        if not rel:
            target = ROOT / 'index.html'
        elif parsed.path.endswith('/'):
            target = ROOT / rel / 'index.html'
        else:
            target = ROOT / rel
        if not target.is_file():
            errors.append(f'{filename}: URL has no published file: {loc} (expected {target.relative_to(ROOT)})')
    print(f'OK {filename}: {len(entries)} URLs')

robots = ROOT / 'robots.txt'
if not robots.is_file():
    errors.append('robots.txt: file is missing')
else:
    content = robots.read_text(encoding='utf-8')
    # sitemap.xml عالق في Search Console بحالة «Impossible de récupérer» (حالة مخزّنة عند Google لا علاقة لها بالملف).
    # لذلك يُعلَن في robots.txt الاسم البديل sitemap-bazar.xml (نسخة مطابقة)؛ يكفي أن يُعلَن أحد الاسمين.
    declared = [f'Sitemap: {SITE}/sitemap-bazar.xml', f'Sitemap: {SITE}/sitemap.xml']
    if not any(d in content for d in declared):
        errors.append('robots.txt: must declare a sitemap URL (sitemap-bazar.xml or sitemap.xml)')

if errors:
    print('\nSitemap validation failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    sys.exit(1)
print('Sitemap validation passed.')
