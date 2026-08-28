# Bazar Dzair — SEO / Google Search Console

This package is prepared so GitHub Actions generates crawlable static product pages from the public Firestore products collection.

## What was fixed
- Added Google Search Console verification meta tag to `index.html`.
- Changed the dynamic `product.html?id=...` fallback to `noindex` to prevent duplicate/thin URLs from competing with static product pages.
- Added a real GitHub Actions workflow at `.github/workflows/generate-seo-pages.yml`.
- The workflow generates `/product/<slug>/index.html` and `/category/<slug>/index.html`.
- `sitemap.xml` is a sitemap index referencing product/category sitemaps.
- `robots.txt` points to the sitemap and explicitly allows SEO pages.
- Generated product pages contain canonical URLs, Product structured data, BreadcrumbList data, title, description and image metadata.

## After uploading
1. Push the files to the repository's `main` branch.
2. In GitHub: Actions → `Generate SEO pages and sitemaps` → Run workflow once manually.
3. Wait for the workflow to finish and GitHub Pages to publish the changes.
4. In Google Search Console, submit `https://bazar-dzair.github.io/sitemap.xml`.
5. For the homepage, use URL Inspection → Test live URL → Request indexing.

Do not request indexing for every product immediately; let the sitemap guide Google after the generated pages are live.
