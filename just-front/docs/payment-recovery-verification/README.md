# Payment recovery audit — 2026-10-31

## Verified external test gateway results

Only backend test-key allowlist was copied into an explicitly opted-in temporary MongoDB browser QA environment. Live keys fail the QA guard; Atlas, production accounts and provider settings were not modified. No real funds moved. Test bank Success/Failure is Razorpay's official test simulation, not an application-fabricated success.

- Actual Razorpay test order `order_TuQI7o9VNgzWOs`, amount2500paise, isolated marketplace order `709c2cd4-c868-4cbb-8276-27e964baef2c`.
- Official mock-bank **Failure** left the same order unpaid and variant stock4 (initial5, one reserved).
- Official mock-bank **Success** on that same order produced captured provider payment `pay_TuQUaTO1E5kyR5`; marketplace state paid, amount due0, stock still4. Reload showed captured state with test/do-not-fulfil labelling. No second marketplace order or additional stock deduction.
- Provider GET confirmed one failed attempt, one captured attempt and earlier created/incomplete attempts. Pending/created attempts did not become marketplace-paid.
- Buyer cancellation restored stock once to5 and created one ₹25 refund obligation for suborder `29fea7a6-4785-4c21-b71c-cf1d92a04dc8`.
- **Refund did not complete.** Exact same immutable request/key was rejected by actual provider with HTTP400 `BAD_REQUEST_ERROR`, description `invalid request sent`. Provider refund-list GET returned empty and captured payment amount_refunded0. No provider refund ID was created; local obligation remains uncertain. No header removal, new refund key, changed body or fabricated processed state was used to bypass this failure. Root cause at provider/account boundary remains unresolved; do not assume account configuration or endpoint is the cause without further evidence.

Evidence: `test-failure.json`, `test-success.json`, `test-refund.json`, mock-bank and after-result screenshots. `buyer-refund.png` shows honest uncertain state. Screenshots contain only invented isolated QA identity/address, public transaction IDs and no secrets.

## Fixed

1. Checkout GET now refuses an obsolete payment account; otherwise a buyer could reopen old-account checkout while current backend could not reconcile it.
2. Payment status panel refreshes saved state every15secs while active (stops at paid), refetches on focus and blocks immediate repeated opens. Disabled/uncertain states have no pay button.
3. Signed malformed webhook JSON returns structured400; event completion is atomically keyed by eventID+digest and reports conflicting digest insertions.
4. Provider rejection is distinguishable from outage without exposing raw provider data. Refund rejection records manual-review metadata and sanitized audit code, preserves original obligation/key and never claims processed/bank credit.

## Automated verification

Frontend: 55 files /239 tests passed, including repeated-open guard, dismissal/retry, disabled/uncertain orders and recovery of captured saved state. Backend: 7 files /182 tests passed; typecheck, lint and build passed after the final changes. Tests use temporary MongoDB and explicit provider HTTP doubles; they do not prove provider refund success.

Expanded backend scenarios: failed/created/authorized stays unpaid; pending webhook503 is not consumed; late capture concurrent with duplicate webhook and buyer reconciliation posts once; one seller notification and one stock deduction; stale failed attempt cannot downgrade paid; processed refund cannot be downgraded by old failed events; malformed signed JSON400; changed event digest409; rotated-account checkout409; provider rejection privacy; refund rejection preserves obligation and flags review. Existing tests additionally cover signature tampering, amount/identifier mismatch, lost create response/idempotent order recovery, refund lease/key retry, concurrent cancellation, inventory restoration and worker backoff/no refund submission.

Frontend lint/typecheck/build passed (23 existing lint warnings,0errors). Some pre-existing React act warnings remain in full tests. No production worker, production index migration or live financial action was run. QA processes are stopped after checks.

## Remaining launch gates

- Actual processed **test refund**, and same-refund retry/recovery at provider, are NOT verified. Check this exact test payment/refund request in Razorpay dashboard/support; preserve original key/body and investigate before further submission. No live refunds should be enabled based on this audit.
- Actual Razorpay dashboard→public HTTPS webhook delivery, dashboard event retries and secret configuration are NOT verified. Local signed/concurrent webhook tests passed, but do not prove external delivery. No tunnel/hosting/dashboard settings were changed.
- Bank credit, live capture, provider settlements, real-device payment methods and production load are NOT tested.
- Unpaid/failed checkout alone does not safely release committed inventory: the same provider order may still capture later. Existing operator review is required for old unpaid orders; no automatic cancellation was introduced.
- Test card flow did not advance in the automated browser; official test netbanking did complete. This report does not claim card/UPI method coverage.

## Reproduction and changed files

Backend QA: `ALLOW_ISOLATED_BROWSER_QA=true ALLOW_RAZORPAY_TEST_QA=true npx tsx scripts/browser-qa.ts` (set PowerShell environment variables separately). Only `rzp_test_` accepted, generated local webhook secret, no production Mongo URI. Frontend QA: `VITE_API_URL=http://localhost:4001 npx vite --config vite.qa.config.ts`.

`QA_BANK_OUTCOME=Failure` or `Success` with `node scripts/payment-checkout-qa.mjs` uses same existing isolated order. Refund script defaults to observing saved state; `QA_REFUND_SUBMIT=true` explicitly opts into test cancellation/submission, always same obligation/key. Do not loop retries against the unresolved rejection.

Backend changed: `src/payments/razorpay.ts`, `src/payments/refunds.ts`, `test/phase1.test.ts`, `scripts/browser-qa.ts`, `docs/PAYMENT_RECOVERY_AUDIT.md`. Frontend changed: `src/components/store/OnlinePaymentPanel.tsx`, `src/test/online-payment-panel.test.tsx`, `scripts/payment-checkout-qa.mjs`, `scripts/payment-refund-qa.mjs`, `docs/API_CONTRACT.md`, this evidence directory. No schema migration or frontend architecture change.

Official references checked: [Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps), [official test payment behaviour](https://razorpay.com/docs/payments/payments/test-card-details), [idempotent normal refund](https://github.com/razorpay/markdown-docs/blob/master/api/refunds/normal-refunds-idempotent.md), [webhook duplicates](https://github.com/razorpay/markdown-docs/blob/master/webhooks/validate-test.md).
