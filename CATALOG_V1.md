# Nohut Falafel — Catalog v1 (additive, backward-compatible)

## Status and safety

**This is a sidecar data feed. It does not replace the live QR menu.**
The existing `index.html`, `menu-data.js`, `menu-ar.js`, `menu.js`,
`cms-live.js`, CMS pricing, campaign renderer, assets, and QR URL are
left unchanged. The restaurant's customers keep seeing the current site.

Files introduced:

- `cms/catalog-v1.json` — versioned public snapshot with **53 products**,
  nine navigation categories, three campaign records, Turkish/English/Arabic
  names and descriptions, CMS prices, and image asset paths where available.
- `cms/product-ids.json` — permanent numeric ID registry. Original Flutter
  products preserve their integer IDs **0–50**. **Vegan Dürüm = 51** and
  **Layali Lübnan = 52**.
- `scripts/generate-catalog.mjs` — derives both JSON files from the current
  QR sources and validates name/category compatibility and image paths.
- `scripts/catalog.test.mjs` and GitHub Actions — fail when the exported
  JSON differs from current source, IDs collide, prices diverge, or a directly
  referenced image is missing.

## Field contract

```json
{
  "schemaVersion": 1,
  "source": "nohutfalafel/qr-menu",
  "currency": "TRY",
  "categories": [
    {
      "id": "wrap",
      "name": {"tr": "Dürümler", "en": "Wraps", "ar": "السندويشات"},
      "description": {"tr": "...", "en": "...", "ar": "..."}
    }
  ],
  "products": [
    {
      "id": 0,
      "category": "wrap",
      "name": {"tr": "Falafel Dürüm", "en": "Falafel Wrap", "ar": "سندويش فلافل"},
      "displayName": {"tr": "Falafel Dürüm", "en": "Falafel Wrap", "ar": "سندويش فلافل"},
      "description": {"tr": "...", "en": "...", "ar": "..."},
      "price": 140,
      "image": "assets/wrap-cutouts/wraps-transparent.webp"
    }
  ],
  "campaigns": []
}
```

The example is illustrative; the actual file retains the complete, exact
restaurant text and campaigns. `image` is a relative path to the **source
asset**, not a guarantee of the original website's crop/SVG presentation.
Two items (**Karışık Meze Tabağı**, **Patlıcan Kızartması**) have no direct
product-specific image path in the source; their `image` is `null`.
Their **current website illustrations remain unchanged** because
`menu.js` is not replaced.

Descriptions preserve the website's existing **text**, not a normalized
list of allergen-safe individual ingredients. Do not infer allergies,
vegan certification, or exclusions from this export.

## Update instructions

1. Make menu/CMS changes using the **existing authorized workflow**.
2. From the QR repository root, with Node.js 22 or later:
   - `node scripts/generate-catalog.mjs --write`
   - `node scripts/generate-catalog.mjs --check`
   - `node --test scripts/catalog.test.mjs`
3. Review and commit changes to the catalog and ID registry together.
4. Keep any existing product's numeric ID forever. When renaming a product,
   **change only the name key in `cms/product-ids.json`, retaining the ID**,
   then regenerate. The generator deliberately refuses disappeared names
   until their ID migration has been reviewed. New products get the next ID.

**Important:** Pages CMS currently updates `cms/menu-prices.json` and
`cms/campaigns.json` independently. It does **not yet** regenerate this
sidecar automatically. Until an approved post-CMS regeneration/deployment
workflow exists, `catalog-v1.json` is a versioned snapshot, not the
real-time price source. The current QR website keeps reading the live CMS
files; the existing Flutter price-sync prototype also keeps using them.

## Next step (requires separate review)

Add an authenticated, reliable post-CMS export/deploy process so the catalog
regenerates after approved price, campaign, product, or image updates.
After that, migrate Flutter's reader to stable `id` matching (with an
explicit legacy-ID verification), keeping old order-line prices untouched.
Never install a new POS build on the restaurant laptop without CI, database
backup, and operator acceptance testing.
