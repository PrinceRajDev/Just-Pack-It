# Admin dashboard audit — 2026-10-30

Scope: connected overview, approvals/seller directory, orders, payments/refunds, taxonomy, support, service areas; shared portal navigation, role guard, services and existing admin API permissions. Existing branding/router/layout preserved. All browser writes used temporary isolated QA MongoDB, not Atlas.

## Confirmed bugs fixed
- Connected navigation advertised riders, delivery management, coupons and audit screens despite those capabilities not being connected. Labels now describe actual workspaces.
- Child admin paths with trailing slashes missed the connected screen switch. Normalized pathname before dispatch.
- Inactive category/subcategory forms still offered edits and adding children. Disabled affected actions and labelled inactive subcategory fields.
- Order Previous page remained actionable during fetch, unlike Next page. Both now guard fetch transitions.
- Support refresh allowed overlapping clicks and ticket save lacked an early busy guard. Added guards; long identifiers wrap within cards.
- Corrected support loading punctuation and outdated unavailable-screen copy.

## Verified checks
- Seven pages rendered at 1440px and 390px; all expected headings, no horizontal overflow or browser page errors.
- Mobile drawer navigates and closes. Trailing-slash support route renders at both sizes.
- Buyer and seller accounts denied admin workspace by UI guard. Backend role middleware remains authoritative; no frontend-only permission assumption.
- Full frontend suite: 172 tests across 39 files passed. Includes trailing slash dispatch and inactive taxonomy action regression tests.
- Production build, final TypeScript typecheck and ESLint error-level checks passed. Test fixture types and QA runner formatting were corrected before final verification.
- Final browser audit: 25 checks passed, zero page errors. Includes persisted category/area creation, versioned shop approval, overview/catalogue/support API failure and recovery.
- Screenshots and exact browser outcomes: docs/admin-audit/report.json. Save/failure checks use explicit synthetic fixtures only.

## Risks and remaining dependencies
- Payments/refunds: state display reviewed; no real provider capture/reconcile/refund executed. Production keys, webhooks and operator procedures still require dedicated validation.
- Admin orders are read-only. Delivery partner assignment, settlement, coupon operations and an audit-log explorer are not connected capabilities.
- Overview links open workspaces, not a specific flagged record. Support now has overview queue counts and status filters; text search and conversation/reopen flow remain absent.
- Large datasets: category/area/seller/shop screens load complete arrays; backend pagination exists for some lists but UI filtering/pagination is incomplete. Scale/load testing not performed.
- Inactive taxonomy currently has no reactivation UI. Category/subcategory deactivation reference safety enforced by backend; do not bypass it to remove populated categories.
- Admin approvals show map coordinates but do not prove physical shop identity. Map-pin verification and image review can be improved.
- Existing broad checkout QA failure from earlier work is outside this admin audit and is not claimed fixed here.
- Demo-mode portal still uses explicitly labelled mock workflows; connected-mode audit does not certify every demo interaction.

Changed application files: src/routes/admin.tsx; src/components/portal/LiveAdmin.tsx, LiveSupport.tsx, AdminOrders.tsx. Added src/test/admin-audit.test.tsx and scripts/admin-audit.mjs. No backend application or production infrastructure changes in this audit.


## Follow-up: support queue status filters
Added All/Open/In progress/Resolved selector using the existing backend status query. Query caches and cursor chains are scoped by status; switching status starts at the first page. Filter-specific empty state and fetching guard on Load more. Existing buyer list calls remain compatible. Eight focused support/alert tests passed, including server filter arguments and pagination reset. No backend API change or production data writes. Browser rerun not performed for this small follow-up.


## Follow-up: support overview queue
Overview now includes unresolved support count and oldest ten reports, linking to order support. Backend uses one bounded count/sample aggregation and excludes issue description, admin notes and buyer identifiers from overview. Older API compatibility explicitly shows unavailable. Added backend tests for status filtering, oldest ordering, ten-item limit, privacy, seller denial and empty result, plus frontend rendering/older-server fallback tests. No production writes or provider operations. Browser rerun not performed for this additive card.


