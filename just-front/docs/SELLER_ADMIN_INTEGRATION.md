# Seller and admin integration

Review feedback update: admin applications default to pending, with status and shop-name/address filters. Rejection/suspension requires a seller-visible reason. Owner dashboard/settings show the latest reason and actual review timestamp; resubmission labels old feedback as previous. Approval clears an obsolete rejection reason unless the admin writes a new note. Notes/reviewer IDs never enter public shop responses. This persists the latest review only. Existing records without review metadata remain valid. Reject/suspend API calls without a reason now return 400; approved/pending are unchanged.

Current signup flow supersedes manual dashboard provisioning: the registration form offers **Buyer** and **Seller**. Seller signup collects the owner account plus shop name, full address, configured shop types/categories, service area, establishment year and fulfilment choices. `/auth/register/seller` commits the seller, pending owned shop and session atomically. Registration routes the seller to their workspace to finish hours/products. The dashboard shows a seller directory and approval applications; its manual Add Seller form is no longer rendered. `/auth/register` remains the compatible buyer endpoint. Admin/delivery self-registration is not allowed. Older provisioning notes below describe the previous iteration; its backend API remains an admin-only operator fallback.

Existing layout routes select real API workspaces when VITE_API_URL is configured. Demo mode retains its original outlets/provider/forms. Branding and routing libraries are unchanged.

## Connected screens

- `/seller`: post-signup setup checklist from saved profile, operating hours, actual catalogue and admin status. Stock readiness never implies approval or live ordering; catalogue failures show "Not checked". Pending/rejected/suspended/inactive shops show appropriate next actions. `/seller/settings`: owner-scoped profile editing; new and changed profiles require admin review.
- `/seller/products`, `/seller/inventory`: owner listings, actual prices and variant-aware stock.
- `/seller/products/new`, `/seller/products/:id/edit`: durable listing create/edit and deactivation, image URL/key preview, flexible product attributes. Save a base listing first, then add optional variants through dedicated product-scoped endpoints. Existing option IDs remain stable; parent stock is not added to variant stock.
- `/admin`, `/admin/partners`: view self-registered sellers, review actual shop submissions and save approval decisions. Manual account creation is no longer rendered.
- `/admin/catalog`: persisted taxonomy and subcategory creation/renaming/guarded deactivation. `/admin/settings`: persisted area creation/editing/activation.

Mutations send the last-read document version, with parent product versions for variants. Conflicts are shown without automatically retrying writes; server validation field names are displayed. Successful writes invalidate catalogue/management queries. Shop/listing/variant forms protect unsaved navigation. Listing and option editors save separately. Empty/no-shop, loading and request-failure states are distinct.

Backend addition: private shop responses include `temporarilyClosed`, preventing accidental clearing of closure overrides when editing. Public responses remain unchanged.

## First real seller

1. Admin signs in, opens `/admin/partners` and fills **Add a seller**. The new `/admin/sellers` API assigns only seller roles, rejects an existing phone without changing it, and never returns passwords, hashes or login tokens. Use a distinct seller phone; share the password privately. SMS invitations/password recovery are not implemented. Password fields and mutation variables are cleared after a completed request; passwords are never put in browser storage. The CLI is now only a bootstrap/operator fallback.
2. Seller signs in at `/login` and submits actual shop details, the configured service area, relevant categories, hours and fulfilment methods.
3. Admin reviews and approves in `/admin/partners`.
4. Seller adds real listings/options. Buyer selects their service area → category → shop → listing. Public APIs exclude unapproved/inactive shops.

The local frontend `.env.local` now sets VITE_API_URL=http://localhost:4000. Removing that setting restores demo mode after Vite restarts. Backend/CORS must permit http://localhost:8081. Credentials remain backend-only.

## Deferred and verification boundaries

Uploads, checkout, reservations, payments, promotions, orders, payouts, dispatch, disputes and reports are unavailable in API mode; delivery stays guarded. Image previews require an existing durable URL/key and do not upload files.

Frontend HTTP/form tests cover onboarding, closure/version retention, owner-scoped payloads, listing creation/navigation, option identity/stock/price, admin approval, conflicts and attribute-row removal. Backend tests use an isolated MongoDB replica set. Real browser verification used the configured admin to read the persisted service area and the 17 categories, without adding a fabricated seller/shop/product or submitting approval decisions. A complete live seller-to-buyer write journey still needs a real seller account and actual shop/product details.

