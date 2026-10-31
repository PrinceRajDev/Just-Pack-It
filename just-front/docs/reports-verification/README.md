# Reports & analytics — 2026-10-31

Enabled connected `/admin/reports` and its real sidebar/workspace-search entry. Premium cream/forest-green workspace with IST date filters, four actual metrics, daily order chart with accessible exact data table, shop-suborder status breakdown, refund-request cohort and top10 independent shop IDs. Demo mode explicitly requires a backend and does not invent financial records. No new dependency or external asset.

## Contract and financial definitions

Documented the new admin-only GET /admin/reports contract in docs/API_CONTRACT.md before implementation. Both from/to calendar dates or neither; defaults last30 inclusive IST dates including today. Range1–90, invalid calendar dates/reversed/future ranges rejected. Read-only, private/no-store, four bounded database aggregations with maxTimeMS5000. No Razorpay/network provider call or write/financial action.

- Orders/daily/status/shop rankings are live orders CREATED in range. Original frozen totals include unpaid and later-cancelled orders and are labelled booked value, never realised revenue or profit.
- Status counts are shop suborders, not parent orders. Same-name shops group by distinct shop IDs; original shop charges include cancellation, counted independently from current state. Top10 only, no claim of full shop ranking table.
- Recorded online captures use paidAt in range, live provider key, paid state, payment reference and matching live paid Razorpay parent order/amount. Orphans, mismatches, pending/test records are excluded; this is stored verified capture data, not a live bank balance or current-provider recheck.
- Cash uses actual cashCollection.recordedAt in range on live COD orders, including older orders whose collection is in range. It is an acknowledgement, not remittance/deposit or verified bank cash.
- Refunds use non-test/live-key REQUESTS CREATED in range, grouped by CURRENT state. A processed amount is not refunds processed within the chosen dates; true processedAt is absent. Pending/requested is not returned money, and processed is not bank-credit confirmation.
- Figures with different date bases are never combined into a synthetic revenue, margin, payout or net bank balance. Live database reads can change during generation; checkedAt is generation time, not a transactional accounting snapshot or provider verification time.
- Values are integer paise end-to-end, formatted as INR only in display. Non-safe/negative summed amounts fail closed for operator review instead of rounding silently. No customer identities/addresses, credentials or payment references returned.

## Verification

Backend full suite:9 files /190 tests passed. Final focused report tests:4 passed again after index declarations. Final backend lint/typecheck/build passed. Fixture typecheck errors were corrected with exact domain unions; no failing check is claimed successful.

Frontend full suite:65 files /282 tests passed. Final lint0 errors /23 existing warnings. TypeScript and production build passed. Existing React act/Vite warnings remain. UI tests cover amount units/date bases, retained dates on error with stale metrics hidden, and genuine zero-report state/accessibility data table.

8 isolated Chromium checks passed (browser-report.json): actual QA report values, real enabled route/nav, keyboard/data-table chart, valid zero range, >90-day server rejection with date retention/reset,768/390/320px page bounds, and failed-load retry. No browser page errors or write/provider requests. Desktop and320px screenshots visually inspected. Browser initially found overflow from offscreen absolute screen-reader chart labels; fixed with positioned containment, then all bounds passed. Mobile tables retain readable minimum column widths inside their own horizontal scroller.

Verification used existing explicit QA_DELIVERY_REGRESSION disposable replica-set fixture on4001 and isolated frontend on8083. The fixture is labelled QA DEMO, not production data. Positive/negative capture/cash/refund and IST boundary cases use synthetic records only in isolated integration tests, with no provider calls. No Atlas database, production data, real payment/refund, credentials, infrastructure or hosting modified. Physical phone/screen reader and production-volume throughput remain untested.

## Index/deployment note

Declared report_orders_created, report_cash_recorded, report_captures_paid and report_refund_requests on existing models for bounded query paths. The existing operator-reviewed npm run db:indexes script already includes these models. No production index command or migration was run. Review/apply declared indexes through the existing deployment workflow before production-size reporting; maxTimeMS limits do not replace capacity verification. No new environment values/credentials are required. Restart backend/frontend processes if not watching files to load the new route.

## Changed files

Backend:
- src/admin/reports.ts — validated IST ranges, actual read-only aggregations and safe amount checks.
- src/app.ts — existing authenticated admin route mount.
- src/orders/models.ts, src/payments/razorpay.ts, src/payments/refund-model.ts — report index declarations only, no financial logic changes.
- test/admin-reports.test.ts — isolated authorization/range/boundary/cohort/test-exclusion/refund/capture-proof tests.

Frontend:
- src/domain/admin-reports.ts and src/services/admin-reports.ts — typed reporting API.
- src/components/portal/AdminReports.tsx and src/styles/admin-reports.css — filters, metrics, chart/tables and responsive states.
- src/routes/admin.reports.tsx, src/routes/admin.tsx, src/routeTree.gen.ts — file route and navigation.
- src/components/portal/PortalShell.tsx and src/components/portal/LiveAdmin.tsx — enable reports without duplicate sidebar.
- src/test/admin-reports.test.tsx — meaningful UI regressions.
- docs/API_CONTRACT.md — additive API semantics.
- scripts/reports-qa.mjs and docs/reports-verification/* — browser verification/evidence.

## Remaining scope

Processed-date refund reporting needs an authoritative completion timestamp. Profit/platform revenue, seller payout analytics, bank settlement/balance, forecasts, exports and marketing/user-engagement analytics are not inferred or offered. Existing operational/finance pages retain their behaviour and their prior reporting placeholders; this step enables a dedicated, explicitly scoped analytics workspace. Platform settings remains unavailable.
