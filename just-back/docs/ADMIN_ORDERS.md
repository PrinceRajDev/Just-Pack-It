# Admin COD order monitoring

Razorpay extension: all-orders view also shows online method/status and explicit test-order labels. The `outstanding` and `recorded` cash filters apply only to COD orders. Online capture does not create cash collection records or imply settlement. See `RAZORPAY.md` for reconciliation and remaining live-launch dependencies.

Read-only admin endpoint: `GET /admin/orders`. The existing `/admin` authentication/role middleware protects it. Query: `limit` 1–100 (default 25), optional signed `cursor`, optional UUID `shopId`, and `cash=all|outstanding|recorded` (default all). Filters are bound into cursor signatures. Invalid queries/cursors return 400. Responses are private/no-store arrays with existing pagination headers.

DTOs expose order/suborder status, immutable checkout total, cancelled amount, outstanding cash and recorded cash. Buyer address/identity and receipt/authentication metadata are deliberately excluded. Cash records are seller reports with buyer receipt acknowledgement; they do not imply bank verification, platform settlement or reconciliation.

Outstanding/recorded filters overlap for partially collected orders. Shop filters select whole orders containing a shop. Results are a current-data view and can change between pages; no global totals or accounting export is claimed. No writes, manual paid override, refund, dispute or settlement API was introduced. Existing shop/time indexes help shop filtering; platform-wide cash-filter queries may require measured indexing/reporting work at scale.

Frontend live `/admin/orders` adds paginated cards, cash filter, refresh, loading/error/empty states and per-order/shop amounts. Demo screens remain unchanged. Existing role guard remains UX-only; backend enforces access.

Tests cover anonymous/non-admin denial, privacy, signed cursor/filter isolation, two-page traversal, invalid filter validation and recorded/outstanding cash. Frontend tests cover filter cursor reset, read-only labels, error and retry states. No production database or COD activation is required by these tests.

Validation: backend 92 tests in four files passed; frontend 117 tests in 25 files passed. Both TypeScript checks, builds and lint passed (frontend retains 22 existing Fast Refresh warnings). One initial test assertion used 422 for invalid input; it was corrected to the application's existing 400 validation contract and the suite rerun successfully.

Isolated headless Chromium E2E also passed: completed two-shop cash order appears in the admin monitor, disappears under outstanding-only filter, returns under recorded filter, and fits a 390px mobile viewport. Existing buyer/seller, recovery, inventory and taxonomy checks also passed. Evidence: `../../just-front/docs/browser-qa/report.json` and `admin-cash-records.png` in that directory. Only labelled ephemeral QA fixtures were used; temporary servers were stopped afterwards.

Changed backend: `src/orders/admin.ts`, `src/app.ts`, `test/phase1.test.ts`, this document. Changed frontend: `src/domain/admin-orders.ts`, `src/services/admin-orders.ts`, `src/components/portal/AdminOrders.tsx`, `src/components/portal/LiveAdmin.tsx`, `src/routes/admin.tsx`, `src/test/admin-orders.test.tsx`, `scripts/browser-qa.mjs`, and `docs/API_CONTRACT.md`.
