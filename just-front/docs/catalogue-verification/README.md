# Catalogue admin redesign — 2026-10-31

Connected `/admin/catalog` now uses the shared cream/forest-green admin visual language, editorial heading, decorative basket hero, pastel statistics, moderation table/mobile cards, read-only listing summary with confirmed moderation, compact taxonomy rows and expandable subcategory summaries. Category creation and existing category/subcategory management live in an accessible side drawer instead of permanent large forms. Admin shell/sidebar/topbar/notifications/profile/logout/routes and the existing demo route are preserved.

## Data integrity

No backend, authentication, purchasing or API service changes. Existing admin-only calls and expected version fields retained. Global product totals are unavailable in the existing API and remain explicitly unavailable, never inferred from a filtered or partially paginated list. Active category count uses the actual complete admin taxonomy response. Seller-active is not represented as proof of public availability.

Product name search is the actual escaped literal server search. Shop-name/ID search, global reporting, thumbnails, category, MRP, detailed variants, inventory, shop approval status and owner information are not in the moderation DTO; unsupported columns/controls are omitted and detail limitations explained. The date column is specifically Last admin decision, not a fabricated product update time. No row selection/bulk actions are offered because they are unsupported. Base listing price and actual active variant count shown. The detail drawer reuses the existing authorised summary rather than fetching public/seller data with inappropriate scope.

Moderation requires a 3–500 character seller-visible reason and explicit confirmation, supports cancel, prevents duplicate requests using a ref lock and disabled controls, retains reason on error, refreshes moderation and product caches on success, and reports the actual response. Block is listing-specific and independent of seller active/stock/price fields; existing orders remain untouched. A list refresh/error disables mutation against stale loaded data. The existing backend independently enforces admin authorization and version checks.

Taxonomy retains name/slug/ID/subcategory search and active/inactive filter. New slug generated until manually edited, with pattern validation. Existing slugs and IDs stay immutable. Existing category add/edit, subcategory add/rename/deactivate/reactivate, category deactivate/reactivate and API validation/version failures retained. Deactivation requires confirmation; backend refusal for referenced entries is preserved. Inactive parent/child editing restrictions retained. New category drawer closes only on successful save; failed saves preserve the draft and show the API error. Category counts refresh through the existing query invalidation.

## Verification

Full frontend regression: 60 test files / 262 tests passed. Final lint: 0 errors / 23 existing warnings. Final TypeScript check and production build passed. Existing React act and Vite configuration warnings remain. Results are recorded in the accompanying browser-report.json and project catalogue-*.log files. Browser checks use isolated temporary QA database/API on port4001 and frontend on8083, not production or the user's existing8081 session. No production data, provider, deployment or infrastructure changes.

13 Chromium checks passed: real isolated records and unavailable reporting; server name search/no-results/clear; confirmed moderation cancel/block/unblock; blocked filter; category create/generated slug; category edit and subcategory add/rename/deactivate/reactivate; category deactivate/reactivate; taxonomy search/status; responsive cards/drawer at768/390/320; failed refresh/retry; no browser page errors. Desktop and320px details visually inspected. Browser-created taxonomy records remain only in the temporary database and disappear when the QA server stops. No physical phone, OS keyboard or screen-reader test is claimed. Existing backend tests were not rerun for this frontend-only change.

## Changed files

- src/components/portal/AdminCatalogue.tsx: connected page composition and honest statistics.
- src/components/portal/CatalogueModeration.tsx: moderation presentation, drawer and confirmation.
- src/components/portal/AdminTaxonomy.tsx: extracted existing taxonomy forms, compact rows and drawer.
- src/components/portal/AdminWorkspace.tsx: re-export existing moderation entry point; audit/reconciliation unchanged.
- src/components/portal/LiveAdmin.tsx: catalogue dispatch, removal of extracted taxonomy.
- src/styles/admin-catalogue.css: scoped responsive styles and reduced-motion support.
- src/test/admin-audit.test.tsx, src/test/admin-support-expansion.test.tsx: existing regression tests updated for drawer/confirmation interaction.
- src/test/admin-catalogue.test.tsx: API-derived count, unavailable reporting, filter/error draft retention and slug generation/override tests.
- scripts/catalogue-qa.mjs and docs/catalogue-verification/*: reproducible isolated browser evidence.
- public/admin-catalogue-hero-v1.webp: generated decorative raster artwork, not a product record.

## Asset provenance

Generated via imagegen, source C:/Users/hp/.codex/generated_images/01a18195-8a83-7453-9eca-1b2df859c54a/exec-0a45c9e9-f863-451f-ab41-10983c506c0a.png. Optimised to900px WebP. Prompt: premium decorative forest-green market basket with fresh vegetables, milk and pantry goods, sage leaves, cream paper background and soft pale yellow shapes, no words/UI/metrics/people. Used only as decorative hero, through imageUrl().

## Remaining API dependencies

For expanded reference features later: authorised complete aggregate counts; shop/ID search; richer admin product detail endpoint including exact category/variant/stock/image and actual product updatedAt; bulk-action API if requested. No invented endpoint or contract changes were introduced for these absent capabilities.
