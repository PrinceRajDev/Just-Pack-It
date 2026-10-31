# Shop availability verification

Implemented daily controls in the seller dashboard and shop settings: temporary pause, structured operating intervals, pickup/seller/platform delivery choices, listed fee, minimum and pickup instructions. These save through a strictly limited transactional seller API and preserve approval. Identity/profile edits keep the existing approval flow.

Buyer shop cards/details use server-derived availability and schedule labels; cart and fulfilment reviews refresh while foregrounded. Checkout/inventory/order enforcement remains server-side. Unpausing follows opening hours. No changes to existing orders, fee snapshots, payments or delivery assignment policy.

Verified:
- Backend full suite: **11 files, 201 tests passed**, disposable MongoDB only.
- Backend TypeScript/lint/build passed.
- Frontend focused suite: **3 files, 10 tests passed** (availability draft/permissions payload, cart regression and shop discovery).
- Frontend TypeScript/build passed; lint 0 errors, 23 existing warnings.
- Actual isolated QA API/browser: seller pause → public closed state/banner; pickup-only settings → matching public fulfilment; reopening → automatic buyer refresh; approval preserved. Seller settings fit 1440, 390 and 320px. QA used labelled temporary shops and a replica-set memory database; no Atlas, real customers, payment or storage providers were used. Temporary QA servers stopped afterward.
- Narrow seller mobile header overflow fixed by making the shared logo shrink and hiding the redundant role badge at small widths.

Representative files:
- `../just-back/src/catalogue/availability.ts`: whitelist, ownership, version conflict and audit.
- `../just-back/src/catalogue/presenters.ts`: public availability enum and structured schedule.
- `src/components/portal/ShopAvailability.tsx`: daily operations form, failure-retained draft and stale-write protection.
- `src/services/management.ts`: service endpoint.
- `src/components/store/ShopMark.tsx`, `src/services/catalog.ts`, `LiveCart.tsx`, `AddressDeliveryReview.tsx`: buyer presentation/refresh.
- `docs/API_CONTRACT.md`: endpoint and compatibility requirements.

Preview files: `availability-1440.png`, `availability-390.png`, `availability-320.png`. These contain labelled QA data. Polling is approximately 30 seconds while foregrounded, not an instant push guarantee; a listed platform-delivery option still requires configured coverage/dispatch eligibility.