## Follow-up: exact admin order lookup
Added full-UUID Order ID lookup in connected Orders & cash records, backed by optional orderId filter on existing admin list endpoint. Applying/clearing lookup resets cursors and cash filter; invalid IDs show an inline error before request. Missing order state explains exact ID and cash filter. Backend validation, uppercase normalization, empty lookup, intersecting filters, privacy and cursor mismatch assertions added to existing isolated order monitoring test. Existing nonlookup cursor scope preserved. No production writes or provider calls. Browser rerun not performed for this additive form.

Exact-lookup verification: 147 backend tests / 7 files and 3 focused frontend tests passed; both production builds, backend/frontend TypeScript checks and scoped frontend/backend lint passed.


## Follow-up: support-to-order navigation
Support tickets now include View order. Admin orders route validates optional orderId UUID search parameter; connected workspace initializes lookup from URL. Applying/clearing lookup updates URL and remounts cursor state; reload and browser Back preserve navigation intent. Mobile lookup field uses full width. Six mobile Chromium checks passed on isolated fixtures: support link, exact order, reload, Back, clear URL, fit/no page errors (report docs/order-link-qa/report.json). Full frontend suite: 176 tests passed; 14 focused tests passed after minor input-width/fixture cleanup. No backend API change or live data writes.


## Catalogue categories/subcategories usability improvements
Added client-side search over category and subcategory name/slug/ID, combined Active/Inactive filter, active/inactive/matching counts, refresh, clear and honest empty states. Creation form remains available when filters hide records. Existing IDs/slugs visible and immutable; inactive controls remain disabled. Category/subcategory deactivation now uses existing accessible confirmation dialog, preserving server reference/version checks. New-category inputs reset only after successful API save. Save feedback uses existing pending/error/toast mechanism. Mobile QA discovered save toast could cover a form action; shared toaster now has a dismiss button.
Changed files: src/components/portal/LiveAdmin.tsx, src/components/ui/sonner.tsx, src/test/admin-audit.test.tsx, scripts/taxonomy-qa.mjs. No new APIs or backend/data model changes. Five focused tests passed for combined search/filter, inactive controls, confirmation cancel/server errors and successful reset. Browser results in docs/taxonomy-qa/report.json. Search filters already-loaded taxonomy, not paginated server search. Reactivation, product moderation and image management were not added. Production catalogue untouched.

Catalogue follow-up verification: 5 focused tests passed, 4 mobile browser journey groups passed with zero page errors/overflow, production build and TypeScript/scoped and full error-level lint checks passed. Screenshot visually inspected. QA servers stopped after testing.


## Service-area GPS readiness
Added read-only per-area assignment, active-approved-shop, valid-pin and missing-pin counts from existing admin shop DTOs. Inactive/unassigned/unapproved/missing-pin states explain next actions; saved pins explicitly do not guarantee 6 km proximity, active category eligibility or physical accuracy. Missing pin shop names shown. Single cached existing shops request shared across areas; loading/failure never represented as zero and area editing stays available. No new backend endpoint or production changes. Added focused tests for assignment isolation, approval/activity filters, inactive/no-shop state and coordinate bounds. Browser rerun not performed for this additive read-only panel. Existing full-array admin shop loading remains a scale limitation.


## Seller GPS pin capture follow-up
Seller shop profile now offers explicit Use my current location, requiring browser GPS precision within 100 m. Existing buyer GPS retains 1500 m threshold. Captured coordinates populate editable draft fields only, mark unsaved profile changes and do not auto-save/approve. Existing shop ownership, versioned save and reapproval remain authoritative. Failure preserves existing pin; manual coordinate edits invalidate pending GPS completion; unmount ignores late results. Requires HTTPS/localhost and browser permission, no paid map API. No reverse geocoder or physical shop identity verification. Focused tests cover opt-in, draft capture, errors/manual entry and late-response race; real-device GPS/browser follow-up not run. No backend/production data changes.
