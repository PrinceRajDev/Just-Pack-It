# Service areas & audit redesign — 2026-10-31

Connected `/admin/settings` now matches the shared cream/forest-green admin design: compact delivery/map hero, four data-driven statistic cards, two-column add/edit form and searchable area table, expandable GPS readiness, and a separate structured audit panel. Mobile forms stack and tables become cards. Existing admin shell/sidebar/topbar/search/notifications/profile/logout/routes and demo settings route remain unchanged.

## Actual data and preserved rules

Area counts use the complete existing admin area response. Shops with active areas counts each active approved shop once if assigned to at least one active configured area. Missing map pins counts active approved shops without two finite, in-range longitude/latitude coordinates. These are explicitly labelled definitions, not proof of physical accuracy, delivery availability or current GPS position. Failed data sources show unavailable dependent metrics, not fake zero. Area readiness retains its original assigned/approved/pinned breakdown and6km/category/accuracy warnings.

Area CRUD reuses management.area and the original expected-version patch. Existing IDs and assignments are unchanged. Form trims/splits pincodes and validates six-digit comma-separated input; server validation remains authoritative. Creation API accepts only name/city/pincodes and creates active areas. The new Active checkbox is disabled and explained in create mode; edit mode supports the existing active patch. No unsupported create flag is sent. Clear returns to a blank create form. Successful create resets after the real API response; failed save retains draft and error. Added synchronous duplicate-submit lock. Server reference rejection for deactivation is preserved and verified; no deletion or assignment bypass added.

Audit retains exact action and target UUID filters, signed cursor loading, refresh and actual response fields. Clear resets filters/cursor; uppercase target UUID normalises. Table uses actual createdAt (IST), action, targetId, actorId/role and optional version. Existing partial audit coverage disclaimer preserved. Date-range filtering, target type, descriptive event details and named users are not supplied by the current API. Fake controls/records/user names were not added. API contracts and backend are unchanged; date filtering remains a backend dependency, not an implemented feature.

## Verification

- Full frontend:62 files /274 tests passed. Final lint:0 errors /23 existing warnings. TypeScript and production build passed. Existing React act/Vite warnings remain.
-11 Chromium checks passed; browser-report.json records the exact checks. Actual isolated area create, edit, pincodes, deactivate/reactivate, reference-blocked deactivation with draft retention, Clear, area search/status/readiness, exact audit filters/clear and failed-audit refresh/retry tested.768/390/320px layout bounds checked. No browser page errors.
- Tests also cover approved-vs-pending shop counts, unavailable shop metrics, supported creation payload/reset and reference rejection. Existing readiness and other marketplace regressions passed.
- Desktop and320px screenshots visually inspected. Real phones, OS keyboard, screen reader, real GPS and production throughput not tested. A local startup navigation timed out on the first attempt; the subsequent bounded navigation and complete run passed.
- Browser verification used the existing explicit disposable database/API on4001 and frontend on8083, not Atlas or the user's8081 session. Area and category fixtures are QA DEMO only. A temporary category was deactivated/reactivated through existing authorised APIs to produce a genuine audit entry. No fabricated production data, payments, hosting or infrastructure changes. Backend application tests were not rerun because no backend file changed.

## Exact changed files

- src/components/portal/AdminSettings.tsx — connected composition, actual statistics, area form/list/search/status and readiness.
- src/components/portal/SettingsAudit.tsx — existing audit presentation extracted into a searchable table, clear/retry/empty states.
- src/components/portal/LiveAdmin.tsx — settings dispatch and removal of extracted old area forms.
- src/components/portal/AdminWorkspace.tsx — preserves existing AuditExplorer export via re-export; reconciliation/moderation unchanged.
- src/styles/admin-settings.css — scoped visual and responsive styles, reduced-motion support.
- src/test/admin-settings.test.tsx — five meaningful data/CRUD/reference/filter regressions.
- public/admin-settings-hero-v1.webp — decorative generated artwork via imageUrl().
- scripts/settings-redesign-qa.mjs — isolated browser verification.
- docs/settings-redesign-verification/README.md, browser-report.json and PNGs — verification evidence.

Existing AreaReadiness, management/admin-workspace services, domain types, API contract, shared admin shell and other page layouts were not changed.

## Artwork provenance

Imagegen source C:/Users/hp/.codex/generated_images/01a18195-8a83-7453-9eca-1b2df859c54a/exec-aff6083c-c029-4710-bafe-c691ab56d514.png. Optimised to900px WebP. Prompt: friendly Indian delivery rider in forest green on a green scooter beside stylised cream neighbourhood map, three location pins and sage leaves, soft daylight, no real addresses/map data, UI, numbers, metrics or real-person likeness. Decorative only, not live tracking or an actual service boundary.

## Remaining dependencies

Authorised backend audit date-range filters and richer audit event fields would be needed for those reference controls/columns. No complete historical audit or named-user mapping is claimed. A saved area/pincode alone never makes shops discoverable; existing approval, assignments, active categories and saved pins remain required by backend GPS discovery.
