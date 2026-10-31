# Seller photo upload recovery

Follow-up actual browser check passed using the real configured R2 adapter and isolated local database: PNG preview/upload, public WebP display, saved image after reload, replacement/version advance and 390px mobile width. Chromium recorded no runtime errors. Two generated R2 objects were deleted afterwards; no real listing/Atlas change. Evidence: `browser-qa/photo-report.json` and `browser-qa/seller-r2-photo-upload.png`. This supersedes the earlier browser-verification limitation below; actual network-loss recovery remains component-tested rather than injected in this browser run.

The connected seller photo form now shows the currently saved photo separately from the selected local preview. Successful upload still saves immediately against the product's server version and shows success feedback. Existing type/size validation, draft guard and unsaved listing/variant protection remain unchanged.

Network/unknown/server errors and version conflicts block another upload and file replacement until the seller explicitly refreshes saved photo/listing state. Refresh re-fetches seller list/detail queries before discarding the local selection; a failed refresh keeps the selection and reports the failure. No automatic upload retry occurs. Definitive validation failures retain the existing correction/retry behaviour. This applies to both R2 and Cloudflare Images without API changes.

R2 credentials/upload/public delivery were separately verified with one temporary generated image, then that object was deleted. This UI follow-up uses mocked service responses in component tests; no real seller listing or database record was edited. Actual seller browser upload remains a separate check.

Changed files: `src/components/portal/ProductPhotoUpload.tsx`, `src/test/product-photo-upload.test.tsx`, this document. No backend code, branding, routes, credentials or live flags changed.

Verification: `npx tsc --noEmit`, `npm run lint` (zero errors, 22 existing Fast Refresh warnings), `npm test` (133 tests/29 files) and `npm run build` passed. Added lost-response recovery assertions and tightened version-conflict tests to require explicit server refresh before another upload. No browser E2E or real seller product write was performed in this follow-up.
