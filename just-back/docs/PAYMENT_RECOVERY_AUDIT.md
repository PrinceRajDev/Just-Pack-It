# Payment recovery audit — 2026-10-31

See frontend `docs/payment-recovery-verification/README.md` for full test matrix, exact external test gateway IDs, screenshots and remaining launch blockers. API compatibility preserved; no schema migration.

- Actual isolated Razorpay test-bank Failure then Success verified on same order; provider-backed capture, no second stock deduction.
- Actual test refund rejected HTTP400 BAD_REQUEST_ERROR / invalid request sent; no provider refund ID, no success fiction. Same immutable key/body retained. Root cause unresolved. Public webhook dashboard delivery also remains unverified.
- Added checkout account-change guard; structured malformed webhook JSON400; digest-bound event completion; sanitized provider rejection vs outage; refund rejection review/audit metadata.
- Frontend saved payment polling and immediate action guard added. No automatic captures, transfers, refund retries, stock release or provider/infrastructure settings changed.
- Backend tests cover concurrency, late capture after failed/authorized, replay/signature/amount checks, refund terminal ordering, account rotation, rejection privacy and preserved obligations. Isolated MongoDB/provider doubles are distinguished from external gateway checks.

Do not enable live refunds based on this audit. Preserve original refund request/key when diagnosing provider rejection; never remove idempotency to force success. Production worker and index commands were not run. No .env changes.
