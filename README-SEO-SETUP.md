# Bazar Dzair SEO setup

## Final URL architecture
- `product.html?id=SLUG` = checkout template, intentionally `noindex,follow`, never in sitemap.
- `/product/SLUG/` = static SEO product page, indexable and included in sitemap.

## First run on GitHub
1. Upload this repository to the `main` branch.
2. Open GitHub → your repository → **Actions**.
3. Select **Generate SEO pages and sitemaps**.
4. Click **Run workflow** → choose `main` → **Run workflow**.
5. Wait for the green check.
6. Confirm that `product/<slug>/index.html` files were created.
7. Open one generated `/product/<slug>/` URL in your browser.
8. Submit `https://bazar-dzair.github.io/sitemap.xml` in Search Console.

The workflow reads the public Firestore products collection, creates one static HTML page per published product, writes Product JSON-LD into the initial HTML, converts Base64 images into real files under `images/products/` when possible, and regenerates the sitemap.

## Important
Do not request indexing for `product.html?id=...`. Search Console will correctly report `noindex` for that checkout template. Request indexing for `/product/SLUG/` instead.
