# Backend container deployment package

This package is prepared for staging review; no deployment or live activation was performed. Existing React/TanStack frontend is unchanged and deployed separately. Docker is not installed/available in the current Windows shell, so image build/start/native Sharp behavior has not been verified here.

## Build and staging run

With Docker Engine/Desktop installed and running, from `D:\justpackit\just-back`:

```powershell
docker build --pull -t justpackit-backend:staging .
docker run --rm --init --name jpi-api --env-file .env.staging -e NODE_ENV=production -e HOST=0.0.0.0 -p 127.0.0.1:4000:4000 justpackit-backend:staging
```

`.env.staging` is a separate private runtime file; do not overwrite working development `.env` or commit it. Explicitly configure a staging MongoDB replica-set database, HTTPS frontend CORS origin, R2 custom image delivery domain and test payment credentials. Keep Razorpay live activation false. Test-mode orders still reserve inventory in the selected database, so never point staging fixtures at production customer/shop data. Production-mode validation disallows localhost CORS and r2.dev image delivery. Existing declared indexes must already be created through the separately reviewed deployment/index process; this container never creates/synchronizes them automatically in production.

The image uses Node 24 Debian slim, builds TypeScript in a separate stage, installs runtime-only dependencies, runs as the non-root node user and copies no `.env`, tests, docs, scripts, local dependencies or browser/database caches. `.dockerignore` allowlists build input. No secret is accepted as build ARG/ENV. Supply secrets at runtime through the deployment provider's secret manager or private env-file. Tag/digest pinning and registry/image vulnerability checks are part of the actual release review; the base tag alone is not immutable provenance.

`/health` is process liveness; `/health/ready` additionally requires an active Mongoose connection. The container probe fetches readiness locally with a timeout, without credentials/output. This is not a deep provider/index/backup check. Existing API startup verifies critical indexes. Missing configuration/database/indexes fail startup. Put the API behind a public HTTPS ingress; never use local port 4000 as the Razorpay webhook URL.

## Separate workers

Run workers as separately supervised processes from the same image only after opt-in flags and indexes are configured. Override/remove the API health probe because workers do not serve HTTP:

```powershell
docker run --rm --init --no-healthcheck --env-file .env.staging justpackit-backend:staging node dist/payments/recovery-worker.js
docker run --rm --init --no-healthcheck --env-file .env.staging justpackit-backend:staging node dist/inventory/worker.js
```

The API server does not launch either worker. Use deployment restart policies and monitoring intentionally; no restart policy/service was installed here. Allow graceful SIGTERM termination (API at least 10 seconds, recovery worker at least 60 seconds). Verify restart/recovery in staging rather than assuming container liveness proves worker progress.

Current API trusts no forwarded proxy headers. Deploy a single API instance initially: behind a proxy, IP-based throttles can share the ingress address. Do not blindly set `trust proxy=true`; choose and test explicit trusted proxy ranges/topology before scaling/public launch. Authentication/financial commands also have account-based controls. Public webhook ingress needs signature verification, body preservation and separate ingress abuse monitoring. TLS termination, CORS, platform rate limiting and forwarded headers must be tested on the selected host.

## Required release checks

Run image build, inspect that no secrets/devDependencies are present, start with staging secrets, verify healthy readiness, seller R2 upload and image URL, real test checkout/capture/refund/public webhook, graceful restart and recovery workers. Also verify database backups/restore, declared indexes, log collection, real-shop approval and service-area rules. No automatic live payment/refund activation follows from a healthy container. Unpaid-order closure, settlement and dispute operations remain launch dependencies.

Reference: https://docs.docker.com/guides/nodejs/containerize/ . Docker verification remains pending on a host with Docker available.

## Actual checks for this change

Backend `npm run typecheck`, `npm run lint` and `npm run build` passed. The compiled healthcheck was executed against a temporary local HTTP server: readiness HTTP 200 returned process exit 0; HTTP 503 returned exit 1. No database/provider was contacted by that probe check. Existing full application test suites were not rerun for this packaging-only change. `docker --version` failed because Docker is unavailable, so `docker build`, container startup, runtime dependency/native binary checks and image scanning remain unverified. Changed files: `Dockerfile`, `.dockerignore`, `src/config/healthcheck.ts`, this document. No real environment, frontend, production deployment or infrastructure change.
