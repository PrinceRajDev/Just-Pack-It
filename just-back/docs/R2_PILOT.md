# Explicit R2 public development URL allowance

For the initial pilot without an owned custom domain, keep `NODE_ENV=production`, `IMAGE_STORAGE_PROVIDER=r2`, all existing R2 credentials/bucket settings and the actual HTTPS public `https://pub-….r2.dev` base URL. Set `R2_ALLOW_DEV_PUBLIC_URL=true` explicitly in Render and redeploy the latest commit.

The default is false. This flag only relaxes the production r2.dev hostname restriction; it does not change uploads, authorization, bucket credentials, HTTPS URL rules, existing object URLs, CORS or database validation. No uploads or infrastructure changes are performed by enabling configuration validation. Do not use the S3 API endpoint, Vercel URL or placeholder value as the delivery base.

Cloudflare's public development endpoint is rate-limited and intended for testing/development. This allowance is a pilot compromise, not a guarantee of image availability or market-launch readiness. The readiness report marks it unverified. Verify an authenticated seller upload and its public image response after deployment. Once a custom domain is available, configure that URL and set this flag back to false; existing saved URLs may need a separately reviewed migration.

Render also needs `HOST=0.0.0.0` and the exact frontend HTTPS `CORS_ORIGINS`. Leave Render's supplied PORT intact. Never copy private keys into the frontend or repository.
