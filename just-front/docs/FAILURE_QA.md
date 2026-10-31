# Frontend failure recovery — 2026-10-30

Headless Chromium against isolated frontend8083/backend4001 with temporary MongoDB only. No production database, external message or payment action. Mobile viewport390×844.

Five checks passed:

1. Valid-format missing product UUID renders not-found instead of a product or generic crash.
2. Unknown shop slug renders not-found.
3. Unknown category renders not-found.
4. Browser API traffic aborted with connection-refused during client navigation renders the error boundary and recovery actions.
5. Restoring API access and clicking Try again recovers the home page without full-page reload.

Not-found document widths fit mobile. This verifies controlled connection failure and recovery, not Atlas availability or resilience to every provider/server failure. Expected route errors are intentionally generated; no claim that this run has no error logs. No product code changes were required.

Evidence: `docs/failure-qa/report.json`, `network-error-mobile.png`. Repeat after starting isolated services per BROWSER_QA.md: `node scripts/failure-qa.mjs`. Script formatting and lint passed. Temporary QA services stopped after verification. Previous full frontend suite/build is unchanged by this scripts/documentation-only follow-up.
