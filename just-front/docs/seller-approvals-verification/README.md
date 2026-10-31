# Sellers & Approvals redesign — verification 2026-10-31

Connected `/admin/partners` redesigned against the supplied reference. Existing admin shell/sidebar/topbar/notification/auth/logout and seven routes preserved. Editorial shopkeeper hero, four pastel count cards, status tabs, owner/address search, category/area filters, A–Z/Z–A sorting, desktop application table, responsive cards, review drawer and illustrated empty/loading/error states added. Suspended status retained. Registered seller directory and existing delivery approval/exception tools remain accessible in expandable sections.

## Data and action integrity

Total sellers uses the existing complete seller-account service; shop counts use the complete admin shop service. No statistics hardcoded. Seller-account IDs are joined to the existing admin shop `ownerId`; `ManagedShop.ownerId?` is an additive frontend type declaration of an already-returned admin-only field, not a backend/API change. Owner phone appears only in the existing admin-guarded review drawer/directory. No credentials or new private fields fetched.

Approval/rejection uses existing `management.approve(shop,status,reason)` endpoint and server version. Clicking row Approve/Reject only opens the decision drawer. Explicit confirmation precedes mutation; rejection/suspension reason required and trimmed; busy ref plus disabled actions blocks duplicate requests. Success/error toasts reflect actual response. Saved review invalidates admin shops/operations and public shop caches. Failed/stale review keeps draft and does not locally rewrite counts. Background-data errors/refresh prevent saving against incomplete review context. Approval means admin-approved status, never proof a shop is currently open, active or serviceable.

Submission date, seller email/account creation date and identity documents are not supplied by the current APIs. They are clearly unavailable; no fabricated evidence/date. Newest/oldest sorting omitted because no submission timestamp exists. Date/serviceability claims are not inferred from UUID, review date or array order. Actual last-successful query refresh timestamp shown in IST. Search includes actual shop, address/locality and joined seller name. Filters preserve exact configured category/area IDs. Existing `apiAll` pagination service behaviour retained; this frontend redesign does not introduce new server filtering/count APIs.

The existing demo-only `/admin/partners` route component remains untouched; connected page uses the new view via existing LiveAdmin dispatch. No production account/shop mutations were used for verification.

## Verification

- Full frontend:59 files /258 tests passed. Existing older approval tests were updated to open the new drawer and confirm before asserting the unchanged versioned request; they still check reason and real shop details. New tests cover counts/search/no-results, confirmed approval/refetch, failure draft retention, unavailable vs empty, refresh and duplicate confirmation.
- Lint0errors/23existing warnings. Final TypeScript check and production build passed after test-selector correction. Pre-existing full-suite React act warnings remain.
-11 isolated Chromium checks passed (`browser-report.json`): real temporary API counts, approve only after confirmation, persisted rejection reason/count, owner search/no-results reset/Z–A, configured category/area filters,768/390/320px drawer/cards and Escape, failed-load retry distinct from empty, data-driven empty illustration/refresh, no page errors. Approval fixtures restored to their original status at end. Actual phone/OS keyboard/screen-reader and production throughput not tested.
- Desktop populated and empty,320px drawer screenshots visually inspected. Full-page captures include fixed-position drawer at the captured scroll position; measured drawer bounds were checked after its slide animation finished. No horizontal page overflow in responsive checks.
- All tests used existing explicit isolated QA server/temp MongoDB. No Atlas, provider credentials, index migration, real notification email/payment or hosting changes. Backend source/contracts unchanged; backend suite not rerun for frontend presentation-only work. Browser requests exercised existing actual approval API.

## Changed files

- `src/components/portal/LiveAdmin.tsx` (delegate approvals view; remove replaced inline form)
- `src/components/portal/SellerApprovalsPage.tsx` (new)
- `src/components/portal/AdminShopReview.tsx` (new)
- `src/domain/management.ts` (`ownerId?` reflects existing admin response)
- `src/styles/seller-approvals.css` (new, page scoped)
- `src/test/seller-approvals.test.tsx` (new)
- `src/test/onboarding-ui.test.tsx` (update existing regression interactions)
- `scripts/seller-approvals-qa.mjs` (new)
- `public/admin-seller-hero-v1.webp` (85,490 bytes)
- this report/evidence directory, browser-report.json and screenshots

## Decorative hero asset provenance

Built-in imagegen skill/tool used. Generated original preserved at `C:/Users/hp/.codex/generated_images/01a18195-8a83-7453-9eca-1b2df859c54a/exec-08bef502-53db-4bdc-a3af-360de47d908a.png`; inspected, resized/optimized with Sharp to workspace `D:/justpackit/just-front/public/admin-seller-hero-v1.webp` (900px wide, WebP82). Decorative empty-alt illustration only; never a real seller record/document/photo claim. No logo/ratings/text in generated image. Empty-state storefront reuses existing native SVG illustration.

Prompt: Create one premium editorial illustration for the hero of an Indian neighbourhood marketplace admin seller-approvals page, not a UI mockup. Wide3:2 landscape composition. A friendly middle-aged Indian kirana shopkeeper with moustache in a cream shirt and deep forest-green apron, arms naturally folded, standing in his small local store, shelves of colourful unbranded packets and jars behind him and a few fresh vegetables in foreground. Painterly photorealistic editorial collage, warm natural daylight, authentic welcoming local-business character. Soft cream paper background #FCF9F2 with irregular brushed paper edges fading into cream, subtle pale sage leaves at edges. Main person on centre-right, cropped waist up, full head visible. Rich forest green, warm cream and restrained ochre palette. No text, logos, watermarks, ratings, UI or identifiable real person. Clearly decorative illustration, not a genuine seller listing photograph.

## Remaining backend dependencies

Submission timestamp and server date sorting, optional verified seller contact/email/document fields, scalable server-side application search/filter pagination and aggregate counts need separate contract work. Current services still fetch all cursor pages for existing complete-list screens. No unsupported controls are presented as functional.
