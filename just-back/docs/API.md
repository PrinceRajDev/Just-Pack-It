# Phase 1 API

Razorpay extension: see `docs/RAZORPAY.md` and frontend `docs/API_CONTRACT.md` for server order creation, callback verification, raw signed webhooks, reconciliation, test-mode labelling and prepaid handoff. Online payments are independently disabled by default; COD remains compatible. Refunds, abandoned-payment closure and marketplace settlement are not implied.

Base URL in development: `http://127.0.0.1:4000` (no `/api` prefix). Bearer header: `Authorization: Bearer <token>`. JSON only, 128 KB body limit. Object/query schemas reject unknown fields. IDs are server-generated UUIDs; names, prices and quantities are validated, never trusted merely because a client sent them.

## Response conventions

Read-only cart catalogue review is now available at public `POST /cart/quote`; see [cart review contract](CART_REVIEW.md). This is not order checkout or an inventory reservation.

Product photo upload extension: see [Cloudflare Images setup and contract](IMAGES.md). Authenticated sellers can query `GET /seller/image-upload` and upload a raw JPEG/PNG/WebP (≤5 MiB) to `POST /seller/products/:productId/image` with `X-Product-Version`. Ownership/version are checked before provider work; actual bytes are decoded/normalised. The response is the updated managed product. Missing provider configuration returns 503; provider failure 502; invalid image 415; oversized body 413; stale version 409. This replaces the draft signed-upload assumption for this flow; no `/uploads/sign` endpoint is created. Other upload domains remain unimplemented.

Public arrays remain compatible with the frontend's current list parsing. Paginated lists expose `X-Total-Count` (all matches before cursor), `X-Has-More`, and optional `X-Next-Cursor`. CORS exposes those headers. Default limit 50, maximum 100. Send the returned cursor unchanged with **the same query/sort/limit** for the next page. Cursors expire after one hour, are signed and bound to endpoint/filters/private actor scope. They provide deterministic keyset traversal, not a snapshot under concurrent catalogue or opening-status changes.

Error body:

```json
{"message":"Invalid request","code":"VALIDATION_ERROR","requestId":"opaque request ID","fields":["price"]}
```

Codes include 400 VALIDATION_ERROR/INVALID_CURSOR/INVALID_AREA/INVALID_CATEGORY/INVALID_SUBCATEGORY; 401 AUTH_REQUIRED/INVALID_SESSION/INVALID_CREDENTIALS; 403 FORBIDDEN/ORIGIN_DENIED; 404 *_NOT_FOUND; 409 VERSION_CONFLICT/DUPLICATE/CATEGORY_IN_USE/AREA_IN_USE/SHOP_ASSIGNMENT_IN_USE/LAST_VARIANT; 429 RATE_LIMITED; 503 OTP_UNAVAILABLE/AUTH_BUSY. Unknown exceptions return a safe 500 without stack, Mongo diagnostics or secrets.

All writes to existing catalogue documents require JSON `version` from the last read. Successful writes return the updated version (except 204 deletion, after which refetch). A variant write uses the **parent product version**. Concurrent stale writes return 409. Public array bodies are not wrapped in an envelope. Admin/owner responses add only the operational fields needed for management; public DTOs omit owners, account data, hashes, approval state and internal revisions.

## Health and authentication

### Buyer/seller self-registration (current onboarding)

Signup now offers Buyer or Seller. Existing `POST /auth/register {name,phone,password}` stays buyer-only and backward compatible. New public `POST /auth/register/seller` accepts `{name,phone,password,shop:{name,address,categoryIds[],serviceAreaIds[],since,fulfilment[]}}`. Shop name/address, active configured category/area IDs, actual establishment year and fulfilment choices are required. Server derives owner, seller role, unique slug, locality from the selected area, and initials; client role/owner/approval fields are rejected. User, pending shop and initial session commit in one transaction, so invalid references/duplicates leave no partial registration. Shops start pending with no operating intervals, stay outside the public catalogue, and require admin review. Seller completes hours/profile in the workspace. SMS/phone verification is still unavailable.

Managed and public shop DTOs gain optional `address` (up to 500 characters), distinct from locality. Old clients/shops without it remain compatible. Admin dashboard now reviews self-registered sellers rather than requiring manual account creation. Previously implemented admin provisioning API remains an admin-only operator fallback.

