# Frontend reliability and mobile journey pass

Completed within the existing React/TanStack application; branding/routing preserved.

## Improvements

1. Seller Add/Edit uses TanStack Router's blocker with Keep editing / Discard confirmation for dirty fields, photos and variants. Browser close/refresh uses beforeunload where supported. Successful saves bypass the blocker with explicit demo confirmation.
2. Cart stores optional last accepted display price, detects changes against current catalogue lookup, and requires acceptance before checkout. Named recovery panels offer price acceptance, stock reduction and removal. Quantity edits preserve prior acceptance. Legacy carts without a price do not claim a detected change. Acceptance metadata is stripped from API order requests.
3. Shop offers show supplied scope, expiry, minimum spend and conditions, with missing metadata labelled. Future/expired/malformed offers are hidden; product badges and demo offer-only search follow the same validity rule. No offers or discounts fabricated.
4. Header recent history stores five submitted terms locally, with clear and blocked-storage fallback. Suggestions support keyboard click/Tab/Escape, unique input IDs, 250 ms debounce and hide old-query suggestions. Demo typo matching permits one edit in tokens of at least four letters, retaining other query tokens/filters. Empty searches suggest actual area shops/categories. API mode still requires server-side matching/ranking.
5. Three campaign images use quality-84 WebP at original dimensions; PNG originals retained. Hero fetch priority raised. Areas/taxonomy cache 5 minutes, shops 30 seconds, product lists 15 seconds; API product requests support cancellation. Browsing caches do not reserve inventory.

| Asset | PNG bytes | WebP bytes |
| --- | ---: | ---: |
| Categories | 2,509,870 | 252,026 |
| Hero | 2,258,732 | 139,190 |
| Storefronts | 3,027,573 | 366,046 |
| Total | 7,796,175 | 757,262 |

90.3% reduction in those served asset bytes. This is not a Lighthouse/Core Web Vitals or total bundle measurement. PNG originals remain in the deployment folder but are no longer referenced by these UI surfaces.

## Verification

- Build and TypeScript passed. Lint: 0 errors, 15 existing Fast Refresh warnings. Eight suites / 24 tests passed, including price acceptance, stock recovery, recent history, typo matching, offer dates/scope and existing seller/variant/readiness checks.
- At 390px, render/heading and root-overflow checks covered directory, populated/empty category, shop, variant product, search, cart/checkout, orders/detail; seller products/Add/Edit/stock/orders/offers/settings/payouts; all seven admin screens; delivery list/detail/earnings. Account tabs opened. No root overflow found in checked screens.
- Browser interactions: `tomatos` returned tomatoes; missing search showed eligible alternatives; recent-history submission/clear worked. Unsaved Cancel showed confirmation; Keep editing retained stock 17, Discard retained original listing, Save navigated without another warning. Populated mobile checkout reached review at ₹63 without placing an order. Demo delivery pickup/start worked, empty OTP disabled confirmation and `000000` was rejected; task reset verified. Admin mobile No records recovered after clearing search.
- This is selected interaction/layout coverage, not exhaustive mutation, browser or screen-reader certification. No payment/order submitted or delivery marked completed. Test cart/history cleared, seller/delivery session edits reset, demo sign-in signed out after checks.

## Backend limits

Live price/inventory detection requires refreshed catalogue or a quote; current cart lookup remains demo-based. Server must enforce seller ownership, atomic inventory reservations, offer eligibility/stacking, address serviceability and final prices. Shop-offer display uses fixture-only tests; no new sample offers added. Seller persistence/uploads remain disconnected. Search must filter/rank before backend pagination. No production authorization/payment claims derive from frontend checks.

## Changed files

- `src/components/portal/SellerProductForm.tsx`
- `src/stores/cart.tsx`, `src/domain/types.ts`, `src/lib/bag-readiness.ts`, `src/components/store/CartRecovery.tsx`, `src/routes/cart.tsx`, `src/services/orders.ts`
- `src/lib/offers.ts`, `src/components/store/ShopOffer.tsx`, `src/components/store/ProductCard.tsx`, `src/routes/product.$id.tsx`, `src/routes/shop.$slug.tsx`, `src/routes/category.$slug.tsx`
- `src/lib/search.ts`, `src/components/store/StoreHeader.tsx`, `src/components/store/ProductBrowser.tsx`, `src/routes/search.tsx`, `src/services/catalog.ts`
- `src/lib/image.ts`, `src/styles.css`, `src/components/store/ShopMark.tsx`, `src/routes/index.tsx`, `public/market-{categories,hero,storefronts}-v2.webp`
- `src/test/recovery-search-offers.test.tsx`, `src/test/seller-editing.test.tsx`, `src/test/variant-selection.test.tsx`, `docs/API_CONTRACT.md`
