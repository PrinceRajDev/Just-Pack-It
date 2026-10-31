# Live account addresses

The API account page now supports listing, creating, editing and removing saved addresses. It retains the existing paper/green components and leaves demo account behavior unchanged. Inputs are labelled, required and bounded; pincode uses numeric input and a six-digit Indian pattern. Server-side validation remains authoritative. Failed saves retain drafts, version conflicts explain cancel/reload recovery, navigation is guarded while dirty, and deletion requires explicit confirmation. No serviceability or delivery price is inferred from a saved address.

Private queries are keyed by authenticated user ID and cleared by the existing auth lifecycle. The component remounts on account changes, and renders only after session restoration. Requests use the shared API client through the address service; no UI fetch or secret is introduced.

Changed files: `src/components/auth/LiveAccount.tsx`, new `src/components/auth/SavedAddresses.tsx`, new `src/services/addresses.ts`, new `src/test/saved-addresses.test.tsx`, `docs/API_CONTRACT.md`, and this report.

Verification 2026-10-29: `npx tsc --noEmit` passed; `npm run test` passed 75 tests in 16 files; `npm run lint` passed with 0 errors and 22 existing Fast Refresh warnings; `npm run build` passed. Initial lint formatting errors in the new files were corrected before the successful rerun. Four new mocked UI tests cover versioned edits, conflict draft retention, confirmed removal, retry/empty state and creation. No real customer address was written, and browser end-to-end persistence has not been verified. Backend was unchanged this turn; its prior 55-test result was not rerun.

Remaining: checkout must resolve the owned saved address and validate shop-specific serviceability, fulfilment options, fees and inventory. Orders, stock reservations and payments remain disabled.
