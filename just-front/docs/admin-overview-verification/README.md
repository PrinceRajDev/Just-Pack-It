# Admin overview redesign verification — 2026-10-31

## Result and preserved behaviour

`/admin` now follows the supplied visual reference: forest-green280px desktop sidebar, original box/tape wordmark, warm paper surfaces, serif welcome heading, original decorative SVG neighbourhood shop, pastel performance cards, four attention cards, recent recorded activity, health and quick actions. Tablet/mobile use the existing accessible drawer. Navigation scrolls inside the sidebar while account/sign-out controls remain reachable. Seller shell presentation is unchanged.

The existing operations service,60-second queue polling, backend thresholds, attention counts, oldest-record previews, query/refetch flow, role guard, authentication/logout and notification component are retained. Detailed attention queues remain under “Review flagged records”; nothing is replaced with fabricated activity. Payments and refunds are counted separately rather than summing overlapping orders. Refresh invokes operations, current audit page and existing health checks.

## Deliberate differences from the reference

- Current `/admin/operations` supplies attention queues, not marketplace reporting totals. Connected **Total shops, Total products, Orders today, Active users and GMV today** therefore show Reporting unavailable, not0. No full catalogue/order downloads, fake comparisons or decorative trend graphs. Demo shop/product totals are computed from existing demo records and labelled; existing demo stock/order/delivery counts remain in details.
- Period/date filtering is unsupported; toolbar is a read-only Current snapshot with actual server `asOf`, displayed IST. Demo has no live timestamp.
- Existing authenticated `/admin/audit` supplies only the latest25 recorded actions. Six activity tabs filter that page, up to5 rows shown. Empty tabs do not claim the entire marketplace has no events. Record badges say Recorded, not fake payment/fulfilment success. Audit coverage is incomplete and explicitly labelled.
- Existing `/health` and `/health/ready` verify API response/database connection respectively. Payment/delivery providers are Not checked. Overall checks stay incomplete; no hardcoded All systems operational. Errors show unavailable with retry.
- Header searches existing admin workspaces, with Enter/ArrowDown/Tab navigation. There is no global records-search endpoint; it does not pretend to search users/orders/products globally.
- Seven actual routes remain: `/admin`, `/admin/partners`, `/admin/orders`, `/admin/catalog`, `/admin/finance`, `/admin/support`, `/admin/settings`. Unsupported Users & roles, Reports & analytics and Platform settings appear as unavailable non-links. No fictitious routes/buttons. Quick actions use working destinations including existing service areas/audit instead of unsupported reports/settings actions. Existing combined areas/audit and sellers/delivery workspaces are preserved.
- No existing profile dropdown was available, so actual account name/initials and role are displayed without a dummy dropdown.

## Actual verification

- Full frontend regression:58 files /251 tests passed. After final demo/empty-state refinements,14 focused overview/follow-up tests passed (two files). Tests cover real-count display, unsupported metrics, audit filtering/empty states, incomplete health, refresh, error/retry, preserved queues and demo isolation.
- Production build, TypeScript and lint passed;23 existing warnings,0errors. Final TypeScript, lint and production build passed again after copy refinements. Existing React act warnings in some full-suite tests remain.
- **15 isolated Chromium browser checks passed**, report in `browser-report.json`. Queue values compared with actual temporary API response; all seven sidebar links navigated; workspace search navigated; real temporary moderation audit appeared after refresh and filtered correctly; View audit log reached existing explorer/anchor;1024,768,390,320px layouts had no horizontal page overflow and drawers navigated; simulated operations outage showed unavailable rather than0 and retry recovered; unread count matched notifications API, notification drawer opened; sign-out cleared access; buyer was denied by both route guard and backend403; no page errors.
- Desktop1672px and390px screenshots visually compared with supplied reference. Evidence includes desktop,1024,768,390 and320px captures. Only explicitly labelled temporary QA records were used. Temporary product moderation was reversed after verification; database is ephemeral. No live shops/metrics/activity, real payments, production DB/indexes, secrets or hosting were changed.
- No physical phone, screen-reader certification or production-load claim. Backend source was not changed, so no backend test suite rerun was needed; existing authorization was exercised through browser/API requests.

## Backend dependencies

A future reporting API needs documented count scope (registered shops, shop-owned listings vs variants, parent orders vs suborders), IST day boundaries, test/cancellation exclusion and explicit GMV/refund definition. Active users needs a backend-defined activity window. Trend comparisons require actual historical periods. Global record search, exhaustive activity coverage, external-provider health, user management, reports and platform configuration are separate missing capabilities. No endpoint was invented and no API contract was broken for this redesign.

## Exact changed files

- `src/components/portal/PortalShell.tsx`
- `src/components/portal/OperationsDashboard.tsx`
- `src/components/portal/AdminOverviewPanels.tsx` (new)
- `src/components/portal/AdminWorkspaceSearch.tsx` (new)
- `src/components/portal/NeighbourhoodIllustration.tsx` (new)
- `src/components/portal/AdminWorkspace.tsx` (existing audit anchor)
- `src/routes/admin.tsx`
- `src/routes/admin.index.tsx`
- `src/routes/admin.settings.tsx` (demo audit anchor)
- `src/services/overview-health.ts` (new; existing endpoints)
- `src/styles/admin-overview.css` (new; admin scoped)
- `src/test/admin-overview.test.tsx` (new)
- `src/test/marketplace-followup.test.tsx` (updated redesigned queue expectations)
- `scripts/admin-overview-qa.mjs` (new)
- `docs/admin-overview-verification/README.md`, `browser-report.json`, `desktop.png`, `viewport-1024.png`, `viewport-768.png`, `viewport-390.png`, `viewport-320.png`

No dependencies, routing library, backend domain logic or environment configuration changed. QA used existing explicitly opted-in browser fixture server on4001 and frontend QA config on8083. QA processes stopped after verification.
