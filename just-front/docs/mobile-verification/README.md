# Mobile location, checkout and keyboard audit — 2026-10-31

Scope: existing frontend retained. Owner selected Android + Chrome, then requested browser checks only for now. No physical-device result is claimed.

## Fixes

- Area popover now fits viewport width and available height and scrolls internally, including320px screens and long lists.
- Sheet close control now44x44px with visible keyboard focus styling. Address sheet title reserves its space; bottom safe-area padding retained.
- GPS address sheet explicitly restores focus to its address trigger on close/Escape. Written confirmation resets after address or pin edits. Immediate save guard prevents repeat submissions; failed saves retain the draft.
- Address-sheet controls use16px on narrow screens, decimal coordinate keyboard hint and scroll margin. Short sheet remains scrollable. This is not proof of actual virtual-keyboard behaviour.
- Optional map bundle/render failure has a local error boundary: address/pin remain editable. Tile failure retains coordinate/GPS alternative.
- GPS requests use an uncached fix; invalid coordinate ranges/nonfinite values/negative accuracy are rejected. Timeout copy offers manual fallback. No GPS coordinates persisted by browsing.

## Verified browser results

15 isolated Chromium checks passed (`browser-report.json`). Viewports320x568,390x844,390x360 and640x360; touch/mobile emulation. GPS coordinates and permission denials/timeouts are simulated, not a real Android permission prompt.

1. Denied GPS gives manual fallback.
2.320px area popover fits and manual area can be selected by keyboard after denial.
3. GPS timeout gives manual fallback.
4.320px area picker remains usable after timeout.
5. Simulated precise GPS finds configured eligible area and opens address prompt.
6. Address sheet traps focus across18 Tab presses; close target44px.
7. Escape restores address-trigger focus.
8. Text edit clears prior written confirmation.
9.390x360 short viewport keeps sheet scrollable, no horizontal page overflow.
10. Blocked map tiles leave address/pin editable.
11. Keyboard confirms pin/address and saves against real isolated API.
12.640x360 landscape has no horizontal overflow.
13.360px mixed-shop pickup and seller-delivery radios work via Space.
14. Enter submits one isolated COD order: two shop suborders, server total₹95, no real purchase/fulfilment.
15. No browser page errors.

Screenshots: `address-sheet.png`, `gps-denied.png`, `gps-timeout.png`, `mixed-checkout.png`, `mobile-order.png`. Mixed checkout screenshot visually inspected. QA fixture image placeholders reflect missing fixture images and blocked external requests; no live shop data used. Full-page sticky-header placement in screenshots is a browser capture artefact, not a measured device result.

Automated frontend:57 test files /245 tests passed. Focused GPS/pin/confirmation/map tests:12 passed, covering stale confirmation, focus restore, pending duplicate save, failed-save draft preservation, invalid GPS coordinates and optional-map crash containment. Full-suite pre-existing React act warnings remain. Final TypeScript check, lint and production build passed; lint has0errors and23existing warnings. After TypeScript-only modifier/test-selector corrections, the affected4tests were rerun and passed. Backend code and API schema unchanged; no backend test rerun was necessary for these frontend-only changes. No production database, credentials, Razorpay or hosting changes.

## Explicitly unverified

Actual Android Chrome OS permission UI, precise/approximate GPS, GPS disabled/system timeout, Gboard focus/resize/Next/Done, touch pin dragging, TalkBack announcements, hardware Back navigation, low-end Android, real mobile network and actual payment-method keyboard. iOS Safari/VoiceOver also not tested. Browser viewport shrinking does not reproduce a real keyboard. This task is not a full WCAG conformance audit or launch clearance.

Actual Android check deferred at owner request. No hosting required when resumed: use Chrome USB remote debugging and port forwarding, described in [official Chrome documentation](https://developer.chrome.com/docs/devtools/remote-debugging/local-server). For the isolated QA setup forward phone8083→PC localhost:8083 and phone4001→PC localhost:4001; open phone `http://localhost:8083/__qa/bootstrap/buyer`. Use only temporary QA session/data. Do not enter real credentials into bootstrap fixtures. Real physical GPS may correctly show no shops because fixture locations are invented; use denial/empty-area fallback or a deliberately configured test location, never represent fixture shops as live.

## Reproduction and changed files

Backend QA: PowerShell `$env:ALLOW_ISOLATED_BROWSER_QA='true'; $env:QA_CHECKOUT_REGRESSION='true'; npx tsx scripts/browser-qa.ts` in just-back (payments not enabled). Frontend QA: `$env:VITE_API_URL='http://localhost:4001'; npx vite --config vite.qa.config.ts --host 127.0.0.1 --port 8083 --strictPort`. Browser `node scripts/mobile-accessibility-qa.mjs` uses installed isolated Chromium; fresh temporary DB expected. QA processes stopped after checks.

Changed: `src/components/store/StoreHeader.tsx`, `GpsAddressConfirmation.tsx`, `DeliveryPinEditor.tsx`, new `DeliveryMapBoundary.tsx`; `src/components/ui/sheet.tsx`; `src/services/location.ts`; `src/styles.css`; `src/test/gps-location.test.ts`, new `gps-address-confirmation.test.tsx`, `delivery-map-boundary.test.tsx`; `scripts/mobile-accessibility-qa.mjs`; this evidence directory. Routing, visual identity and server-side serviceability enforcement preserved.
