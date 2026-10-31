# Live COD integration decisions

Preserve demo checkout and existing routing. Live order placement is offered only for an enabled, unblocked server quote with a numeric total and explicit COD policy. The buyer explicitly confirms the quoted total. Unknown outcomes never mean success and must not cause a new request key.

Before POST, persist a single buyer/API-scoped attempt containing the exact canonical input and random idempotency key (IDs/quantities/accepted total only, no token/address text). Coordinate attempts across tabs with Web Locks. Without durable storage or Web Locks, fail closed. A pending attempt must be recovered with its original key/payload before another one can start, even if the current bag changed. Never POST automatically on mount. Network/server/auth/unknown failures retain the attempt. Only documented transaction rollback errors mark it rejected; the buyer must refresh the review before starting another attempt. Confirmation persists the order ID before removing only unchanged purchased cart lines. Confirmed records require an explicit new-attempt action, preventing reload from creating a second order.

History/details use owned order API snapshots, not current catalogue/mocks. No fictional ETA, rider, cancellation action, collection status or payment success. COD is unpaid on placement. Seller processing and live browser verification are still required before customer-facing activation; do not change the backend flag here.

## Implemented behavior

Live `/checkout` reuses the existing bag/address/method review instead of the old unavailable placeholder. The exact supported COD pricing policy, server availability, finite payable total and no blocking issues are required before confirmation appears. The existing demo checkout is preserved. A checked consent box is required; requests are explicit, never automatic. The legacy demo placement service rejects real-mode writes so the incomplete older payload cannot bypass review/recovery.

Pending/confirmed/rejected recovery appears in account and eligible checkout. Unknown outcomes preserve the original key/input and block replacement; recovery explicitly warns it may place the previously confirmed order if the server never received it. Known transactional rollback codes (including an owned address deleted before placement) permit a fresh review. 401/503/network/unknown responses do not clear recovery. A malformed success also stays pending. Confirmed attempts require an explicit separate-new-order action. Storage clearing/corruption, browser changes and another device cannot be made safe by client state alone: review server history before a new attempt. Recovery via POST while COD is administratively disabled will remain pending until service is restored; owned history remains readable.

Purchase cleanup removes only lines whose current quantity matches the submitted snapshot. Edited/new lines stay in the bag. If the submitting screen unmounts (including account changes), a late result does not alter the current cart or navigate; its original buyer-scoped record remains recoverable. Order history follows all signed API pages with account-scoped query keys; details show immutable shop/product/variant/address snapshots. Missing/failed data shows an empty, retry or not-found state, never demo fallback.

## Verification — 2026-10-30

Final `npx tsc --noEmit`, `npm run test`, `npm run lint`, `npm run build` passed. Full suite: **98 tests in 22 files**; lint: **0 errors, 22 existing Fast Refresh warnings**. Tests cover persist-before-POST, exact key/payload recovery after network failure, changed-attempt rejection, explicit consent, success-only bag cleanup/navigation, unmount/account-switch safety, storage/lock failure, concurrent-tab exclusion, malformed success, transactional rejection recovery, buyer isolation, immutable order snapshots and preservation of edited/new bag lines. New UI/service tests use mocked API responses; no real order was placed. Real-browser end-to-end persistence/placement remains unverified. Backend application source is unchanged this turn and its tests were not rerun; only backend README/API documentation was updated for integration status.

## Changed files

- New `src/domain/cod.ts`, additive `src/domain/types.ts` snapshots/status.
- New `src/services/cod-orders.ts`; `src/services/orders.ts`, `src/services/checkout-review.ts`.
- New `src/components/store/CodOrderAction.tsx`, `LiveOrders.tsx`; `CheckoutReviewPanel.tsx`, `LiveCart.tsx`, `AddressDeliveryReview.tsx`; `src/components/auth/LiveAccount.tsx`.
- `src/stores/cart.tsx`; existing `src/routes/checkout.tsx`, `orders.index.tsx`, `orders.$id.tsx`.
- New tests `cod-recovery.test.ts`, `cod-confirmation.test.tsx`, `live-orders.test.tsx`, `cart-purchase-cleanup.test.tsx`; adjusted live-cart expectations.
- This report, frontend API contract, backend README/API integration status.

Remaining: seller acceptance/preparation/rejection/cancellation and safe restocking, COD collection/settlement, dispatch/OTP verification, and a populated real-browser journey audit. `ORDERS_COD_ENABLED` was not changed; customer-facing placement stays off until these launch dependencies are handled. No credentials or payment provider connections were added.

Current extension: seller processing/pre-preparation restock, dispatch, buyer account receipt codes and seller cash recording are now implemented. Cash-recorded placement replays are accepted without changing the original accepted total; they are not treated as online paid/settled. Remaining work is the populated browser journey, operational exceptions/reconciliation and settlement/accounting, plus future verified phone/SMS or platform delivery integration. See backend `docs/SELLER_ORDERS.md` and `docs/HANDOFF_COD.md` for current results and contracts. Earlier phase boundaries above are historical.
