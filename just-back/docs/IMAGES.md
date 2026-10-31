# Product photo uploads

Selected service: Cloudflare Images (not R2 or Image Resizing). Use backend-proxied uploads so content can be decoded, bounded and re-encoded before it reaches storage. No Cloudflare infrastructure/accounts are provisioned automatically.

## Contract / decisions

- `GET /seller/image-upload`: authenticated seller capability `{enabled,maxBytes,types[]}`; no secrets. Disabled unless all Cloudflare settings exist.
- `POST /seller/products/:productId/image`: authenticated owner, raw JPEG/PNG/WebP body (at most 5 MiB), matching Content-Type, and `X-Product-Version` containing the last-read version. Save a listing first. No filename or client storage URL is accepted here.
- Check owner/version before processing or contacting Cloudflare. Decode actual bytes with sharp, reject animation and mismatched type, cap input at 25 million pixels, auto-orient, strip metadata and resize inside 1600x1600; encode WebP. Bound concurrent upload processing and throttle per seller.
- Upload through Cloudflare's multipart Images v1 API with a server-generated ID and owner/product metadata. API token never reaches browser. Delivery URL is constructed from server configuration, not client/provider URLs. Use a configured existing public delivery variant (default `public`). No changes to the frontend's existing imageUrl abstraction are required for full HTTPS URLs.
- Commit product.image with its expected version after upload. A racing product edit returns 409; cleanup only the newly uploaded, unattached asset. Never automatically delete previous images, which may still be referenced elsewhere. Cleanup failures/uncertain network outcomes require operator reconciliation before a large launch; full orphan cleanup/retention is not implemented here.
- Missing credentials return 503; provider failures return safe errors without secret response bodies. No fake upload success. Do not infer real Cloudflare verification from mocked tests.

## Backend environment

Set only in `just-back/.env`:

```
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_IMAGES_API_TOKEN=your-account-scoped-images-write-token
CLOUDFLARE_IMAGES_ACCOUNT_HASH=your-public-image-delivery-hash
CLOUDFLARE_IMAGES_VARIANT=public
```

Use an Images-write token scoped to the chosen account. Enable Cloudflare Images and ensure the delivery variant exists. Keep placeholders commented/unset until ready. Partial credential configuration fails validation. Never put tokens in VITE variables or chat. Public URL/hash are not credentials, but the backend constructs delivery URLs consistently.

## Sources

- https://developers.cloudflare.com/api/resources/images/subresources/v1/methods/create/
- https://developers.cloudflare.com/images/optimization/hosted-images/serve-uploaded-images/
- https://sharp.pixelplumbing.com/api-constructor/
- https://sharp.pixelplumbing.com/api-output/
