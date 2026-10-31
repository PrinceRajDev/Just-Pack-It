# Checkout regression audit — 2026-10-30

Scope: real connected frontend against explicitly labelled temporary MongoDB replica-set fixtures. No Atlas, real shoppers, physical fulfilment, live Razorpay, Cloudflare or email used. Chromium mobile 390x844. Browser storage seeded with real isolated product/variant IDs to exercise checkout; existing GPS/category/product navigation additionally rerun separately. No application implementation changes required from the successful COD matrix; test runners/fixtures repaired.

## Verified browser matrix
1. Pickup selection: explicit owned address and eligible pickup reaches final review with 25 INR payable. No automatic purchase.
2. Mixed shops: 500 g variant from shop 1 costs25; independent listing from shop2 costs60 + seller delivery10 =95. Two shop-wise suborders. Stock reduced only requested listing/variant; 5→4 and4→3.
3. Double-click: two rapid button clicks produced exactly one POST, one order and one stock deduction.
4. Closed shop after quote: submission rejects SHOP_UNAVAILABLE; no new order.
5. Variant stock changed after quote: rejects INSUFFICIENT_STOCK; no new order.
6. Variant price changed after quote: rejects PRICE_CHANGED; no new order at stale total.
7. Address changed after quote: rejects ADDRESS_CHANGED; no new order.
8. Selecting another address clears previous fulfilment selections and removes the submit button until re-review.
9. Changing service area preserves cart, but old-area checkout is not placeable.
10. Offline-like POST failure before receipt: local attempt stays unresolved, cart stays; reload then existing account recovery link submits original request with same key/payload, creates exactly one order and removes purchased cart lines after confirmation.
11. Lost response after server commit: order exists but local attempt stays unresolved/cart intact. Reload/account recovery returns existing order with same key/payload, no duplicate order or additional stock deduction.
Matrix groups cases2/3 together: 10 scenario records. Exact report docs/checkout-regression/report.json; pickup screenshot visually inspectable in same directory. Zero browser page errors across final matrix. Post failures simulated with network abort; not a full OS/network-disconnect test.

## Earlier pickup timeout investigation
Old followup runner reproduced a pickup timeout initially. Fresh isolated checkout selection passed and GPS→checkout later reached actual placement/cancellation. A deterministic product defect was not established for the original timeout; do not claim a speculative cause. Runner issues confirmed: admin overview assertion expected4 queues although current UI has5; repeated GPS address labels made address radio locator ambiguous on reruns. Updated count and unique per-run address labels, retained normal radio interactions and added failure screenshot/body diagnostics. Reload intentionally does not restore address/method form selections; existing recovery is accessed from account link, not an assumed inline checkout button.

## Automated coverage
Focused frontend tests: cod-recovery, cod-confirmation, checkout-review, fulfilment-review, live-cart, online-payments and cart-purchase-cleanup:29 tests passed. Covers unknown network outcome, persistent exact request replay, tab locks/storage/account isolation, version mismatch, unavailable options, server blockers and paid-cart cleanup. Backend full-suite results recorded after final run. QA launcher code type/lint checked; mutation controls only exist under both explicit isolated launcher and QA_CHECKOUT_REGRESSION=true, not in production app.

## Limits / remaining work
- Real Razorpay Standard Checkout, actual capture/webhook timing/refund and bank outcomes not tested. Focused online service tests are not provider certification.
- Offline scenario aborts order POST and then replays; no physical mobile connectivity/OS-kill/Safari test.
- Reload recovery works through Account; checkout form selections are not persisted. UX opportunity: surface unresolved-attempt recovery nearer checkout, while never auto-resubmitting.
- Cart/price review does not reserve inventory. Server validation protects stale reviews, not guaranteed stock availability before submission.
- No large-catalogue/load test or production-infrastructure changes.
- Existing single-device session, Web Locks/local storage prerequisites and shared-browser cart policy remain documented limitations.

Changed files: just-back/scripts/browser-qa.ts (opt-in isolated mutation fixtures + explicit shop array type); just-front/scripts/checkout-regression.mjs (new runner), scripts/followup-qa.mjs (stale count/duplicate selector fixes + diagnostics), reports/docs. No production frontend or backend business logic modified.


Final original followup runner passed: GPS address confirmation, pickup COD placement, shop-wise buyer cancellation, five empty admin queues and honest missing-Brevo recovery. Therefore the old checkout audit is no longer left as an unresolved verification failure; the initial intermittent pickup timeout itself has no proven product root cause. Current connected sequence and dedicated regression matrix pass without forced clicks or bypassed validation.
Backend verification:148 tests/7 files passed; typecheck, lint and build passed after QA fixture type correction. Focused frontend29 tests/7 files passed. Full frontend final run recorded below. Mobile screenshot visually inspected; full-page screenshots do not replace real-device viewport testing.

Full frontend final suite:191 tests across43 files passed. Existing GPS React act warnings remain; no assertions failed. No frontend application code modifications from this audit.
Final frontend TypeScript, full error-level lint and production build passed. Both isolated QA servers stopped; no live database/provider operations performed.
