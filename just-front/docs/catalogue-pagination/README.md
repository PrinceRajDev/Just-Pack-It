# Catalogue pagination verification

Implemented area-first public discovery with 24-item cursor pages, explicit Load more and retry preserving loaded records. Product owner identity hydration uses the additive bounded public API. No frontend architecture or branding replacement.

Verified on 2026-10-31: frontend 211 tests / 48 files; backend 153 tests / 7 files, isolated temporary MongoDB. Frontend and backend builds/typechecks pass. Backend lint passes; frontend lint exits successfully with 23 existing warnings and zero errors.

Mobile Chromium smoke (`node scripts/catalogue-pagination-smoke.mjs`, isolated browser-qa backend on4001 and QA frontend on8083) passed eight assertions. Pagination pages and failure responses are simulated in the browser; area/shop identity comes from isolated QA API. This is not a production volume/load test. Service tests separately exercise cursor chaining, scope reset and owner batch requests; backend tests exercise bounded shop identity validation and eligibility/privacy.

Remaining scope: management/order list readers still use existing full pagination. Taxonomy/areas remain configuration lists. No throughput benchmark or production-sized dataset run. New `/catalogue/shops/by-ids` must be deployed with the frontend.
