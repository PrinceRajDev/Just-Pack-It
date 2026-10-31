# Live cart review

Verification on 2026-10-29: frontend 71 tests across 15 files and backend 53 tests across 3 files passed. Both typechecks/builds and backend lint passed; frontend lint has 0 errors and 22 existing Fast Refresh warnings. Tests cover independent same-name shop listings, strict payload/duplicate checks, unrelated variants, area/private-data boundaries, paise arithmetic, closed/short/minimum issues, price acknowledgement and preserved failure/removal states. No real inventory, orders or payments were modified. Live populated-cart verification remains dependent on real approved listings.

API mode now supports adding products/options to a locally persisted bag and reviewing them at `/cart` against server catalogue data. Demo routes remain unchanged. Shop/product/variant identity stays independent across listings; product names are never used as keys.

The cart requires the selected service area before calling public `POST /cart/quote`. Request payloads contain only area ID, product/variant IDs and quantities; local `acceptedPrice` is stripped. Returned public DTOs populate existing lookup caches so restored cart lines can be adjusted without mock fallback. Unit/line/shop prices and stock come from the server. INR formatting retains up to two decimals instead of rounding paise away.

Closed shops, shortages, unknown/removed products/options and known minimums are explicit. Buyers can remove lines, reduce excess quantities and acknowledge changed prices locally. Failure retains the bag and exposes retry/removal; it does not substitute demo data. Refocusing/refreshing can request a new review. An issue-free response still does not enable checkout.

Item subtotal includes all priceable requested quantities, even if closed/short; unpriced unavailable lines are excluded. Listed delivery fees and shop fulfilment choices are informational. Delivery, taxes, discounts and grand total remain unquoted. There are no reservations, orders, payments or guaranteed prices in this flow. Checkout route remains guarded until an independent transactional implementation exists.

Local storage is optional; malformed quantity records are ignored, canonical product/variant keys are rebuilt, and browser write failures keep the cart in memory. Cart additions are capped at 100 distinct lines and whole quantities up to 999, matching the backend. Server validation is authoritative.

Changed sources: frontend domain `cart-review.ts`, `services/cart-review.ts`, catalogue cache adapter, `components/store/LiveCart.tsx`, `QtyStepper.tsx`, cart route/store, currency formatter and API/cart tests. Backend adds `src/cart/routes.ts`, mounts it in `src/app.ts`, documents the contract and adds isolated quote regressions. No database writes or real orders were made to exercise this change. A full live shopping journey still needs actual approved shops/products; automated tests use fixtures and mocked frontend responses.