### Admin-created seller accounts

`POST /admin/sellers` accepts only `{name,phone,password}` (same E.164 and 12–128 character password validation as signup). An authenticated, active admin is required; the server assigns `seller`. It creates a new account only: existing buyers/admins are never converted or overwritten. Returns 201 `{id,name,phone,role:"seller",active}` with no hash, password or session token. Creation is throttled per admin (20 attempts/15 minutes). The admin supplies the initial password privately; no SMS/invitation delivery or forced password-change flow is implemented. Shop creation/approval remains a separate seller/admin workflow.

`GET /admin/sellers?limit&cursor` returns only seller account summaries with standard pagination headers. Signed one-hour cursors are scoped to the admin and limit; ordering is UUID ID ascending. Phone numbers are private to this admin-only response. Public signup stays buyer-only. The CLI remains a bootstrap/operator fallback, not a requirement for adding sellers.

| Method | Path | Permission / behavior |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/health/ready` | 200 connected, 503 unavailable |
| POST | `/auth/register` | `{name,phone,password}`; buyer only, 201 Session |
| POST | `/auth/login` | `{phone,password}`; 200 Session |
| GET | `/auth/me` | Authenticated, session profile without token |
| POST | `/auth/logout` | Authenticated, revoke current bearer; 204 |
| POST | `/auth/send-otp`, `/auth/verify-otp` | Explicit 503; no SMS provider selected |

Phone: E.164, `+` and 10–15 digits; password 12–128 characters. Session is `{userId,name,role,token,isDemo:false}`. Roles match frontend `buyer|seller|delivery|admin` (`delivery` means delivery partner). Roles cannot be chosen via public requests. Operator provisioning is documented in README. Auth throttles are fixed 15-minute buckets (100 login attempts/IP, 10/account, 10 registration attempts/IP); general process-local ceiling is 1000 requests/15min/IP. Production deployments should also enforce ingress/shared rate controls. Token lifetime defaults to 12 hours, configurable 1–72; there is no refresh flow.

## Public catalogue

| Method | Path | Query / response |
| --- | --- | --- |
| GET | `/areas` | Active `ServiceArea[]` |
| GET | `/categories` | Active categories with active subcategories |
| GET | `/shops` | Paginated shop DTOs |
| GET | `/shops/:slug` | Approved/active shop; otherwise 404 |
| GET | `/shops/:shopId/products` | Paginated products, shop ID enforced by path |
| GET | `/products` | Paginated product DTOs |
| GET | `/products/:productId` | Active product at an eligible approved shop |
| GET | `/products/:productId/variants/:variantId` | Active variant of that exact product; unrelated IDs 404 |

Shared query: `q` (max 80), `area` (active area UUID), `category` (slug), `subcategory` (slug; specify category if ambiguous), `cursor`, `limit`. Invalid/inactive explicitly requested references return 400. Without `area`, results span approved shops assigned to at least one active configured area. Area eligibility is explicit membership, not a PIN/locality guess.

Shop-only query: `openOnly=true|false`, `fulfilment=pickup|delivery|seller_delivery|platform_delivery`, `sort=recommended|open|name|fee_asc|fee_desc`. `delivery` matches either delivery method. Recommended/open sort open first then name; `sort=open` also filters to open. Listed fees sort numerically with missing/non-delivery fees last in both directions.

Product-only query: `shop` UUID, `inStockOnly=true|false`, `offersOnly=true|false`, `sort=relevance|name|price_asc|price_desc`. Relevance currently uses deterministic name ordering after matching, not a claimed relevance score. Search matches **all escaped substring tokens**, case-insensitively; fuzzy/typo ranking is not implemented in Phase 1. `offersOnly=true` returns no products because promotions are intentionally outside this write domain; no demo offers are promoted into production.

Filters, availability and sorts run server-side before counting/pagination. Product sort price is the minimum active variant price when variants exist; otherwise base price. Public `stock` is the sum of active variant stock; never add parent stock to it. Closed approved shops and out-of-stock listings can be browsed, with computed status/stock, but this does not authorise a purchase. No purchase API exists in Phase 1.

DTO compatibility:

- Area: `id,name,city,pincodes,active,version`.
- Category: `id,slug,name,blurb,image,version,subcategories[{id,categoryId,slug,name}]`.
- Shop: existing frontend fields (`id,slug,name,tagline,locality,categories,isOpen,hours,fulfilment,since,initials,description,coverImage,deliveryFee,minimumOrderAmount,pickupNote`) plus `categoryIds,subcategoryIds,serviceAreaIds,timezone,openingHours,version`.
- Product: existing fields (`id,shopId,name,unit,description,categorySlug,price,mrp,stock,image,attributes,tags,variants`) plus `categoryId,subcategoryId,version`. Variants: `id,label,price,stock,attributes`.
- Monetary amounts are INR with at most two decimal places on the API; Mongo stores integer paise. Stock is whole nonnegative units; fractional-weight inventory is not implemented. Variant units belong in labels/attributes/pack units.

## Taxonomy / service areas (admin only)

| Method | Path | Body |
| --- | --- | --- |
| GET/POST | `/admin/categories` | Create `{slug,name,blurb?,image?}` |
| PATCH/DELETE | `/admin/categories/:categoryId` | Patch `{version,name?,blurb?,image?,active?}` / delete `{version}` |
| POST | `/admin/categories/:categoryId/subcategories` | `{version,slug,name}` |
| PATCH/DELETE | `/admin/categories/:categoryId/subcategories/:subcategoryId` | `{version,name?,active?}` / `{version}`; version is parent category |
| GET/POST | `/admin/areas` | Create `{name,city,pincodes[]}` |
| PATCH | `/admin/areas/:areaId` | `{version,name?,city?,pincodes?,active?}` |

Slugs/IDs immutable. Subcategories belong to exactly one category, max 100 historical subcategories/category. Removal is soft deactivation. Referenced category/subcategory/area deactivation is rejected even for draft/inactive records, preserving references. Reference writers and deactivation serialize through shared parent document writes inside replica-set transactions. There is no destructive cascade.

## Shops

Review workflow update: approval PATCH accepts optional `reason` (trimmed, 3–1000 characters). **Rejected/suspended decisions now require a reason** (400 validation error when absent); approved/pending remain backward compatible. The server records the latest decision, timestamp and authenticated reviewer ID in the same versioned transaction. Private owner responses expose `review:{status,reason?,reviewedAt}`; admins additionally receive reviewer ID. Review metadata is never in public DTOs and cannot be set by sellers. Profile resubmission returns to pending while retaining the previous review for context. This is the latest review, not a complete audit history.

Private managed-shop responses also include `temporarilyClosed` so owner profile editing preserves closure overrides. Public DTOs expose computed `isOpen` and omit this private operational flag.

| Method | Path | Permission |
| --- | --- | --- |
| GET/POST/PATCH | `/seller/shop` | Seller's own shop; create 201 pending, update returns pending |
| GET | `/admin/shops` | Admin, paginated private shop list; only cursor/limit query |
| PATCH | `/admin/shops/:shopId/approval` | Admin `{version,status:pending|approved|rejected|suspended,active?}` |

Create requires `slug,name,locality,categoryIds[],serviceAreaIds[],fulfilment[],since,initials`. Optional: `tagline,description,subcategoryIds[],hours,timezone,openingHours[],temporarilyClosed,coverImage,deliveryFee,minimumOrderAmount,pickupNote`. PATCH requires version and any editable profile fields (no slug, owner, approval or active override). All profile changes return to pending, requiring review. Minimum order is item subtotal excluding delivery. Fees are catalogue display metadata, not final address quotes.

Structured hours: `openingHours:[{day:0..6,opens:"HH:mm",closes:"HH:mm"}]`, Sunday=0, default timezone Asia/Kolkata. End-exclusive, overnight intervals supported; equal endpoints rejected. No intervals means closed/unknown rather than guessing from `hours` text. `temporarilyClosed` overrides hours. Category/area assignments must be active; subcategories belong to assigned categories. Existing product assignments block removal of their shop category/subcategory memberships.

## Products and variants

Seller prefix: `/seller/products`. Admin prefix: `/admin/shops/:shopId/products`. Both support:

| Method | Suffix | Body / behavior |
| --- | --- | --- |
| GET | empty | Owner/admin paginated array (cursor/limit only), including inactive listings |
| POST | empty | New product; server generates product/variant IDs; 201 |
| GET | `/:productId` | Exact owner's shop product |
| PATCH | `/:productId` | Editable product fields plus version |
| DELETE | `/:productId` | `{version}` soft deactivation, 204 |
| PATCH | `/:productId/inventory` | `{version,stock}`; base product only, variant products reject |
| POST | `/:productId/variants` | `{version,label,price,stock,attributes?}`, 201 with parent version |
| GET | `/:productId/variants/:variantId` | Variant plus parent version |
| PATCH | `/:productId/variants/:variantId` | `{version,label?,price?,stock?,attributes?}` |
| DELETE | `/:productId/variants/:variantId` | `{version}`, soft deactivation, 204 |

Product create: `{name,unit,categoryId,price,stock,description?,subcategoryId?,mrp?,image?,attributes?,tags?,active?,variants?}`. Each variant `{label,price,stock,attributes?}`. Prices positive, stocks integer/nonnegative; unknown fields, client IDs, shopId, ownership and role overrides rejected. MRP cannot be below base price. Category/subcategory must be assigned to the shop. Max 100 historical variants/product; active labels must be distinct. Last active variant cannot be removed (deactivate product instead). Existing IDs are never re-parented/recycled.

PATCH omits absent fields; it does not apply create defaults or implicitly reactivate products. `mrp,image,subcategoryId` accept `null` to clear. Variant changes use their dedicated endpoints, preventing wholesale identity replacement. Managed product responses use base `stock` (variant stocks explicit), public product responses use aggregate available variant stock. `attributes:[{label,value}]` are bounded display fields; category-specific attribute schema authoring is a future extension.

Image input accepts a durable key or HTTPS URL; `data:`, `blob:`, traversal/control characters are rejected. No upload transport/signing or image service credentials are added. Backend never fetches submitted image URLs.

## Remaining frontend integration

The unchanged frontend currently ignores pagination headers, uses OTP-only sign-in, session-only seller/delivery/admin state, and mock synchronous product/shop/cart lookups. UUID IDs differ from demo IDs; demo carts/sessions must not be treated as production data. Preserve the frontend's demo mode until a separate integration phase replaces those dependencies. Expiring auth state, quote revalidation, password enrollment/recovery and upload UI need explicit integration work. Setting VITE_API_URL alone is not a finished launch.
# Saved address prerequisite

Authenticated `GET/POST /addresses` and versioned `PATCH/DELETE /addresses/:id` are implemented. See [ADDRESSES.md](ADDRESSES.md) for the strict payload and privacy/concurrency contract. No checkout/order/payment processing is enabled by these endpoints.

# Address-based fulfilment review

Authenticated `POST /cart/fulfilment` checks an owned address and requested shop IDs. See [FULFILMENT_REVIEW.md](FULFILMENT_REVIEW.md). This does not implement checkout, orders or reservations.

# Combined checkout review

Authenticated `POST /checkout/review` combines existing read-only cart/address/method checks. See [CHECKOUT_REVIEW.md](CHECKOUT_REVIEW.md) for payload, blockers and concurrency limits. No order or payment API is enabled.

# Internal inventory foundation

Transactional, idempotent stock holds and explicit release/expiry primitives are implemented internally; see [INVENTORY_RESERVATIONS.md](INVENTORY_RESERVATIONS.md). There is deliberately no public reservation/order endpoint or scheduled expiry worker yet. Existing review responses remain `reserved:false` and `checkoutAvailable:false`. Product mutations return 409 `INVENTORY_HELD` while an internal held record references that listing, even when its deadline has passed but stock has not yet been restored.

# Inventory operations

Admin-only `GET /admin/inventory` returns held/overdue/retrying counts and oldest-overdue age, with `Cache-Control: private, no-store`. `workerConfigured` means configured, not running. The opt-in separate expiry worker adds backoff for failed holds and safe batch progress; it is not started by the HTTP server. See [INVENTORY_OPERATIONS.md](INVENTORY_OPERATIONS.md). Public reservation/order submission remains disabled.

# COD order extension — current contract

The user confirmed COD first, tax-inclusive product pricing, configured seller delivery fees, zero pickup delivery fee and no added platform fee/discount. Buyer-only `POST /orders` is implemented behind `ORDERS_COD_ENABLED=false` by default. It requires `Idempotency-Key` and `{areaId,addressId,addressVersion,paymentMethod:"cod",expectedTotal,items:[{productId,variantId?,qty}],fulfilments:[{shopId,method}]}`. See [COD_ORDERS.md](COD_ORDERS.md) for atomic stock/order rules and activation dependencies. Online payment methods are rejected; no gateway result is simulated.

`GET /orders?limit&cursor` and `GET /orders/:id` require a buyer session and only return that buyer's orders. Lists are newest-first with signed buyer-scoped cursor headers; `X-Has-More`/`X-Next-Cursor` are exposed by CORS. Private DTOs contain immutable address/shop/product snapshots, `paymentStatus:"unpaid"` and shop-wise placed suborders, never buyer IDs, request fingerprints or reservation IDs. A fresh create returns 201; an identical retry returns 200 with the same order. Changed payload under the same key returns 409 `IDEMPOTENCY_CONFLICT`. Foreign/absent address/order IDs return 404. Stale addresses, totals, stock, minimums or serviceability fail before commit and retain stock. Missing keys/extra client price, role or status fields return 400. Rate limit is 20 create attempts per authenticated buyer per 15 minutes per API process; shared multi-instance abuse control remains a launch dependency.

With COD enabled, `/checkout/review` may return `checkoutAvailable:true`, numeric `deliveryTotal`/`grandTotal`, `paymentMethods:["cod"]`, and `pricingPolicy:"tax_inclusive_listed_delivery_no_extras_v1"` when all checks pass. It remains read-only (`reserved:false`) and is revalidated transactionally by order creation. With COD disabled it remains unavailable with null payable totals. Public cart review is unchanged. Frontend confirmation/retry recovery and owned order display are now integrated; seller processing and real-browser journey verification remain before customer-facing activation. See frontend `docs/LIVE_COD.md`.

# Seller order processing — current extension

Seller-only `GET /seller/orders?limit&cursor&status` and `PATCH /seller/orders/:orderId/suborders/:suborderId {version,status,reason?}` are implemented. See [SELLER_ORDERS.md](SELLER_ORDERS.md). Owned flat suborder responses exclude other-shop/buyer/internal data; delivery address is available only for seller-delivery. Statuses advance placed→accepted→preparing→ready. Rejection/pre-preparation cancellation requires a reason and restores only that suborder's committed units once. Version conflicts/illegal transitions return 409; unrelated shop/suborder IDs return 404. Preparing/ready cancellation and delivery/collection are not enabled.

Buyer order DTOs now add current `amountDue` and `cancelledAmount`; original `total` stays immutable. Suborders add status version/time/cancellation reason and their current amount due. COD stays unpaid. Frontend seller and buyer displays are connected; live activation remains off pending handoff, collection policy and browser journey checks.

# Seller delivery dispatch tracking

The seller suborder PATCH endpoint now also allows `ready → out_for_delivery` exclusively for `seller_delivery`. Pickup, direct delivered status and client payment-status overrides are rejected. Ownership, expected version and active approval remain enforced; immediate identical retries do not duplicate the transition. COD stays unpaid and stock is unchanged. See [HANDOFF_COD.md](HANDOFF_COD.md): receipt/completion and cash collection remain pending the user's proposed policy selection and are not implemented or activated.

# Buyer receipt and cash handoff — implemented

User-approved flow: buyer receives goods/pays cash, then requests a one-time account code; seller verifies it and explicitly records cash received. Buyer-only `POST /orders/:orderId/suborders/:subId/receipt-code {version,confirmReceived:true,confirmCashPaid:true}` and seller-only `POST /seller/orders/:orderId/suborders/:subId/complete-cash {version,code,confirmCashReceived:true,amountReceived}` are implemented. See [HANDOFF_COD.md](HANDOFF_COD.md) for secret handling, throttles, cooldown, expiry/lockout, replay and audit semantics. No SMS or gateway verification is claimed. Plain status PATCH still cannot mark delivered/paid.

Order DTOs now support `unpaid`, `partially_cash_recorded`, `cash_recorded`, `cashRecordedAmount`, remaining `amountDue`, and per-suborder public cash report amount/timestamps. Original totals and cancelled amounts stay separate. Secret/proof/audit-actor fields never enter read DTOs. Seller cash state is scoped to their shop. Cash is a dual-party report, not bank/provider settlement. Live activation remains unchanged/off pending browser/operational checks.

