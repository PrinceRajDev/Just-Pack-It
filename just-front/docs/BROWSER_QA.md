# Isolated browser verification — 2026-10-30

Admin payment-operations follow-up: the latest report additionally verifies `/admin/finance`, payment-state/mode controls, honest empty state and mobile width with Razorpay disabled, alongside existing COD flows. Populated mapping/reconciliation interactions were tested at component/API boundaries using explicit provider doubles, not a real gateway browser session. Latest suites: frontend 126 tests/27 files; backend 97 tests/four files. Both typechecks, lint and builds passed; 22 existing frontend Fast Refresh warnings remain. See backend `docs/PAYMENT_OPERATIONS.md`.

Latest Razorpay extension regression: the complete existing COD Chromium journey still passes with Razorpay disabled. Online provider behavior is covered separately by isolated HTTP test doubles and UI unit tests, not by this Chromium run. Actual Razorpay Standard Checkout and public webhook delivery await test credentials/setup. Latest automated suites: frontend 122 tests/26 files; backend 95 tests/four files.

Fresh headless Chromium 156.0.8078.4 verified the actual frontend and Express API against a temporary MongoDB replica set. No Atlas database, real customers, real orders or actual cash collection were involved. Live COD flags remain unchanged.

Verified: area/category discovery, two independent shops, mobile variant price/stock selection, multi-shop checkout, lost-response recovery with the same key/payload, reload without duplication, seller processing, pickup and seller delivery completion, buyer receipt codes, exact cash amounts, inventory decremented once, and admin taxonomy smoke check. Two create requests resulted in one order. Simulated cash recorded totalled ₹135. No browser runtime errors or mobile horizontal overflow were detected.

Evidence: [sanitized report](browser-qa/report.json). Screenshots in that directory cover mobile product selection, checkout and completed orders. Receipt secrets are excluded from the report.

## Repeat locally

Run `npm ci` in both repositories. In PowerShell from `just-front`, install the test browser:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH='D:\justpackit\.qa-browsers'
npx playwright-core install chromium --only-shell
```

Start the isolated backend from `just-back`:

```powershell
$env:ALLOW_ISOLATED_BROWSER_QA='true'
npx tsx scripts/browser-qa.ts
```

Start the isolated frontend from `just-front` in another terminal:

```powershell
$env:VITE_API_URL='http://localhost:4001'
npx vite --config vite.qa.config.ts --host 127.0.0.1 --port 8083 --strictPort
```

Then run `node scripts/browser-qa.mjs` from `just-front`. Restart the isolated backend before another complete run; the runner requires an empty temporary order collection. Stop both QA processes afterwards.

The helper does not load `.env`; it creates a temporary database and secrets. Test-only bootstraps issue genuine local sessions on the isolated frontend origin. Never mount these helper routes in the normal server. The runner uses a fresh profile and blocks external requests outside localhost ports 4001/8083. Remote assets/fonts are outside this verification.

Notification coverage added: one seller new-order alert after the buyer's lost-response retry; a mobile buyer inbox with one order-created alert and both shop handoffs; explicit mark-as-read persistence after reload; mobile admin access to both shop-submission alerts. The runner captures `mobile-notifications.png` and includes these checks in `report.json` only after they pass. Startup failures now print their stage even if buyer bootstrapping fails. Backend QA explicitly initializes notification collections and indexes before fixture transactions. These checks use only temporary users, shops and orders; they do not verify push, SMS, payment-provider delivery or production data.

Verified 2026-10-30: the extended runner completed all 12 checkpoints in headless Chromium 156.0.8078.4 with zero browser runtime errors. Read receipts survived reload, duplicate create recovery produced a single seller alert, both buyer handoffs appeared, and mobile admin alerts remained accessible. Backend TypeScript and QA-script lint passed; frontend QA-script lint passed. Only QA scripts, fixtures, report/screenshots and this documentation changed in this follow-up; application behaviour was unchanged. Both temporary QA servers were stopped after verification.

## Fixes and remaining work

Fixed stale connected-mode copy that said ordering was unavailable. Harness selectors now scope duplicate area controls and wait for hydration. These initial harness failures were not application defects.

This does not verify the user's desktop Chrome profile, other browser engines, production fulfilment, uploads, SMS, payment providers, cash reconciliation or disputes. Live activation remains a separate operational step.

Follow-up security maintenance: Vite was updated from 8.1.5 to 8.3.5 and Zod from 3.25.76 to 4.6.7, resolving both previously recorded high-severity findings. A fresh `npm audit --json` reported zero known vulnerabilities across all severities. This is a dependency-advisory result, not a claim that the application has no security risks.

The [official Zod migration guide](https://zod.dev/v4/changelog) was reviewed, including coercion input typing, defaults and stricter UUID validation. Existing application schemas typechecked without source changes; all 115 frontend tests and the production build passed with the updated packages. Full ESLint passed with zero errors and 22 existing Fast Refresh warnings. Vite also emits advisory notices about native config loading and the existing tsconfig-paths plugin; those are not build failures.

The complete isolated Chromium journey was rerun successfully after these updates; `browser-qa/report.json` and screenshots now reflect that rerun. The temporary QA API/frontend were then stopped. Backend application code and live configuration were unchanged in this follow-up.

Subsequent admin monitoring addition: the latest report also verifies the live read-only admin order screen, recorded/outstanding filters and mobile width with a completed two-shop order. Screenshot: `browser-qa/admin-cash-records.png`. Latest suites: frontend 117 tests/25 files, backend 92 tests/four files; both typechecks/builds/lint passed, retaining 22 frontend Fast Refresh warnings. Admin API details are documented in `API_CONTRACT.md` and backend `docs/ADMIN_ORDERS.md`.

Backend typecheck, lint and build passed; 91 tests passed. Frontend TypeScript and build passed; 115 tests passed. Final ESLint error-only check passed after formatting fixes; the full lint run also identified 22 existing Fast Refresh warnings.

Changed files: backend `scripts/browser-qa.ts`; frontend `vite.qa.config.ts`, `scripts/browser-qa.mjs`, package manifest/lock, `src/components/store/StoreLayout.tsx`, and formatting in `src/test/cod-recovery.test.ts`. Workspace `.gitignore` excludes browser binaries.
