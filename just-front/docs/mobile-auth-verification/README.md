# Mobile login and signup polish — 2026-10-31

Existing branding, TanStack routing, buyer/seller signup, shop photo selection and authentication services preserved. Backend and credentials unchanged.

## Fixed

The shared login input CSS also imposed44px height on radio/checkbox controls. Combined with outer and card padding, this squeezed role cards and seller fields on narrow screens. Auth-only overrides restore18px native radio/checkbox controls inside large clickable labels, prevent fieldset min-content overflow, and keep the form card within viewport.

Mobile shell/card spacing tightened while preserving paper/green identity and typography. Fields/selects/textarea use16px; phone uses type tel with autocomplete. Long buttons/recovery actions wrap, password toggle retains44px target, seller checkbox labels have44px touch rows, and bottom safe-area padding is retained. Login now has a main landmark. Validation keeps first-invalid-field focus; server sign-in error summary receives focus and credentials are retained. Recovery/mode switching is disabled during pending sign-in.

## Verified

13 isolated Chromium mobile checks passed (`browser-report.json`):320px and390px login, password show/hide, invalid phone focus, buyer signup role choices, seller shop/category/area/photo/submit layout, landscape640x360 submit reachability and short-height recovery editing. No page errors, no actual registration, password recovery email or payment sent. Radio/checkbox sizes and16px field fonts measured. Login320px and seller-signup320px screenshots visually inspected.

Frontend TypeScript, lint and production build passed; lint0errors,23existing warnings. Full frontend regression:57 files /247 tests passed, including the two new error-focus and pending-action tests. Some pre-existing React act warnings remain.

Actual Android OS keyboard, TalkBack, camera/gallery picker and device autofill not tested. Browser viewport emulation does not prove physical-device behaviour. Real device testing remains deferred per earlier user preference. No production data, infrastructure or backend changes; temporary QA servers stopped.

## Changed files

- `src/styles/auth.css`
- `src/routes/login.tsx`
- `src/components/auth/LiveAuthForm.tsx`
- `src/components/auth/SellerSignupFields.tsx`
- `src/test/signup-onboarding.test.tsx`
- `scripts/mobile-auth-qa.mjs`
- this evidence directory (screenshots and browser report)

QA reproduction uses existing `just-back/scripts/browser-qa.ts` with `ALLOW_ISOLATED_BROWSER_QA=true` and payments disabled, existing `vite.qa.config.ts` on8083 with API4001, then `node scripts/mobile-auth-qa.mjs`. Only explicitly labelled temporary taxonomy is used. Test assertions wait for guest account hydration before interacting; they do not mistake server-rendered, not-yet-hydrated buttons for working controls.
