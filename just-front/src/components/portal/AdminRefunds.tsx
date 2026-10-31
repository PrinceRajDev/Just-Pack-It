import { financeDate } from "@/lib/finance-date";
import { FinanceEmpty } from "./FinancePresentation";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminRefunds } from "@/services/refunds";
import type { AdminRefund } from "@/domain/refunds";
import { RefundNotice } from "@/components/store/RefundNotice";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/image";
import { RecoveryNotice } from "./RecoveryNotice";
export function AdminRefunds({ orderId }: { orderId: string }) {
  const query = useQuery({
    queryKey: ["admin-refunds", orderId],
    queryFn: () => adminRefunds.list(orderId),
    retry: false,
  });
  return (
    <section className="space-y-3 border-t pt-4" aria-label="Cancelled suborder refunds">
      <h3 className="font-semibold">Cancelled suborder refunds</h3>
      <p className="text-sm text-muted-foreground">
        Payment-scoped refund requests and confirmed provider records. Requested or pending is not
        processed or bank-credited.
      </p>
      {query.isPending ? (
        <p role="status">Loading refunds…</p>
      ) : query.error ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry refunds
          </Button>
        </div>
      ) : !query.data.length ? (
        <FinanceEmpty kind="refunds" title="No refund records found">
          No refund requests for this payment.
        </FinanceEmpty>
      ) : (
        query.data.map((refund) => <RefundAction key={refund.id} refund={refund} />)
      )}
    </section>
  );
}
function RefundAction({ refund }: { refund: AdminRefund }) {
  const client = useQueryClient();
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  async function run(submit: boolean) {
    if (lock.current || (submit && !confirmed)) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await (submit
        ? adminRefunds.submit(refund.id)
        : adminRefunds.reconcile(refund.id));
      setMessage(
        result.state === "processed"
          ? "Provider confirmed refund processing."
          : "Refund checked. See the recorded state; this is not confirmation of bank credit.",
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Refund result is uncertain. Refresh before acting again; keep the same request key.",
      );
    } finally {
      setConfirmed(false);
      await client.invalidateQueries({ queryKey: ["admin-refunds", refund.orderId] });
      await client.invalidateQueries({ queryKey: ["admin-payment", refund.orderId] });
      await client.invalidateQueries({ queryKey: ["admin-orders"] });
      setBusy(false);
      lock.current = false;
    }
  }
  const maySubmit =
    !refund.providerRefundId && ["requested", "uncertain", "submitting"].includes(refund.state);
  return (
    <div className="finance-refund space-y-3">
      <h4 className="font-semibold">{refund.shopName}</h4>
      {refund.testMode && <p className="font-semibold">TEST refund — no real money returned.</p>}
      <RefundNotice refund={refund} />
      <dl className="finance-detail-summary">
        <dt>Refund request ID</dt>
        <dd>{refund.id}</dd>
        <dt>Marketplace order</dt>
        <dd>{refund.orderId}</dd>
        <dt>Requested (IST)</dt>
        <dd>{financeDate(refund.createdAt)}</dd>
        <dt>Last state update (IST)</dt>
        <dd>{financeDate(refund.updatedAt)}</dd>
      </dl>
      <RecoveryNotice recovery={refund.recovery} />
      <p className="text-sm">Reason: {refund.reason}</p>
      <p className="break-all text-sm">
        Provider refund: {refund.providerRefundId ?? "Not confirmed"}
      </p>
      {maySubmit && (
        <>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || !refund.canSubmit}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I authorize the {refund.testMode ? "test-mode" : "live"} refund of {inr(refund.amount)}{" "}
            to the original payment method for this cancelled shop order.
          </label>
          <Button disabled={busy || !confirmed || !refund.canSubmit} onClick={() => void run(true)}>
            {busy
              ? "Checking…"
              : refund.state === "requested"
                ? "Submit confirmed refund"
                : "Recover same refund request"}
          </Button>
        </>
      )}
      {refund.providerRefundId && (
        <Button
          variant="outline"
          disabled={busy || !refund.canReconcile}
          onClick={() => void run(false)}
        >
          Check provider refund status
        </Button>
      )}
      {!refund.canSubmit && maySubmit && (
        <p className="text-sm">
          Refund submissions are disabled or this payment account is not configured.
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
