# Phase 1 decisions (recorded before implementation)

Frontend inspected: React/TypeScript, TanStack Router/Query, Vite; services/catalog.ts and orders.ts call api(), bearer sessions, public arrays. Seller/delivery/admin stores and synchronous product/shop/cart lookups remain demo-only. Frontend source, docs and configuration will not be edited.

## Compatibility and scope

- `/areas`, `/categories`, `/shops`, `/shops/:slug`, `/products`, `/products/:id` retain existing DTO fields and array list bodies. Add opaque IDs, version metadata and pagination headers (`X-Next-Cursor`, `X-Total-Count`). Default/max limits 50/100; consumers must follow cursors in a future frontend integration. Unapproved/inactive shops and inactive products are excluded before filtering/pagination. Out-of-stock and closed approved shops remain visible with explicit availability; they are not purchase authorisation.
- Category IDs are internal references; public products keep categorySlug, shops keep category slug arrays. Subcategories have immutable IDs embedded in their category. Category slugs are immutable, to preserve public routes. Removal/deactivation rejects all existing listing/shop references. Concurrent reference creation and deletion write the same category document in a transaction, avoiding check/delete races.
- Shop ownership is a server-side immutable ownerId relation. One shop per seller in Phase 1 matches `/seller/shop`; schema can be extended later. Sellers create pending shops; only admins approve, reject or suspend. Profile/serviceability/category changes return the shop to pending. Structured weekly operating intervals plus timezone determine isOpen server-side (including overnight intervals); free text hours remains display-only. Area membership is explicit, never inferred from locality/PIN.
- Products belong to exactly one shop and category; optional subcategory must belong to that category. Variants are embedded bounded subdocuments with server-generated immutable IDs; all CRUD resolves through the owning product and shop. Price/stock patches are permitted only after server-side authorisation, strict validation and optimistic version checks. No buyers can set catalogue prices, stock or ownership. Money uses integer paise internally, INR numbers in existing DTOs. Parent stock is not added to variant inventory.
- Cursor pagination is deterministic keyset pagination over the requested sort plus immutable ID, with an HMAC-signed cursor bound to endpoint/query filters. Search is bounded, escaped server-side substring matching across all query tokens (no unbounded regex or operators). Typo ranking/Atlas Search is a future enhancement, documented rather than silently emulated over one page.
- Password-based buyer registration/login returns the existing `{userId,name,role,token,isDemo:false}` Session shape. Scrypt passwords, hashed opaque expiring bearer sessions, database-loaded roles/active state and logout revocation. Public registration cannot choose a role. Privileged users are provisioned through a local operator CLI. Existing OTP routes fail explicitly with 503 until an SMS provider is selected; no fake OTP success. Auth throttles are Mongo-backed for multi-process consistency.
- Public DTO allowlists exclude account IDs, owners, password/session hashes, approval notes and operational revision counters. Error responses include `message`, `code`, requestId and safe validation paths. Logs never contain request bodies, tokens, passwords or Mongo credentials.
- All multi-record catalogue writes require replica-set MongoDB transactions. Soft deletion preserves identities. No checkout, orders, payment/refunds, delivery assignment, uploads, Razorpay or Cloudflare integration.
- Development seed is opt-in, restricted to an explicitly named development database; inserts labelled taxonomy/area fixtures only, no fabricated live shops or customer data. Tests use an isolated temporary replica set, never a configured production database.

## Implementation sequence

1. Validated env, connection lifecycle, health/readiness, request IDs/security/logging/error middleware.
2. User/session/throttle models, register/login/logout and authentication/role middleware.
3. Taxonomy/area/shop/product models, domain validation and transactional ownership/reference/version enforcement.
4. Public DTOs, filters/search/sorting/signed cursors, seller/admin CRUD.
5. Isolated real-Mongo integration tests covering authorisation, unrelated variants, validation, hidden records, references, pagination and races; build/typecheck/lint and exact results.

The existing frontend must remain in demo mode until its pagination, auth, seller mutation and synchronous lookup dependencies are deliberately integrated in a separate phase. This backend does not claim a real-market launch or a completed frontend connection.
