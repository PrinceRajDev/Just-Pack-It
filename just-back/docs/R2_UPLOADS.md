# Cloudflare R2 product photos

## Actual seller-browser verification — 2026-10-30

Passed in fresh headless Chromium 156.0.8078.4 at 390px mobile width against the actual frontend/API with isolated MongoDB fixtures and configured real R2 storage: choose PNG, local preview, upload/save, displayed public WebP, reload persistence, replacement with a fresh key and advancing product version. Both public image responses were 200 with WebP MIME and expected dimensions. No page runtime errors or horizontal overflow. Both generated test objects were deleted explicitly; cleanup reported removed 2, remaining 0. No Atlas or real shop/product/order was modified.

Evidence: frontend `docs/browser-qa/photo-report.json` and `seller-r2-photo-upload.png`. Reproduce by starting backend `scripts/browser-qa.ts` with both `ALLOW_ISOLATED_BROWSER_QA=true` and `ALLOW_LIVE_R2_QA=true`, starting the existing QA frontend config, then running frontend `node scripts/photo-browser-qa.mjs`. The optional R2 path parses `.env` but copies only the storage allowlist; original database/session/payment settings are never used. Only explicit live-R2 opt-in permits storage writes. The helper tracks new upload URLs and cleans those keys at completion/shutdown. Do not run these test helper routes in the normal server. Temporary QA servers were stopped after the check.

Earlier below, statements that actual upload/browser delivery were unverified describe the prior adapter-only checkpoint and are superseded by this verification. Production custom-domain delivery and non-Chromium browsers are not covered.

Design: reuse the existing seller-owned versioned upload endpoint and image decoding pipeline. R2 is an optional backend storage adapter; existing Cloudflare Images configuration remains compatible. Backend uploads normalized WebP objects with unique immutable keys. No browser S3 credentials, arbitrary bucket/key input, presigned writes or frontend architecture changes. Existing optimistic concurrency and unattached-attempt cleanup protections remain in place. Old referenced images are never deleted automatically.

Select R2 explicitly with `IMAGE_STORAGE_PROVIDER=r2`. Require account ID, Access Key ID, Secret Access Key, bucket and public delivery base URL together. R2 API token value is not needed by the S3 SDK. Public delivery base is separate from the private S3 endpoint. A product-only bucket may be publicly served; do not mix private customer files into it. Production uses a custom delivery domain; Cloudflare's r2.dev endpoint is development-only. No bucket, domain, token or production infrastructure is created/modified by this integration.

## Backend .env mapping

```env
IMAGE_STORAGE_PROVIDER=r2
CLOUDFLARE_ACCOUNT_ID=<Cloudflare dashboard Account ID, not Access Key ID>
CLOUDFLARE_R2_ACCESS_KEY_ID=<Access Key ID>
CLOUDFLARE_R2_SECRET_ACCESS_KEY=<Secret Access Key>
CLOUDFLARE_R2_BUCKET=<existing product-photo bucket name>
CLOUDFLARE_R2_PUBLIC_BASE_URL=https://<bucket public delivery host>
```

Your displayed **Token value is not needed** for this S3 adapter. `CLOUDFLARE_IMAGES_API_TOKEN`, `CLOUDFLARE_IMAGES_ACCOUNT_HASH` and `CLOUDFLARE_IMAGES_VARIANT` are unused in R2 mode; comment the Images token/hash rather than entering R2 credentials there. Do not put any S3 credential in frontend `.env`. Restart the backend after configuration. Nothing in the actual `.env` was overwritten by this implementation.

In R2 dashboard, create/select a dedicated product-images bucket and use a bucket-scoped Object Read & Write credential. For development enable/copy its Public Development URL (`https://pub-....r2.dev`); production requires an attached custom domain such as `https://images.your-domain.com`. Set the public base without an object key or query string. Do not use the S3 API URL as the delivery base. Existing absolute HTTPS product URLs pass through the frontend image helper, so `VITE_IMAGE_BASE_URL` does not need changing. Browser uploads continue to the backend API; bucket browser-write CORS is not required by this proxy flow.

Objects are normalized to WebP at max 1600px, metadata stripped, decoded pixel limit 25MP, input cap 5 MiB and immutable one-year cache header. Keys are server-generated `products/<random-128-bit-hex>.webp`, with no customer identifiers or original filenames. Replacements use fresh keys. Only a newly attempted unattached object may be cleaned up after failure/version conflict; old referenced objects remain. Cleanup failures log a sanitized object key for operator reconciliation; no bulk deletion or bucket mutation occurs. Retained old images/orphans require a later reference-aware cleanup process.

The existing endpoints remain `GET /seller/image-upload` and `POST /seller/products/:productId/image` with raw JPEG/PNG/WebP bytes and `X-Product-Version`. Capability returns only enabled/types/limits. Owner/version checks precede storage; product version updates and approval rules remain unchanged. Partial/malformed R2 config fails startup with field names, not secrets. Existing Cloudflare Images users keep their default adapter.

Official references: https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/ and https://developers.cloudflare.com/r2/buckets/public-buckets/ . Current adapter targets the default global R2 S3 endpoint; jurisdiction-specific buckets need a separately validated endpoint option before use.

## Verification

Backend full isolated suite: 108 tests/five files passed. Typecheck, lint and build passed. R2 tests use SDK method doubles, never real Cloudflare credentials/buckets. They verify complete config, invalid S3 delivery URLs, production r2.dev rejection, unique WebP keys/caching, upload failure cleanup, owner-only route checks, decoded byte conversion, successful product attachment and safe cleanup when a concurrent product edit wins. Existing Images adapter regressions also passed. Dependency install audited zero known vulnerabilities; added official `@aws-sdk/client-s3` plus lockfile entries.

No live R2 upload, public URL delivery or browser upload was verified; these require actual bucket/access/public-domain configuration. No frontend application code changed, so frontend checks were not rerun for this backend-only adapter. Changed files: backend `src/config/env.ts`, `src/images/service.ts`, new `src/images/r2.ts`, `.env.example`, package manifest/lock, new `test/r2.test.ts`, `test/phase1.test.ts`, this document and frontend `docs/API_CONTRACT.md`.
