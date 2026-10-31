# Payment operations — design before implementation

Refund follow-up: admin payment details now include an explicitly confirmed, separately gated shop-wise refund workflow. Pre-preparation paid seller cancellations create refund obligations and return stock atomically; see `REFUNDS.md`. Payment rechecks still never initiate refunds—the separate refund submit command does. Actual provider refunds remain unverified and no real financial operation was performed during implementation.

Extend the existing admin portal, without replacing demo finance screens. A paginated, admin-only online payment list/detail shows server-held state, amount, test/live label, provider identifiers and whether the currently configured account matches. Listing works while checkout is disabled so existing uncertain records remain visible. Provider rechecks still require enabled/configured Razorpay credentials.

Reconciliation only fetches provider state and applies the existing verified-capture rules. It never creates a new provider order, captures a payment, refunds or releases inventory. An uncertain provider-order mapping additionally requires an explicit operator acknowledgement and reason. The backend must fetch the proposed provider order and verify receipt, amount, currency and account before attaching it. An already-attached different ID must be rejected, not silently ignored.

Persist operator attempt/success/failure audit entries, excluding secrets and provider response bodies. Show recent sanitized entries on detail. Signed cursor pagination is bound to state and mode filters; no global financial totals are implied. Customer identity/address, API keys, webhook secrets and receipt proof are excluded. All endpoints stay behind backend admin authorization and private/no-store headers. Test records remain clearly labelled. Production credentials, infrastructure and live checkout flags are unchanged.

## Implemented

- Connected `/admin/finance` is labelled Online payments and supports state/mode filters, cursor pages, on-demand details, safe recheck, confirmed missing-mapping recovery and recent sanitized audit events. Demo finance/coupon routes remain unchanged.
- `GET /admin/payments` and `GET /admin/payments/:orderId` work while checkout is disabled. They read stored records without contacting the provider. Money is integer paise in these DTOs; frontend displays INR.
- Existing `POST /admin/payments/:orderId/reconcile {}` remains valid. Mapping a provider ID additionally requires `confirmProviderOrder:true` and `reason` (3–300 characters); a different existing mapping is rejected. Verified binding and its audit entry commit together. Provider reads and verified capture recording reuse the existing verification service.
- `PaymentAudit` stores internal actor ID and operator reason plus separate attempt, bound, result and failure entries. Detail exposes at most 20 sanitized events, without actor/reason/secret data. A started entry without a result after a crash means the operator should inspect/recheck; it is not success.

Credential presence was inspected without displaying values: the three Razorpay credentials were absent and activation flags were off. Actual Standard Checkout/provider webhook tests remain pending. No production database, keys or flags were changed. No provider order, refund, capture, payout or settlement was initiated.

Backend tests cover admin-only access, disabled-mode reads, privacy, state/test/live filtering, signed cursor isolation, confirmed mapping, amount mismatch, replacement rejection and audited recovery. Frontend tests cover acknowledgement/reason gating, mismatched/disabled-account actions, pagination reset and error retry. Provider HTTP responses are isolated test doubles only.

Changed backend: `src/payments/razorpay.ts`, `scripts/create-indexes.ts`, `test/phase1.test.ts`, payment/API documentation. Changed frontend: `src/domain/admin-payments.ts`, `src/services/admin-payments.ts`, `src/components/portal/AdminPayments.tsx`, `src/components/portal/LiveAdmin.tsx`, `src/routes/admin.tsx`, `src/test/admin-payments.test.tsx`, browser QA runner and contract documentation. No dependency or frontend architecture changes.

Remaining: real Razorpay test credentials, public HTTPS webhook setup and actual provider test payment; refund and abandoned-order closure workflows; seller settlement/Route and dispute operations before live launch. No live activation occurred.

## Verification results

Backend: `npm run typecheck`, `npm run lint`, `npm test` (97 tests/four files) and `npm run build` passed. Frontend: `npx tsc --noEmit`, `npm run lint` (zero errors, 22 existing Fast Refresh warnings), `npm test` (126 tests/27 files) and `npm run build` passed. A test fixture's initial TypeScript literal inference was corrected before the final typecheck passed.

Isolated headless Chromium passed the existing full buyer/seller COD journey and the new connected admin finance route, filter controls, accurate empty state and 390px mobile width while Razorpay is disabled. Populated reconciliation forms are covered by component tests and isolated API integration tests; actual provider interaction is not browser-verified. Evidence: frontend `docs/browser-qa/report.json` and `admin-online-payments-empty.png`. Temporary QA servers were stopped after verification.
