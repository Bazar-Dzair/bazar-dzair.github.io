# Bazar Dzair SEO setup

## URL architecture
- Checkout: `product.html?id=SLUG` (noindex, not in sitemap)
- SEO: `/product/SLUG/` (indexable, in sitemap)

## First run
1. Upload/replace the repository files on GitHub.
2. Open **Actions**.
3. Select **Generate SEO pages and sitemaps**.
4. Click **Run workflow** and choose `main`.
5. Wait until the workflow is green.
6. Open a generated URL such as `/product/boite-chargeur-anker-zolo-original-20w-usb-c/`.

The workflow reads the public Firestore REST endpoint, converts Base64 product images into real files under `images/products/`, generates Product JSON-LD in the initial HTML, and writes the product-only sitemap.

If a product has no usable image or price, the workflow stops instead of publishing invalid Merchant Listing data.
