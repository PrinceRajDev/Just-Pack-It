# Application-wide UI implementation checklist

Visual anchor: supplied Just Pack It marketplace reference. Preserve React, TanStack Router/Query, domain identities, mock/API switching, role guards and existing state transitions.

## Inspected architecture

- File routes under `src/routes`; generated route tree managed by the router plugin.
- Buyer `StoreLayout`, seller/admin `PortalShell`, delivery layout in `delivery.tsx`.
- API integration only through existing catalogue/order services and `api()`.
- Cart persistence uses `(productId, variantId?)`; seller/delivery operations use existing session demo stores.
- No separate registration, password recovery, seller edit route or live tracking route exists. Do not invent those backend capabilities.

## Phase checklist

- [x] 1. Shared tokens, controls, panels, status badges, dialogs, loading/error/empty states; responsive portal tables.
- [x] 2. `/`, new `/categories`, `/category/$slug`, `/shop/$slug`, `/product/$id`, `/search` — category/shop/product discovery and identity.
- [x] 3. `/cart`, `/checkout`, `/orders`, `/orders/$id`, `/account` (orders, addresses, wishlist, profile, support), `/login` — complete customer journey.
- [x] 4. Seller `/seller`, `/seller/products`, `/seller/products/new`, `/seller/inventory`, `/seller/orders`, `/seller/offers`, `/seller/settings`, `/seller/settlements`.
- [x] 4. Delivery `/delivery`, `/delivery/$id`, `/delivery/earnings`.
- [x] 4. Admin `/admin`, `/admin/partners`, `/admin/orders`, `/admin/catalog`, `/admin/finance`, `/admin/support`, `/admin/settings`.
- [x] 5. Run lint, tests, build; inspect accessible navigation, mobile/desktop layouts, cart/variant constraints and role guards. Record actual coverage and limitations in `UI_REDESIGN_REPORT.md`.

## Reusable implementation targets

`StoreHeader`, `StoreLayout`, `ProductCard`, `ShopMark`, `ProductBrowser`, `OrdersList`, `OrderTimeline`, `PortalShell`, `DataTable`, `StatusBadge`, form controls and common state panels. Add a small reusable `Panel` for management sections and a shared category tile. Preserve existing functional page-specific controls.

## Integration boundaries

Taxonomy edits, seller changes, delivery tasks and administrative mutations retain current demo/session behavior. Payments, payouts, profile/address persistence, image uploads and live reporting still depend on backend services. No production endpoint or new payment behavior is introduced for visual reasons.
