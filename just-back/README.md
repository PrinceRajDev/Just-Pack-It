# Just Pack It backend — Phase 1

Current extensions include live account addresses, read-only cart/fulfilment/checkout reviews and internal inventory hold/release primitives. Real order placement, public reservation creation and payments remain disabled. The separate optional expiry worker and admin inventory-status API are documented in [inventory operations](docs/INVENTORY_OPERATIONS.md); it defaults off and was not activated against Atlas. Older Phase 1 sections below describe the initial baseline; current contracts are in `docs/API.md`.

COD order creation and buyer-owned paginated reads are implemented behind an explicit default-off flag; see [COD orders](docs/COD_ORDERS.md). Frontend confirmation/recovery/history and [seller processing](docs/SELLER_ORDERS.md) are integrated, including versioned acceptance/preparation and safe pre-preparation cancellation/restock. Handoff, COD collection/settlement and real-browser journey verification remain, so customer-facing COD activation stays off. Online payments remain unavailable.

Current handoff extension: buyer-generated account receipt codes and seller cash acknowledgements now support pickup/seller-delivery completion with expiry, lockout, single-use verification and atomic cash reports. See [handoff/cash](docs/HANDOFF_COD.md). Cash is labelled recorded, never gateway-verified or settled. Live activation is still off pending the populated browser journey and operational checks; no SMS/provider, settlement or platform-rider integration is implied.

Extension: product photo upload support is now implemented behind optional Cloudflare Images configuration. See [image setup](docs/IMAGES.md). Original Phase 1 boundaries below predate this extension. No Cloudflare account/resources are provisioned automatically, and no real provider upload is claimed until credentials and a real seller/listing are available.

Separate Node.js / Express / TypeScript / MongoDB / Mongoose application. Foundation, authentication and catalogue only. No checkout, orders, payments, delivery dispatch, uploads, Razorpay or Cloudflare connections. The existing `../just-front` is unchanged and is not automatically connected.

## Run locally

Use Node 24 (tested) and a MongoDB replica set or compatible sharded deployment. Standalone MongoDB is deliberately rejected because catalogue integrity relies on transactions.

```powershell
cd D:\justpackit\just-back
npm ci
Copy-Item .env.example .env
# Edit .env: supply your development replica-set URI and TWO independent random secrets.
# The placeholder secrets intentionally fail validation. Do not commit .env.
npm run db:indexes
npm run dev
```

Default listener: `127.0.0.1:4000`. `GET /health` is liveness; `GET /health/ready` checks database readiness. No database was provisioned or production infrastructure changed by this implementation.

Generate each secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` locally and keep it private. Database credentials and session/cursor secrets belong only in backend environment/secret management. TLS belongs at the ingress; production CORS origins must use HTTPS. Trust proxy is **false**; review trusted proxy addresses before changing it, rather than trusting arbitrary forwarded IPs.

## Authentication and privileged users

Admins can now add seller accounts directly from the frontend `/admin/partners` dashboard through admin-only `POST /admin/sellers`, and view the paginated directory with `GET /admin/sellers`. Shop onboarding/approval stays separate. The CLI below remains available for initial admin bootstrap and operator fallback; seller creation no longer requires editing `.env`.

Buyer registration and password login are implemented. Public registration always creates `buyer`; role/owner fields are rejected. Tokens are random opaque bearer secrets; only HMAC hashes are stored in MongoDB. Roles/active state are read from the user document on each request. Logout revokes a session; expiry is checked even before TTL cleanup. Scrypt uses random salts and fixed work parameters, bounded concurrent hashing, account/IP Mongo-backed throttles and generic login failures. There is no fake OTP.

Existing frontend `/auth/send-otp` and `/auth/verify-otp` return **503 OTP_UNAVAILABLE** until an SMS provider is configured. Frontend password login UI is a future integration change; this phase does not modify it. Password recovery, verified-phone enrollment and MFA are not implemented, so this is an authentication foundation, not a finished consumer identity product.

To provision an operator/seller/delivery account, set `OPERATOR_NAME`, `OPERATOR_PHONE` (E.164), `OPERATOR_PASSWORD` (12–128 characters), and `OPERATOR_ROLE` (`admin`, `seller`, `delivery`, `buyer`) in a protected local process environment, then run:

```powershell
npm run create-user
```

The CLI only creates new users, never changes an existing account's role/password, and does not print credentials. No privileged account was created automatically. Seller shop ownership is derived from that authenticated user's ID; Phase 1 permits one shop per seller. Admin product management uses explicit shop-scoped routes.

## Optional development fixtures

### Explicit catalogue configuration

`npx tsx scripts/configure-catalogue.ts` requires explicit `SETUP_AREA_NAME`, `SETUP_AREA_CITY` and comma-separated `SETUP_AREA_PINCODES`; there is no default locality or pincode. It configures the selected area and 17 categories through the running local admin API. Development mode and privately configured admin `OPERATOR_PHONE`/`OPERATOR_PASSWORD` are required. It skips matching records, verifies public visibility and revokes its temporary session. It creates no shops/products/customers and does not overwrite existing records. Removing a code default does not delete any existing database service-area record.

`npm run seed:dev` refuses unless NODE_ENV is `development`, the URI database name ends `_dev`, and `ALLOW_DEVELOPMENT_SEED=true`. It inserts only labelled development category/area fixtures. No users, shops, customers or production data are seeded; no delete/drop/reset commands exist in the script. The seed was not run against any persistent database.

## Verification

```powershell
npm run build
npm run typecheck
npm run lint
npm run test
npm audit --omit=dev
```

Tests launch their own temporary MongoDB replica set with `mongodb-memory-server` and Supertest. They do not load `.env` or use a supplied MONGODB_URI; first run may download a MongoDB binary into `.cache/mongodb`. Test teardown stops that temporary server. See `docs/VERIFICATION.md` for exact final results and tested boundaries.

Production auto-index creation is disabled. Run the explicit `db:indexes` command as an operator-reviewed deployment migration; it creates declared indexes without dropping data/indexes. Production startup verifies critical uniqueness/TTL indexes exist and fails closed otherwise. Back up and review migrations independently before a real deployment.

See [design/contract mismatches](docs/DESIGN.md) and [complete Phase 1 API](docs/API.md). Public DTOs use UUID strings, INR amounts, category slugs plus IDs, server-computed open status, and bounded array responses with pagination headers. The frontend must follow cursors and replace remaining demo lookups before switching to live catalogue/auth.
