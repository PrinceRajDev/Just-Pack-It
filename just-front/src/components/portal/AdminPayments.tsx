import { financeDate } from "@/lib/finance-date";
import { FinancialTable, FinanceEmpty } from "./FinancePresentation";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { CreditCard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminPayments } from "@/services/admin-payments";
import type { AdminPayment, PaymentMode, PaymentState } from "@/domain/admin-payments";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/states";
import { inr } from "@/lib/image";
import { AdminRefunds } from "./AdminRefunds";
import { RecoveryNotice } from "./RecoveryNotice";
const stateLabel = {
  creating: "Provider creation in progress",
  uncertain: "Creation needs reconciliation",
  ready: "Awaiting captured payment",
  paid: "Capture verified",
};
export function AdminPayments() {
  const [selected, setSelected] = useState<AdminPayment | null>(null);
  const [state, setState] = useState<PaymentState | "all">("all"),
    [mode, setMode] = useState<PaymentMode>("all"),
    [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const query = useQuery({
    queryKey: ["admin-payments", state, mode, cursors.at(-1)],
    queryFn: () => adminPayments.list(state, mode, cursors.at(-1)),
    retry: false,
  });
  return (
    <section className="finance-panel">
      <h2 className="finance-panel-title">
        <CreditCard aria-hidden="true" />
        Online payments &amp; reconciliation
      </h2>
      <p className="finance-description">
        Inspect stored Razorpay capture records. Rechecking never creates a new payment, issues a
        refund, releases inventory or settles sellers.
      </p>
      <div className="finance-toolbar">
        <label>
          Payment state{" "}
          <select
            aria-label="Payment state"
            className="ml-2 rounded border bg-background p-2"
            value={state}
            onChange={(event) => {
              setState(event.target.value as PaymentState | "all");
              setCursors([undefined]);
            }}
          >
            <option value="all">All states</option>
            {Object.entries(stateLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Payment mode{" "}
          <select
            aria-label="Payment mode"
            className="ml-2 rounded border bg-background p-2"
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as PaymentMode);
              setCursors([undefined]);
            }}
          >
            <option value="all">Test and live</option>
            <option value="test">Test only</option>
            <option value="live">Live only</option>
          </select>
        </label>
        <Button
          variant="outline"
          onClick={() => {
            setState("all");
            setMode("all");
            setCursors([undefined]);
          }}
        >
          Clear payment filters
        </Button>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Refresh payments
        </Button>
      </div>
      {query.isPending ? (
        <div role="status" aria-label="Loading online payments">
          <Skeleton className="h-20 w-full" />
        </div>
      ) : query.error ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            {query.data.payments.length} records on this page. These are local records, not a live
            bank balance or seller settlement report. Creating/uncertain orders keep inventory
            reserved until reviewed.
          </p>
          {!query.data.payments.length && (
            <FinanceEmpty kind="payments" title="No matching online payments">
              Try another filter. No sample payments are shown in the connected dashboard.
            </FinanceEmpty>
          )}
          <FinancialTable
            rows={query.data.payments}
            rowKey={(payment) => payment.orderId}
            columns={[
              { title: "Created (IST)", cell: (payment) => financeDate(payment.createdAt) },
              {
                title: "Marketplace order",
                cell: (payment) => (
                  <>
                    <span className="finance-id">{payment.orderId}</span>
                    <small>
                      {payment.testMode
                        ? "TEST order — no real payment. Do not fulfil."
                        : "Live-mode payment record"}
                    </small>
                    {payment.recovery?.manualReview && (
                      <small>Recovery needs operator review</small>
                    )}
                  </>
                ),
              },
              {
                title: "Razorpay payment ID",
                cell: (payment) => payment.providerPaymentId ?? "No verified capture recorded",
              },
              { title: "Amount", cell: (payment) => inr(payment.amount / 100) },
              {
                title: "State",
                cell: (payment) => (
                  <span
                    className={`finance-badge ${payment.state === "paid" ? "" : payment.state === "uncertain" ? "attention" : "pending"}`}
                  >
                    {stateLabel[payment.state]}
                  </span>
                ),
              },
              {
                title: "Actions",
                cell: (payment) => (
                  <Button variant="outline" onClick={() => setSelected(payment)}>
                    Inspect payment
                  </Button>
                ),
              },
            ]}
          />
          <nav aria-label="Payment pages" className="mt-6 flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={cursors.length === 1 || query.isFetching}
              onClick={() => setCursors(cursors.slice(0, -1))}
            >
              Previous payment page
            </Button>
            <Button
              variant="outline"
              disabled={!query.data.next || query.isFetching}
              onClick={() => setCursors([...cursors, query.data.next])}
            >
              Next payment page
            </Button>
          </nav>
        </>
      )}
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="finance-drawer">
          <SheetTitle>Payment details</SheetTitle>
          <SheetDescription>
            Stored Razorpay record. Verify provider capture separately from refunds and seller
            settlement.
          </SheetDescription>
          {selected && <PaymentDetail key={selected.orderId} id={selected.orderId} />}
        </SheetContent>
      </Sheet>
    </section>
  );
}
function PaymentDetail({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["admin-payment", id],
    queryFn: () => adminPayments.get(id),
    retry: false,
  });
  const client = useQueryClient();
  const [providerOrderId, setProviderOrderId] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  async function reconcile() {
    if (!query.data || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const order = await adminPayments.reconcile(
        id,
        query.data.providerOrderId
          ? undefined
          : {
              providerOrderId: providerOrderId.trim(),
              reason: reason.trim(),
              confirmProviderOrder: true,
            },
      );
      setMessage(
        order.paymentStatus === "paid"
          ? "Provider capture verified. Seller settlement remains separate."
          : "Provider checked: payment is not captured. Inventory remains reserved.",
      );
      setConfirmed(false);
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? `${cause.message} Refresh details before another action.`
          : "Result is uncertain. Refresh payment details before retrying.",
      );
    } finally {
      await client.invalidateQueries({ queryKey: ["admin-payment", id] });
      await client.invalidateQueries({ queryKey: ["admin-payments"] });
      await client.invalidateQueries({ queryKey: ["admin-orders"] });
      setBusy(false);
      lock.current = false;
    }
  }
  if (query.isPending) return <p role="status">Loading payment details…</p>;
  if (query.error)
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  const payment = query.data,
    mapping = !payment.providerOrderId;
  return (
    <section className="space-y-3 border-t pt-4" aria-label={`Payment details ${id}`}>
      <dl className="finance-detail-summary">
        <dt>Marketplace order</dt>
        <dd>{payment.orderId}</dd>
        <dt>Amount (INR)</dt>
        <dd>{inr(payment.amount / 100)}</dd>
        <dt>Mode</dt>
        <dd>{payment.testMode ? "TEST — no real payment. Do not fulfil." : "Live"}</dd>
        <dt>State</dt>
        <dd>{stateLabel[payment.state]}</dd>
        <dt>Razorpay order ID</dt>
        <dd>{payment.providerOrderId ?? "Not attached — reconciliation required"}</dd>
        <dt>Created (IST)</dt>
        <dd>{financeDate(payment.createdAt)}</dd>
      </dl>
      <p className="text-sm text-muted-foreground">
        Payment method, shop names, separate internal payment ID and a last-verification timestamp
        are not supplied by this API. Recent operator checks are listed below.
      </p>
      <p className="break-all text-sm">
        Payment reference: {payment.providerPaymentId ?? "No verified capture recorded"}
      </p>
      <RecoveryNotice recovery={payment.recovery} />
      {payment.paidAt && <p className="text-sm">Capture recorded {financeDate(payment.paidAt)}</p>}
      {!payment.onlineEnabled && (
        <p role="status" className="text-sm">
          Razorpay is disabled. Records remain visible; rechecking is unavailable.
        </p>
      )}
      {!payment.accountMatches && (
        <p role="alert" className="text-sm">
          This record belongs to a different or unconfigured Razorpay account. Rechecking is
          blocked.
        </p>
      )}
      {mapping && (
        <fieldset
          disabled={busy || !payment.onlineEnabled || !payment.accountMatches}
          className="space-y-3"
        >
          <legend className="font-semibold">Recover an uncertain provider-order mapping</legend>
          <p className="text-sm">
            Copy the existing order ID from Razorpay after matching its marketplace receipt. Do not
            create a replacement provider order or enter secrets.
          </p>
          <label className="block text-sm">
            Existing Razorpay order ID
            <input
              className="mt-1 block w-full rounded border bg-background p-2"
              value={providerOrderId}
              maxLength={100}
              placeholder="order_…"
              onChange={(event) => {
                setProviderOrderId(event.target.value);
                setConfirmed(false);
              }}
            />
          </label>
          <label className="block text-sm">
            Operator reason
            <textarea
              className="mt-1 block w-full rounded border bg-background p-2"
              value={reason}
              minLength={3}
              maxLength={300}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I checked this existing provider order against the marketplace receipt. The server must
            still verify its account, INR amount and receipt.
          </label>
        </fieldset>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={
            busy ||
            query.isFetching ||
            !payment.onlineEnabled ||
            !payment.accountMatches ||
            (mapping &&
              (!confirmed ||
                !/^order_[A-Za-z0-9]+$/.test(providerOrderId.trim()) ||
                reason.trim().length < 3))
          }
          onClick={() => void reconcile()}
        >
          {busy
            ? "Checking provider…"
            : mapping
              ? "Verify mapping & recheck capture"
              : "Recheck provider capture"}
        </Button>
        <Button
          variant="outline"
          disabled={busy || query.isFetching}
          onClick={() => {
            setConfirmed(false);
            void query.refetch();
          }}
        >
          Refresh payment details
        </Button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <AdminRefunds orderId={id} />
      <h3 className="font-semibold">Recent operator checks</h3>
      {!payment.audit.length ? (
        <p className="text-sm">No operator reconciliation checks recorded.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {payment.audit.map((entry) => (
            <li key={entry.id}>
              {financeDate(entry.at)} · {entry.action.replaceAll("_", " ")} ·{" "}
              {entry.outcome.replaceAll("_", " ")}
              {entry.code && ` · ${entry.code}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
