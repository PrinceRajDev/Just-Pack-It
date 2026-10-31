# Order support redesign — 2026-10-31

Connected `/admin/support` now matches the cream/forest-green visual language of the other redesigned admin pages. Compact editorial header, decorative support illustration, four pastel loaded-result statistic cards, unified server-search/status/clear/refresh toolbar, desktop ticket table, mobile cards, structured details drawer, loading skeletons and clear empty/error states. Shared admin shell/sidebar/topbar/search/notifications/profile/logout/navigation and existing demo route remain unchanged.

## Data and functionality

Existing support services, DTOs, query keys, role checks, expected-version writes, literal server search and explicit cursor loading reused. No API/contract/backend/environment/dependency changes. Ticket IDs, original descriptions and exact order/suborder relationships preserved. Date display uses actual createdAt/updatedAt in IST. Ticket status displayed with text and distinct open/in-progress/resolved colours.

The support API returns filtered pages, not global counts. Cards intentionally count only currently loaded matching results and explicitly explain their scope; load-more adds actual returned rows. Errors show unavailable counts, never fake zero. No historical trend/sparkline or invented performance metric. The copy says buyer issues by shop because the existing backend allows buyers to create issues; it does not imply sellers raised them.

Ticket details retain exact order navigation, buyer-visible note validation, mark-in-progress, resolve, existing SupportConversation replies/reopen, polling, pagination and retry/idempotency semantics. Status updates use the actual ticket version and a synchronous request lock; failure retains the entered note. Conversation/status operations remain mutually disabled while busy. Background list refresh/error disables stale ticket writes. Successful status update refreshes the conversation as well as tickets so appended status messages appear. Successful note save clears its draft; failed save does not. Initial resolved tickets do not preload the old resolution into a new update draft. Actual API response drives success feedback; support never issues refunds or changes order/payment/fulfilment.

## Verification

- Full frontend:61 files /269 tests passed. Final lint:0 errors /23 existing warnings. TypeScript and production build passed. Existing React act/Vite configuration warnings remain.
-10 isolated Chromium checks passed; see browser-report.json. Actual buyer-created ticket, versioned in-progress update, resolve, reopen and conversation reply persisted through the existing temporary API. Server conversation search/status/empty/clear, conflict draft retention, unavailable counts on list error and retry verified.768/390/320px cards/drawer bounds and Escape checked; conversation refresh retains the unsent reply. No browser page errors.
- Existing unit regressions still verify support note validation, optimistic version, status-change cursor reset, load-more, safe conversation retry/idempotency and other seller/buyer behaviour. Added tests cover scoped partial counts, failed-list search retention/unavailable counts and duplicate status-update locking with draft retention.
- Desktop and320px drawer screenshots visually inspected. Physical phones, OS keyboard, screen readers and production-scale performance were not tested. Full-page screenshots can position fixed shell elements at the captured scroll position; viewport bounds were checked separately.
- Verification used the existing explicit QA_SUPPORT_FIXTURE disposable database/API on4001 and isolated frontend on8083. No production/Atlas tickets, customer data, real payments, hosting or infrastructure touched. QA records and all conversation text are explicitly labelled QA DEMO. Backend application test suite was not rerun; no backend files changed for this task.

## Exact changed files

- src/components/portal/LiveSupport.tsx — connected page presentation, scoped statistics, unified filters, table/cards, drawer and status-update handling.
- src/styles/admin-support.css — scoped responsive visual styles and reduced-motion support.
- src/test/support-alerts.test.tsx — existing drawer interaction regression plus three new meaningful tests.
- public/admin-support-hero-v1.webp — decorative generated artwork through imageUrl().
- scripts/support-redesign-qa.mjs — repeatable isolated support browser verification.
- docs/support-redesign-verification/README.md, browser-report.json and PNG screenshots — report/evidence.

The existing shared SupportConversation, support services/domain/API contract, admin route/shell and other admin pages were not modified.

## Asset provenance

Imagegen source C:/Users/hp/.codex/generated_images/01a18195-8a83-7453-9eca-1b2df859c54a/exec-49a98ee0-288a-44a5-a930-df35063c6999.png; resized to900px WebP. Prompt: friendly Indian female support agent in forest-green shirt/headset at laptop with kraft parcels, sage leaves and blank chat/ticket shapes on warm cream paper, natural light, no words/UI/metrics or real-person likeness. Decorative illustration, not an actual employee/customer record. Empty state uses native headset/chat icons and CSS, with no external image URL.

## Remaining dependencies and limits

Global ticket counts/trends require an authorised aggregate API; none is invented here. Existing conversation key is in memory, not durable offline/reload recovery. No attachments, seller conversations or additional ticket actions were introduced. The requested working admin support functions remain available; actual-device and production-capacity verification remain outside these browser checks.
