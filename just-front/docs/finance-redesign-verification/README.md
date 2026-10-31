# Payments & refunds redesign — 2026-10-31

Connected `/admin/finance` redesigned to match the existing overview, sellers, orders and catalogue admin visual language. Shared sidebar/topbar/search/notification/profile/logout/routes and the existing demo-only route remain unchanged. Added compact illustrated hero, four pastel unavailable-reporting cards, desktop financial tables, responsive cards and accessible settlement/payment drawers.

## Financial accuracy and preserved behaviour

No production backend service, domain model, API, credentials, environment or payment policy changes. No checkout, provider transfer or new refund logic. Existing zero-commission fee ownership and service calls preserved.

- Global online/COD/payout/refund aggregate endpoints do not exist. Four cards say Global reporting unavailable rather than fake zero or sums from filtered cursor pages. No fake trend charts.
- Settlement table is one summary per delivered live shop-order part, not a fabricated transaction-event table. Collected/captured allocation, partner cash custody, payout allocation and actual ledger posting state are distinct. Drawer shows actual handover/receipt/payout-intent/payout-record dates when supplied, references and existing journal records. Missing timestamps are not inferred. Missing source proof remains incomplete, with posting disabled. Pending payout is an intent, not completed money movement; externally recorded payout is not independent bank verification.
- Existing admin ledger actions remain in the detail drawer with their original proof checks, expected versions, external-payee confirmation, actual receipt/transfer acknowledgement, reference validation and durable recovery semantics. Background ledger refresh/failure disables drawer actions. Seller and delivery workspace ledger layout remains the default; admin-specific compact layout is opt-in.
- Shop-order lookup accepts exact UUID only, normalises uppercase, and now has Clear lookup. Existing cursor pagination and role-scoped queries preserved.
- Reconciliation is read-only order allocation data. Shop UUID filter, cursor paging/refresh and clear filters retained. No fake seller payout, relevant event date or bank reconciliation status is derived from the legacy settlementStatus field.
- Payment API amounts are paise; display divides by100. Ledger/reconciliation/refund API amounts are rupees and remain unchanged. Test/live warnings retained. Uncertain/pending/captured states use distinct colours plus text. Filters use the actual creating/uncertain/ready/paid state model, not invented failed/authorized states.
- Payment detail reuses the existing authorised get endpoint. Existing Razorpay mapping confirmation/reason, account match and enabled-provider checks, recheck/refresh, recovery notices and operator audit history remain. Provider recheck never initiates a payment/refund/transfer or releases stock. Added synchronous ref lock to existing payment recheck/refund actions to prevent duplicate clicks before React renders the busy state.
- Refunds remain payment-scoped in the payment drawer because there is no global refund API. Actual request/state/provider reference/createdAt/updatedAt shown. Last state update is not claimed as processedAt. Existing explicit refund confirmation and canSubmit/canReconcile guards preserved. Requested/pending does not imply issued/processed/bank credited.
- Payment method, shop names, separate internal payment ID and last-verification timestamp are absent from the admin payment DTO and are documented as unavailable instead of fabricated.

## Verification

Full frontend regression:61 files /266 tests passed. Final lint:0 errors /23 existing warnings. Final TypeScript check and production build passed. Existing React act/Vite configuration/build warnings remain. Relevant focused payment/refund/settlement tests passed, including new unavailable totals, admin drawer/missing proof, UUID clear and duplicate-click checks.

Browser evidence in browser-report.json uses a disposable MongoDB replica set/API on4001 and isolated frontend on8083, not the user's8081 server or Atlas database. Optional QA_FINANCE_REGRESSION fixtures are explicitly labelled QA DEMO. Their online record is uncertain, refund requested and COD source proof intentionally incomplete. None represents real capture/refund/collection. External providers are disabled, and the QA branch refuses enabled external payment/storage configuration. The only backend file changed is this optional test-fixture branch in scripts/browser-qa.ts; application backend logic is unchanged.

Browser checks cover actual isolated API list data and unavailable reporting, exact part lookup/clear, missing-proof ledger details/disabled posting, real payment state and test/live filters, payment/refund amount units and disabled-provider guards, reconciliation UUID filter/clear, empty ledger/payment states,768/390/320px cards and drawer bounds, keyboard Escape, failed payment/ledger refresh and retry, no page errors or financial mutation/provider requests. Screenshots include desktop, actual API empty state, ledger/payment details and mobile layouts. Desktop and320px drawer visually inspected. No physical phone, OS keyboard, screen-reader or live Razorpay transaction was tested. Existing real Razorpay refund/webhook launch dependencies remain unchanged; this redesign does not claim to resolve them. Backend application test suite was not rerun for this frontend/test-fixture change.

## Changed files

- src/components/portal/AdminFinance.tsx — page composition, hero and honest summary cards.
- src/components/portal/FinancePresentation.tsx — reusable responsive financial table and empty states.
- src/lib/finance-date.ts — IST formatting of actual timestamps.
- src/components/portal/LiveAdmin.tsx — connected finance composition.
- src/components/portal/SettlementLedger.tsx — opt-in admin summary/drawer, lookup clear and event timestamps; existing actions retained.
- src/components/portal/AdminPayments.tsx — actual payment table, detail drawer, clear filters and duplicate recheck lock.
- src/components/portal/AdminRefunds.tsx — payment-scoped refund presentation, actual references/timestamps and duplicate-action lock.
- src/components/portal/AdminWorkspace.tsx — read-only reconciliation table and clear filter.
- src/styles/admin-finance.css — scoped visual system, mobile cards/drawers and reduced motion.
- src/test/admin-finance.test.tsx, src/test/admin-payments.test.tsx, src/test/settlement-ledger.test.tsx — meaningful regression tests.
- public/admin-finance-hero-v1.webp — decorative generated image via imageUrl().
- scripts/finance-redesign-qa.mjs and docs/finance-redesign-verification/* — isolated browser evidence.
- ../just-back/scripts/browser-qa.ts — guarded optional disposable finance fixtures only.

## Artwork

Generated with imagegen. Source C:/Users/hp/.codex/generated_images/01a18195-8a83-7453-9eca-1b2df859c54a/exec-9d5dc80c-d2c3-49ed-9ba9-a2ae372fb9d6.png; optimised to900px WebP. Prompt: forest-green smartphone with blank cream receipt, wallet, restrained coins/rupee symbol, tiny local shop and sage leaves, cream paper backdrop, no transaction figures/UI/words/people. Decorative, never used as a financial record.

## Remaining API dependencies

Authorised global financial aggregation with explicit captured/collected/recorded/processed definitions, global refund listing and actual processed timestamp, richer authorised payment detail fields and genuine server date/order/shop filters. No unsupported endpoints or provider actions introduced.
