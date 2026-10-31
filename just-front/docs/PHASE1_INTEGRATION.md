# Phase 1 frontend integration

Update: seller/admin catalogue and onboarding workspaces are integrated; see [current integration](SELLER_ADMIN_INTEGRATION.md). Earlier scope/verification notes below describe the original Phase 1 boundary. Atlas connectivity and real admin read-only browsing have since been verified; live seller writes still require actual seller/shop data.

The frontend now consumes the catalogue and password authentication implemented in `../just-back`. Existing routes, branding and demo mode remain in place. An empty `VITE_API_URL` selects the demo; a configured URL selects API mode without falling back to demo records on failure.

## Local setup

1. Configure `just-back/.env` from its example with your MongoDB Atlas development database URI, independent session/cursor secrets, and `CORS_ORIGINS=http://localhost:8081`. Keep credentials out of frontend files and chat. Follow the backend README for database permissions and setup.
2. In `just-back`, run `npm run dev` (default port 4000).
3. Copy the frontend `.env.example` to `.env.local`, set `VITE_API_URL=http://localhost:4000`, and restart `npm run dev`. Check the printed Vite port matches backend CORS configuration.
4. Verify `/health`, category/area discovery, shop/product links, buyer registration, login, refresh and logout against your development database. No live Atlas connection was available during implementation; these checks remain pending.

## Supported and deferred

- Public areas, categories, shops, products and variants come from the API. Direct product links load real shop metadata. Missing records return the existing not-found state.
- Password registration creates buyers only. Login roles come from the backend; demo roles/tokens are isolated from API sessions. Stored sessions are validated through `/auth/me`; logout revokes the server session. The current bearer token uses localStorage: strict CSP and XSS prevention are required before launch; an HttpOnly cookie migration needs backend CSRF/session design.
- API mode is an explicitly labelled catalogue preview. Cart, checkout, order history, workspace management and wishlist actions are unavailable. This prevents local demo state from implying successful real operations. Demo mode keeps those working features.
- Seller/admin catalogue CRUD exists in the backend but their frontend workspaces are not integrated yet. Address persistence, inventory reservations, quotes, payments, uploads, delivery and operational screens remain subsequent work.
- Array-based screens currently follow cursor pages (100 records/page, at most 100 pages) and fail clearly rather than silently truncate. This is a compatibility adapter; incremental pagination is still needed for large catalogues. Caches contain public data only and are not inventory reservations.

## Verification

The added API adapter tests use mocked HTTP responses. They cover pagination, cursor errors, missing CORS pagination headers, demo-token isolation, expiry events, 404 handling, real owner metadata, buyer registration payloads and safe redirects. They do not establish a real MongoDB/HTTP end-to-end connection.

Checks run on 2026-10-29:

- `npx tsc --noEmit`: exit 0.
- `npm run test`: 9 test files, 31 tests passed (including 7 new API adapter tests).
- `npm run lint`: exit 0, 0 errors and 15 Fast Refresh export warnings.
- `npm run build`: exit 0, client and server bundles built. Vite reports the existing redundant tsconfig-path plugin warning.
- Browser smoke: demo login at port 8081 retains OTP/demo-role options. Separate API preview at port 8082 shows password login and buyer-registration fields, and `/cart` shows an unavailable-ordering state without creating an order. The temporary preview is stopped after verification. Screenshot: `phase1-auth-preview.png`.

Remaining unverified: real Atlas connection, actual account creation/session restore/revocation against a running backend, live catalogue discovery with persisted data, and full cross-role backend integration. Backend Phase 1 tests are documented separately in `just-back/docs/VERIFICATION.md` and were not rerun for these frontend-only changes.
