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

## Automatic regeneration after approved edits

The workflow `.github/workflows/catalog-auto-refresh.yml` runs after changes
to the menu source or CMS price/campaign files reach `main`. It generates
`cms/catalog-v1.json` and `cms/product-ids.json`, validates their full parity,
and commits the generated files through the GitHub Actions bot only if changed.
It requests a GitHub Pages rebuild after committing. If the repository denies
Actions write access or Pages rebuild permissions, the workflow reports the
failure/warning in GitHub Actions; do not assume automatic publishing succeeded
until a real CMS edit has been validated end-to-end.

**Important:** the customer-facing QR website still reads the same original
JavaScript and public CMS files; the new JSON is additive. The Windows POS
integration reads immutable IDs and localized text/image paths from the catalog,
and overlays LIVE `cms/menu-prices.json` and `cms/campaigns.json`. As a result,
ordinary CMS price and campaign changes do not wait for catalog regeneration
to reach the POS. A newly-added, renamed or removed product needs a consistent
source update and stable-ID export; until the generated catalog matches the
public CMS keys, POS refuses the import and keeps its previous local prices.

**No automatic destructive deletion:** local POS-only products are kept. The
same numeric ID is never reused, and existing order lines/financial records
remain historical snapshots. Photos in the catalog are source assets; the POS
needs internet to show a newly downloaded image and provides an offline icon.

## Deployment checks

1. Confirm catalog workflow and Pages deployment succeeded after actual CMS
   edits; check the committed JSON diff and the live public URL.
2. Confirm Flutter Windows CI succeeds and the stable IDs 0–52 align with the
   existing restaurant SQLite menu.
3. Make a SQLite backup, then install the new Windows build and verify prices,
   product names, images, offline behavior and historical paid orders.
4. Keep the `QR Menü otomatik eşitleme` switch off if the restaurant prefers
   owner-only local price overrides.
