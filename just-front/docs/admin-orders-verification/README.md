# Orders & cash records redesign verification

Connected `/admin/orders` redesigned using the supplied reference: courier hero, four pastel reporting cards, cream filter panel, desktop table, responsive order cards, read-only detail drawer, loading skeletons and illustrated empty/error states. Existing admin shell, exact UUID lookup, URL lookup state, cash filters and cursor pagination remain intact. Existing demo route remains unchanged.

## Data integrity and API limitations

The existing admin order API supports exact orderId, shopId, cash filter and cursor pagination. It does not provide global aggregates, customer search, date range, order-status filtering or payment-method filtering. Unsupported controls and fabricated statistics/charts were not added. Metric cards explicitly show Reporting unavailable; page amounts are never presented as platform totals. Cash reports, online capture and seller settlement remain distinct. The drawer uses the authorised existing order summary, with no new private account/address/item/proof data fetched and no order mutation.

Fixed the fulfilment display: platform_delivery previously fell through to Seller delivery. Added platform_delivery to the frontend type to match the existing backend response. No backend endpoint or schema changes.

## Checks run

- Full frontend suite: 59 files, 259 tests passed. Existing React act warnings remain.
- Final lint: 0 errors, 23 existing warnings.
- Final TypeScript check and production build passed.
- Nine isolated Chromium checks passed; see browser-report.json. Exact UUID validation/normalisation and URL state, cash filters, clear lookup, read-only details, actual platform delivery, error retry, no browser errors or order mutations, responsive cards/drawer at 768/390/320px verified.
- Final desktop and 320px drawer screenshots visually inspected. No horizontal page overflow in automated checks. Real phones, OS keyboard and screen readers were not tested.
- Browser verification uses temporary labelled QA data and isolated database, not production records. Backend tests were not rerun for this frontend-only change.

## Changed files

- src/components/portal/AdminOrders.tsx
- src/styles/admin-orders.css
- src/domain/admin-orders.ts
- src/test/admin-orders.test.tsx
- scripts/admin-orders-qa.mjs
- public/admin-orders-hero-v1.webp
- docs/admin-orders-verification/*

The courier asset is an AI-generated decorative illustration, not an actual partner record. Source: generated_images/01a18195-8a83-7453-9eca-1b2df859c54a/exec-a9eafb3b-ec47-4326-a9fe-a89ab62e666e.png; resized to 900px WebP. Prompt: friendly Indian delivery partner in forest-green cap/polo holding kraft parcel, pale sage neighbourhood and plants, warm cream background, no words, UI, metrics or real-person likeness.

Remaining backend dependencies: authorised aggregate reporting and genuine server search/date/status/payment filters if these reference controls are required later. Customer details and item-level detail require an explicitly authorised API contract; the view does not infer them.
