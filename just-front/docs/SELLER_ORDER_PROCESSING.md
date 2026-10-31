# Live seller order processing

The live seller Orders screen now uses seller-scoped paginated reads and versioned suborder mutations. Existing demo routes/providers, branding and router remain intact. API UI routes are handled by the existing LiveSeller workspace rather than a new router.

The seller can accept, start preparing and mark ready. A new order can be rejected and an accepted order cancelled before preparation, with a buyer-visible reason. Preparation/ready cancellation, delivery completion and collection are unavailable. Only an active approved shop can advance processing; pre-preparation rejection still permits operational cleanup after suspension. Backend remains authoritative for roles, ownership, transitions, quantities and restocking.

The UI preserves server snapshots, shows only the shop's own lines and amount, confirms successful status updates and locks actions on failed/uncertain writes until refresh. Required reasons are trimmed by the service. Manual reload remounts cards to clear error locks from fresh server data. Buyer order details show latest saved status/reason, original checkout total and separate current COD due/cancelled amount. Status updates do not claim COD payment, refunds, assigned riders or delivered goods.

See backend `docs/SELLER_ORDERS.md` for exact contract, transaction decisions, changed files and verification: final frontend 106 tests/23 files, typecheck/build passed; lint zero errors with 22 existing warnings. Backend 84 tests/four files and typecheck/lint/build passed. UI tests use mocked requests and backend tests isolated MongoDB, not the real shop database. Browser end-to-end verification and delivery/collection workflows remain pending; live COD activation was not changed.
