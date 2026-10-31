# Expiry operations design

The expiry worker is a separate process, disabled by default and never started by the HTTP server. `INVENTORY_EXPIRY_WORKER_ENABLED=true` is an explicit operator activation gate. The command validates configuration and indexes before polling. No real environment file is changed and no worker is launched by this implementation task.

Poll every 15 seconds, at most 100 eligible expired holds per pass, and schedule the next pass only after completion. Multiple processes are safe because each release is already transactional/idempotent. Graceful shutdown stops new work, waits for the current pass and then disconnects; a 30-second shutdown deadline exits nonzero for operator attention.

One corrupt hold must not starve every later hold. Record only a safe failure code, failure count and next retry time after a failed transactional release; continue the bounded batch. Back off failed holds for 60 seconds, exponentially to a 5-minute cap. No stock is restored outside the transaction. Database failure while recording retry state propagates to the worker and is logged without raw database errors/secrets. Hold records never receive TTL indexes; startup rejects TTL indexes and missing recovery query indexes.

Admin-only `GET /admin/inventory` supplies held/overdue/retrying counts, oldest-overdue age and server check time, with no buyer IDs, line data or addresses. `workerConfigured` is a configuration value, **not proof the worker process is running**. External monitoring should alert on persistent overdue stock, retries, error logs or worker exit; heartbeat/alert delivery remains a deployment dependency. No public reserve/order endpoint is enabled here.

## Operator runbook (not executed against Atlas)

1. Review `INVENTORY_RESERVATIONS.md` and reconcile any corrupt ledger/product records. Do not delete held records to clear stock problems.
2. Apply the additive declared indexes through the existing operator-reviewed `npm run db:indexes` workflow. Do not drop existing production indexes without a separate migration review. Startup refuses reservation TTL indexes.
3. Set `INVENTORY_EXPIRY_WORKER_ENABLED=true` only in the intended worker process environment. The default/example stays false. No additional credentials are needed beyond backend MongoDB/secret configuration.
4. Development command: `npm run inventory:worker`. For a built deployment: `npm run build`, then `npm run inventory:worker:start`; the built worker runs without tsx/dev dependencies. Use a process supervisor with restart/error alerting. Do not assume starting the HTTP server also starts cleanup.
5. Poll the authenticated admin status API and inspect structured batch logs. `completed` counts successful idempotent examinations, not unique newly released holds when multiple workers race. Persistent overdue/retrying counts need investigation. A corrupt hold remains held and stock remains conservatively deducted until repair.

## Verification — 2026-10-29

Backend suite passed 71 tests in four files using isolated local MongoMemoryReplSet; final typecheck, lint and build passed after relocating the compiled worker entrypoint and hardening shutdown cleanup. New tests cover strict default-off environment parsing, non-overlapping scheduling, recovery after pass failure, timer cancellation, waiting for an in-flight pass on stop, admin authorization/privacy, corrupt-hold isolation/backoff, monitoring counts, repair recovery and unsafe TTL rejection. All temporary index manipulations occurred only in the isolated test database. No real worker, production migration, reserve request, order or payment was executed. Frontend is unchanged and its checks were not rerun.

Changed files: `src/config/env.ts`, `.env.example`, `src/inventory/models.ts`, `src/inventory/service.ts`, new `operations.ts`, `worker-loop.ts`, `worker.ts` in that domain, `src/app.ts`, `package.json`, tests, README and API/operations docs. Remaining launch dependencies: public reservation limits/rate controls, complete quote/fee policy, transactional order consumption/idempotency and the payment lifecycle.
