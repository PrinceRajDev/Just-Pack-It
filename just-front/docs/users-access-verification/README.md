# Users & roles — account directory and secure access control

Implemented connected `/admin/users` and enabled its existing sidebar entry/workspace search. Buyer, seller, delivery partner and admin accounts use the real backend directory, literal name/phone/exact-ID search, role/status filters, matching-result total, signed cursor pagination and responsive review drawer. Demo mode explicitly requires a backend and does not simulate accounts/access changes. Reports & analytics and Platform settings remain unavailable; this step implements Users & roles.

## Design and security decisions

Roles are deliberately read-only. Arbitrary role migration changes ownership/onboarding/approval relationships and is not added as generic privilege escalation. Admin accounts, including the acting admin, cannot be changed through this endpoint, avoiding self-lockout and last-admin races. No deletion/new-user/password-reset/role-assignment controls were invented.

New admin-only GET /admin/users returns a minimal private summary, with actual name, phone, role, active state, email-verification boolean, createdAt when recorded and a dedicated access version. No email address, password hash, session/OTP/token, auth counters or payment credentials. Query and filters validated strictly, name/phone regex escaped, matching count and fixed25-item page use5-second DB bounds; cursor signed and bound to admin/filter/sort.

PATCH /admin/users/:id/access accepts only version, active and a trimmed10–500 character operator reason. Database-backed authentication plus admin role required. Within one transaction, expected accessVersion is checked, protected targets refused, access changed, access/auth versions incremented, sessions deleted and audit appended. Stale409 requires refresh; role injection is rejected. Same state/current version is a no-op. Existing login writes also touch the same user and auth version, so restoration cannot revive deleted/revoked sessions. Existing push worker already checks active user and session/auth version. Already authorised in-flight requests and delivered notifications cannot be retroactively recalled.

Blocking is account access control, not product/shop/order moderation. It never hides public listings, changes shop approvals, cancels orders, releases stock, refunds money, completes delivery or records cash/payout. Admin UI explicitly directs review of affected shop operations separately. Existing seller/delivery onboarding and buyer signup remain unchanged.

UI requires reason plus explicit confirmation, supports cancel, locks duplicate clicks, refreshes actual server state and invalidates user/seller/audit caches. Errors preserve the reason and require an explicit refresh before retry. Current protected accounts have no block button. State changes do not display optimistic success before the API acknowledges them. Fixed empty optional search serialisation so clearing/submitting empty search never sends literal q=undefined.

## Verification

- Backend:8 files /186 tests passed. Lint, typecheck and build passed. New isolated integration tests cover unauthorized/admin-only access, exact safe DTO fields, protected admin/self, reason validation, strict role-injection rejection, concurrent change/stale version, session deletion and blocked login, old-token rejection after restore, fresh login, atomic audit entries, escaped search, role/state filtering and filter-bound pagination.
- Frontend:64 files /279 tests passed. Final lint0 errors /23 existing warnings. TypeScript and production build passed. New tests cover confirmation, protected accounts, cursor reset, failure draft retention and empty-query serialisation. Existing React act/Vite warnings remain.
-9 isolated Chromium checks passed: real directory/sidebar route, reason/confirmation cancel/block, actual old-token401, restore leaves old token revoked and fresh login200, protected admin/no role mutation, server search/filter/clear/empty,768/390/320px cards/drawer and Escape, list-error retry, no page errors. See browser-report.json. Desktop and320px details visually inspected.
- Backend tests initially could not connect to the sandbox loopback MongoDB (EACCES); rerun with permission against isolated in-memory MongoDB passed. Browser test initially checked token before PATCH completed; corrected to await the actual successful HTTP response and drawer unmount; complete run passed.
- No production account/database, provider, infrastructure, credentials or hosting modified. Browser accounts are existing QA DEMO temporary fixtures on4001/8083. Physical phone/screen reader and production-size directory throughput not tested.

## Changed files

Backend:
- src/admin/users.ts — strict account directory/access routes and transaction/audit.
- src/auth/models.ts — backward-compatible accessVersion default0 and timestamp typing; no migration/index command needed or run.
- src/app.ts — mounts routes behind existing authentication/admin middleware.
- test/admin-users.test.ts — isolated integration regression suite.

Frontend:
- src/domain/admin-users.ts and src/services/admin-users.ts — typed new API boundary.
- src/components/portal/AdminUsers.tsx and src/styles/admin-users.css — workspace, filters, review/confirmation and mobile layout.
- src/routes/admin.users.tsx, src/routes/admin.tsx, src/routeTree.gen.ts — file route and enabled navigation.
- src/components/portal/PortalShell.tsx — removes Users & roles disabled placeholder; other unavailable sections remain.
- src/components/portal/LiveAdmin.tsx — connected dispatch.
- src/test/admin-users.test.tsx, src/test/admin-users-service.test.ts — UI/service regressions.
- docs/API_CONTRACT.md — new endpoint/semantics documented before implementation.
- scripts/users-access-qa.mjs and docs/users-access-verification/* — repeatable isolated evidence.

Existing datasets need no destructive migration: missing accessVersion is treated as0 and conditionally incremented. Restart backend/frontend development processes to load new routes if they are not watching files. This is local implementation/verification, not deployment.

## Remaining scope

Role conversion/privilege assignment and admin account recovery require separate explicit workflows and safeguards. Reports & analytics and global Platform settings are still future work. No fake controls for these were enabled.
