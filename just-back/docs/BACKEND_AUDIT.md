# Local backend audit — 2026-10-30

Scope: existing implemented backend, without hosting/deployment, production record changes, real charges/refunds or infrastructure mutations. Reviewed routes, authentication/authorization, catalogue relationships/visibility, inventory/order/receipt/payment/refund/recovery boundaries, image adapter, configuration and startup checks. Automated tests use an isolated MongoDB replica set and explicit external-provider doubles.

## Verified evidence

Final commands: `npm run typecheck` passed; `npm run lint` passed with zero errors/warnings; `npm test` passed **115 tests in six files**; `npm run build` passed. Backend dependency audit passed with zero known advisories. Browser regression passed all nine recorded steps. Final suite showed no Mongoose deprecated `new` option warnings after the address-option fix. Frontend application tests/build were not rerun because this audit did not change frontend application code; actual frontend/backend integration was exercised by the isolated browser run.

| Domain | Verification |
| --- | --- |
| Auth and roles | Database-backed session expiry/active-user roles, buyer/seller registration, protected seller/admin actions, secret exclusion, invalid input and throttling regression tests. Auth and protected responses now explicitly private/no-store. SMS OTP remains unavailable rather than fabricated. |
| Catalogue | Owner-only shop/listing/variant mutations, versions, taxonomy references, unapproved/inactive visibility, independent same-name listings, area/category/search/sort/cursor filters covered by isolated integration tests. |
| Cart/addresses | Owned address/version/coverage, selected fulfilment, current prices/stock/minimum/fees, invalid options and inactive category/subcategory handling covered. Quote remains non-reserving; placement re-prices. |
| Inventory/COD | Last-unit/concurrent requests, holds/expiry/backoff, duplicate-key order recovery, committed reservations, shop cancellations and exact-once restock, seller processing and receipt-code expiry/lockout/handoff covered. |
| Razorpay | Provider authentication plus actual test gateway order create/read passed previously. Signature/amount/currency/order/payment matching, authorized-versus-captured, callbacks/replay, uncertain creation and test/live boundaries tested with provider doubles. Actual gateway capture/public webhook delivery remains unverified. |
| Refund/recovery | Atomic pre-preparation cancellation/obligation/restock, explicit admin submission, immutable refund key/body, provider-ID/amount matching, duplicate/out-of-order events, pending/processed distinctions, worker leases/backoff/GET-only checks covered with isolated doubles. Actual provider refund/bank credit unverified. |
| Images | Existing Images adapter regressions and R2 owner/version/file decoding/size/concurrent cleanup tests. Actual R2 seller-browser upload/replace/reload/public WebP loading previously passed; two test objects were deleted. No real listing was changed. |
| Runtime/config | TypeScript/lint/build, structured errors, config validation, liveness/readiness and worker scheduling tests. Docker build/run remains unverified because Docker is unavailable; hosting not pursued per user instruction. |

Configured MongoDB was inspected **read-only with autoIndex disabled**: replica-set connection passed, critical auth/catalogue indexes passed, order uniqueness/no-TTL checks passed, payment uniqueness/pending-order checks passed, refund uniqueness passed, recovery due indexes passed. No records or indexes were created/changed/deleted. This is connectivity/index evidence, not backup/restore or production-load verification.

Fresh backend `npm audit --json`: zero known vulnerabilities in all severities. This does not imply no application security defects.

The complete fresh headless Chromium local journey passed against isolated fixtures: category/area discovery, independent shops/variants, mobile selection, multi-shop COD, lost-response same-key recovery without duplicate order, seller pickup/delivery receipt/cash handoff, exact stock decrement, admin cash/taxonomy/payment empty-state views. Evidence: frontend `docs/browser-qa/report.json`. No live provider calls in this regression. This run does not include an actual Razorpay browser payment.

## Bugs/hardening fixed during audit

1. Auth responses and all authenticated-route responses lacked a shared explicit private/no-store policy; added it to auth routes and authentication middleware, including rejection paths.
2. Payment fetch verification matched parent order/amount but did not explicitly compare returned payment ID with requested ID; now rejects mismatched identifiers, and order-payment list matching requires payment-type IDs.
3. Refund fetch/event verification did not explicitly compare returned refund ID with requested ID before local attachment; added exact-ID checks.
4. A crash between test order creation and payment mapping could resume under a live account with the same key; a persisted test/live-mode guard now rejects this before provider creation. Existing account-ID guard remains.
5. Inactive subcategory products could still appear priced in cart quote although final placement rejected them; quote now returns unavailable with no price/subtotal contribution.
6. Production ordering startup verified order indexes but not inventory-ledger no-TTL/recovery indexes; now verifies both before listening.
7. Replaced deprecated address `findOneAndUpdate({new:true})` option with `returnDocument:"after"`; no behavior change intended.

Added focused regressions for auth cache policy, mismatched payment/refund identifiers, test/live recovery gap and inactive-subcategory cart quote. An initial new test used `/cart/review` instead of the existing `/cart/quote`; corrected the test, preserving the actual API contract. A concurrent earlier suite run saw the cache-header assertion before the middleware edit completed; final rerun is authoritative.

## Remaining gaps and limits

- Actual Standard Checkout test payment/capture, signed public Razorpay webhook delivery, real test-mode refund and bank/provider behaviour are not verified by HTTP doubles or order-creation success.
- Unpaid/abandoned online orders retain committed stock; no safe automated closure/release workflow exists. Modal close/timeouts do not authorize restock or COD conversion.
- Platform rider assignment, verified SMS/phone authentication, post-preparation return/dispute handling, exceptional failed/external-dashboard refunds, seller settlement/Route and accounting are not complete backend features. Seller-managed delivery/pickup COD and prepaid handoff are implemented; this is not a completed platform-delivery system.
- Promotions/coupons and online marketplace split settlement must not be inferred from demo screens. Current server policy is tax included, listed shop delivery fee, no added platform fee/discount.
- Backup restoration, load/failover testing, multi-instance ingress/rate-limiter/proxy design, worker supervision and production HTTPS/custom image domain remain unverified. No hosting action is requested/performed here.
- Retained replaced images/orphans need later reference-aware cleanup; arbitrary bulk storage deletion is not implemented.

Changed application files: `src/auth/routes.ts`, `src/auth/middleware.ts`, `src/payments/razorpay.ts`, `src/payments/refunds.ts`, `src/cart/routes.ts`, `src/server.ts`, `src/addresses/routes.ts`; tests `test/foundation.test.ts`, `test/phase1.test.ts`; this audit and API contract notes. Frontend application code, credentials and financial activation flags unchanged. Isolated QA processes stopped after checks.
