# Cash remittance and seller settlement verification

Date: 2026-10-31. Policy confirmed by owner: zero commission, seller-delivery fee to seller, platform-delivery fee to platform, full partner COD handover, manual seller bank/UPI payout.

## Implemented

Admin finance ledger reviews delivered proof, posts balanced paise journals, confirms cash only after partner handover acknowledgement, prepares one durable payout intent, and records an actual external transfer reference. Seller settlement statement is read-only and shop-scoped. Delivery cash view shows own full collection and admin receipt; cash collection is not partner earnings. Already-retained seller COD never creates another payable. No automatic transfer or bank verification is claimed.

Source snapshots, custody receipt and payout journals commit transactionally with audit. Duplicate submissions recover the same record; unique normalized references prevent cross-source reuse. Missing proof, source changes, refunds and unresolved support block payout. Required unique reference indexes fail closed.

## Verification

- Frontend: 54 files / 236 tests passed; TypeScript passed; lint 0 errors (23 existing warnings); production build passed.
- Backend: 7 files / 176 tests passed; typecheck, lint and build passed. Temporary isolated MongoDB replica set, no production database.
- Browser: 14 settlement checks passed in Chromium, including complete partner/admin/seller flow, three balanced journals, no second payout intent, readonly ownership and 390px overflow checks. Earlier isolated delivery fixture completed 11 checks. All cash/transfer acknowledgements in these fixtures were simulated; no real funds or provider transfer requests.
- Latest additional backend regression covers normalized-reference formatting, foreign delivery access, cursor scope and rejected caller amounts. Online receipt proof is required alongside live capture proof.
- Mobile admin screenshot inspected. Actual bank settlement, real cash handover, real live Razorpay payment, iOS/Android hardware and screen-reader testing were not performed.
- Existing React test act warnings remain; tests completed successfully.

Browser evidence: [report](browser-report.json), [admin mobile](mobile-admin-ledger.png), [seller mobile](mobile-seller-statement.png).

## Changed files

Backend: `src/settlements/models.ts`, `service.ts`, `routes.ts`; `src/orders/models.ts`; `src/app.ts`; `src/server.ts`; `scripts/create-indexes.ts`; `scripts/browser-qa.ts`; `test/phase1.test.ts`; `docs/SETTLEMENT_LEDGER_DESIGN.md`.

Frontend: `src/domain/settlements.ts`; `src/services/settlements.ts`; `src/components/portal/SettlementLedger.tsx`, `LiveAdmin.tsx`, `LiveSeller.tsx`, `LiveDelivery.tsx`, `AdminWorkspace.tsx`; `src/routes/seller.tsx`; `src/test/settlement-ledger.test.tsx`; `scripts/settlement-regression.mjs`; `docs/API_CONTRACT.md`; this evidence directory.

## Operational boundaries

Before production use, review and create declared backend indexes using `npm run db:indexes`; no production migration was run. Prepare intent before external transfer; on an uncertain result investigate the same intent, never send another transfer merely because a browser request failed. References and admin confirmation do not prove bank receipt. External payee verification remains manual.

No partner compensation policy, batch/partial netting, bank feed/opening balance, automatic reversal/adjustment, cash deposit or automatic transfer is implemented. Post-payment disputes require operator investigation. This is an operational source ledger, not a comprehensive accounting system. No credentials or production infrastructure were changed.
