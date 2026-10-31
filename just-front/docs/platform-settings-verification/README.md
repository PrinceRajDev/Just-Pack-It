# Platform settings — 2026-10-31

Enabled `/admin/platform` and the existing Platform settings sidebar/workspace-search entry. All existing admin sections/routes and branding remain. This workspace manages actual persisted public support/contact information and a customer announcement, with preview, confirmation, optimistic version checks, audit, responsive form and safe read-only deployment configuration. No unrelated payment/order/onboarding policy controls were added.

## Editable and read-only scope

Editable: public support email, international phone, support hours, notice visibility and plain-text notice. Blank contacts remain hidden. Enabled notice requires nonblank text. An operator reason and explicit confirmation precede publication. These fields are separate from EMAIL_FROM/Brevo OTP configuration. No email/SMS, phone call, provider request or notification blast is triggered.

Read-only: current COD, online payment mode/enabled, refund submission, platform delivery, email OTP requirement/configuration, image-storage provider/configuration, push and worker flags. These are actual configuration booleans/labels, not live provider health, worker heartbeat or successful test results. Credentials, raw environment, sender email, paths, database URI, hashes and tokens are never returned. Radius6km, zero commission, listed delivery fee ownership and one-active-login policy are explanatory descriptions of existing behaviour, not editable controls.

The notice is informational. It never pauses checkout, closes shops, overrides eligibility, adjusts prices, changes fees/commission, cancels orders or triggers payments/refunds. No API contract or code path silently maps notice text to a business gate.

## Backend

New singleton PlatformSettings document, default blank unpublished values and version0 when absent. GET does not create data. Admin-only GET/PATCH /admin/platform-settings uses database authentication/admin authorization and strict validation. Expected version plus transactional update and platform.settings.update audit serialize changes; concurrent first-save conflicts and stale versions return409. Server timestamps/actor recorded; public output omits actor/version/reason/configuration. Public GET /platform-settings returns only support fields and active notice text; disabled notice text is empty even if retained privately. Both responses are non-cacheable. Secret/configuration/radius injection is rejected. Added model to the existing index-declaration script; no production index/migration command run.

## Frontend/customer integration

StoreLayout now renders PublicPlatformInfo alongside the existing header/content. Configured contacts and enabled notice are actually visible on buyer pages, with native tel/mailto links. Blank defaults render nothing. Text is React-escaped; there is no HTML rendering. A failed information request shows a compact retry and does not block browsing/checkout. Demo mode does not fetch/simulate settings. Public query checks at60-second intervals while mounted, or on refresh/focus when stale; cross-tab publication is not claimed instantaneous.

Admin stores the base version with its local draft. A remote version never silently overwrites the draft or allows an update against the new version without review. Failed publish retains text and requires recovery; reload/discard are explicit, and failed refresh keeps the draft. Confirmed reload adopts actual latest values. Successful publication uses the acknowledged server result, clears reason, updates local saved state, and invalidates public/audit caches. Duplicate-submit lock included. Drafts are not durable across a full page reload/navigation; no offline draft recovery is claimed.

## Verification

Backend:10 files /194 tests passed. Backend lint/typecheck/build passed. New tests cover blank defaults without writes, admin authorization, private/public field isolation and no secrets, schema validation, config/radius injection rejection, concurrent first save/version conflicts, atomic audit count, disabled notice hiding and no email/provider calls or auth change.

Frontend:67 files /287 tests passed with `npm test -- --reporter=dot --maxWorkers=2`. Initial unrestricted parallel run timed out in two existing seller tests under concurrent build/backend/browser load; successful full rerun reduced concurrency without changing test timeouts or assertions. Final lint0 errors /23 existing warnings, typecheck and build passed. Existing React act/Vite warnings remain. Tests cover required reason/confirmation, expected version, failed-publish draft retention, remote-version protection, public plain-text rendering and unpublished-contact/notice handling.

10 isolated Chromium checks passed (browser-report.json): route/nav/defaults, preview/reason/confirm cancel and actual publication, anonymous storefront contact/notice and exact public DTO, disable notice, concurrent-version draft protection and confirmed reload,768/390/320px layout, failed refresh/retry preserving draft, no browser page errors. Desktop and320px screenshots visually inspected; narrow configuration cards polished to single-column for readability. No physical phone, screen reader, provider live-health or production throughput test claimed.

Tests/browser used disposable MongoDB replica sets and QA DEMO settings only, API4001/frontend8083. Real Atlas/production settings, contacts, credentials, infrastructure, payments/refunds and hosting untouched. Temporary fixtures disappear when QA server stops. No new environment variables required.

## Exact changed files

Backend:
- src/platform/settings.ts — singleton model, public/admin DTOs, safe config summary, validation and transaction/audit.
- src/app.ts — public and authenticated-admin route mounts.
- scripts/create-indexes.ts — includes the new model in the existing reviewed workflow.
- test/platform-settings.test.ts — isolated security/concurrency/data-isolation regression tests.

Frontend:
- src/domain/platform-settings.ts and src/services/platform-settings.ts — typed integration boundary.
- src/components/portal/PlatformSettingsPage.tsx and src/styles/platform-settings.css — admin editor/preview/configuration and responsive layout.
- src/components/store/PublicPlatformInfo.tsx and src/components/store/StoreLayout.tsx — actual customer-facing public information.
- src/routes/admin.platform.tsx, src/routes/admin.tsx, src/routeTree.gen.ts — route and enabled navigation.
- src/components/portal/LiveAdmin.tsx and src/components/portal/PortalShell.tsx — dispatch/remove the last disabled placeholder, preserve shared navigation.
- src/test/platform-settings.test.tsx and src/test/public-platform-info.test.tsx — five meaningful UI/security regressions.
- docs/API_CONTRACT.md — additive endpoint/behaviour contract documented before coding.
- scripts/platform-settings-qa.mjs and docs/platform-settings-verification/* — repeatable verification/evidence.

## Remaining limits

Environment/provider controls, fee/commission changes, radius policy changes, operational checkout/registration pause and live worker/provider health remain outside this workspace. They must not be inferred from announcement/contact publication. Restart development processes if not watching to load new routes. This is local implementation and verification, not deployment.
