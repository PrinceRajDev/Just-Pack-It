# Authentication form design verification

Updated the existing `/login` screen and its live registration modes. Kept phone/password authentication, email verification requirements, role eligibility, seller approval, photo upload and redirect behaviour intact. No backend changes.

Changed application files:
- `src/routes/login.tsx`: branded illustrated welcome panel and mode-specific heading context.
- `src/components/auth/LiveAuthForm.tsx`: grouped identity fields, explicit buyer/seller cards, field guidance, submit progress, account switch and session disclosure.
- `src/styles/auth.css`: responsive form card, input/focus styles and seller section treatment.

Checks run:
- TypeScript: `npx tsc --noEmit` passed.
- Existing onboarding tests: `npm test -- --reporter=dot src/test/signup-onboarding.test.tsx`: 6 passed.
- `npm run build`: passed.
- `npm run lint`: no errors; 23 existing warnings.
- `node scripts/auth-design-qa.mjs`: login, buyer and seller modes at 1440/390/320px; no horizontal overflow. Signup/sign-in switching and password visibility passed. Browser setup responses intercepted with QA-only category/area and email delivery unavailable. No account registration or email delivery performed.

First visual attempt clicked before React hydration; screenshots were overwritten by the successful rerun after waiting for hydration. Final screenshots: `auth-login-*.png`, `auth-buyer-*.png`, `auth-seller-*.png`.

Actual OTP delivery, real registration and physical phone keyboard testing were not performed in this design task. Existing server verification requirements still control registration availability.