Changed frontend sources: `src/domain/management.ts`, `src/services/management.ts`, `src/lib/api/client.ts`, `src/components/auth/RoleGuard.tsx`, `src/components/store/StoreLayout.tsx`, `src/components/portal/LiveSeller.tsx`, `LiveProducts.tsx`, `LiveAdmin.tsx`, `management-shared.tsx`, `useDraftGuard.tsx`, `src/routes/seller.tsx`, `admin.tsx`. Added management/onboarding UI tests. Backend changes: `src/catalogue/routes.ts`, `test/phase1.test.ts`.

## Checks on 2026-10-29

Review feedback update: frontend 60 tests across 13 files and backend 40 tests across 2 files passed. Both typechecks/builds and backend lint passed; frontend lint has 0 errors and 22 existing Fast Refresh warnings. Coverage includes required reasons, safe owner/public responses, authenticated reviewer attribution, previous feedback after resubmission, stale/concurrent decisions, admin filtering and reason payloads. Tests used mocks/isolated MongoDB; no real shop decision was submitted. New/changed sources: backend catalogue model/validator/service/routes and phase1 regression test; frontend management types/service, `ShopReviewNotice.tsx`, `LiveAdmin.tsx`, `LiveSeller.tsx`, `SellerOnboarding.tsx` and management/onboarding tests. A real seller/application is still needed for live review-write verification.

Post-signup readiness update: 56 frontend tests pass across 13 files, including pending/suspended visibility, approved-but-closed browsing, sold-out variants with nonzero parent stock, and catalogue failure/retry. Added `src/components/portal/SellerOnboarding.tsx` and `src/test/seller-onboarding.test.tsx`; updated `LiveSeller.tsx` and seller navigation. Backend endpoints/data were not changed or reseeded; backend tests were not rerun for this frontend-only update. Live seller-dashboard verification still needs a real registered seller/shop.

Buyer/Seller self-registration update: 51 frontend tests pass across 12 files; 39 backend tests pass across 2 files. Both typechecks/builds and backend lint pass; frontend lint has 0 errors with 22 Fast Refresh export warnings. Tests cover simple buyer signup, seller fields/configured IDs, missing configuration, switching account types, forced server roles, pending visibility, transactional rollback, duplicate races and same-name independent shops. Browser verification confirms the selector and configured service-area/17-category options without creating a fabricated account. Screenshot: `buyer-seller-signup.png`. A full live registration/approval write journey still requires a real seller's consent and actual details; SMS verification remains unavailable.

Additional changed sources for this update: frontend `src/components/auth/LiveAuthForm.tsx`, `SellerSignupFields.tsx`, `src/components/portal/SellerDirectory.tsx`, `src/services/auth.ts`, `src/stores/auth.tsx`, `src/routes/login.tsx`, `src/routes/shop.$slug.tsx`, domain/management types and signup tests; backend `src/auth/seller-registration.ts`, `src/auth/routes.ts`, catalogue model/validator/presenter/service files and registration regression tests.

Admin-created seller update: frontend now passes 46 tests (11 files), backend passes 35 tests (2 files); typechecks, lint and builds pass. Frontend lint retains 20 Fast Refresh warnings. Added coverage for anonymous/non-admin denial, forced seller roles, usable seller login, duplicate and concurrent-duplicate protection, safe summary fields, cursor scope, form phone normalization/password clearing and visible duplicate errors. Real browser verification confirmed the form and empty seller directory using the actual admin; no seller account was created in Atlas for testing. Screenshot: `admin-add-seller.png`. Verification session was signed out.

- Frontend: `npx tsc --noEmit` passed; `npm run test` passed 43 tests across 11 files; `npm run lint` completed with 0 errors and 20 Fast Refresh export warnings; `npm run build` passed in API mode. Vite still reports its existing redundant tsconfig-path plugin warning.
- Backend: typecheck, lint and build passed; 30 tests passed across 2 files using a temporary replica set, not Atlas.
- Frontend tests now force a demo default independently of `.env.local` and reject unmocked network requests. API tests explicitly mock config/HTTP. This fixes local configuration leaking into demo regressions; an intermediate run failed before that isolation fix.
- Browser: real admin sign-in, empty shop approvals, persisted the configured service area and 17 categories rendered successfully. Verification session signed out afterwards. Historical admin screenshot retained in the documentation directory.
- Not verified: a real seller's shop submission, approval write, live product/variant writes and resulting buyer visibility. Those are covered with mocks/isolated backend tests, and need actual seller/shop data for Atlas end-to-end verification.
