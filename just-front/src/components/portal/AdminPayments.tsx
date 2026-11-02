import { UiText, UiAttributes } from "@/lib/i18n/Language";
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
        <UiText>{"Online payments &amp; reconciliation"}</UiText>
      </h2>
      <p className="finance-description">
        Inspect stored Razorpay capture records. Rechecking never creates a new payment, issues a
        refund, releases inventory or settles sellers.
      </p>
      <div className="finance-toolbar">
        <label>
          <UiText>{"Payment state"}</UiText>{" "}
          <UiAttributes>
            <select
              aria-label="Payment state"
              className="ml-2 rounded border bg-background p-2"
              value={state}
              onChange={(event) => {
                setState(event.target.value as PaymentState | "all");
                setCursors([undefined]);
              }}
            >
              <option value="all">
                <UiText>{"All states"}</UiText>
              </option>
              {Object.entries(stateLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  <UiText>{label}</UiText>
                </option>
              ))}
            </select>
          </UiAttributes>
        </label>
        <label>
          <UiText>{"Payment mode"}</UiText>{" "}
          <UiAttributes>
            <select
              aria-label="Payment mode"
              className="ml-2 rounded border bg-background p-2"
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as PaymentMode);
                setCursors([undefined]);
              }}
            >
              <option value="all">
                <UiText>{"Test and live"}</UiText>
              </option>
              <option value="test">
                <UiText>{"Test only"}</UiText>
              </option>
              <option value="live">
                <UiText>{"Live only"}</UiText>
              </option>
            </select>
          </UiAttributes>
        </label>
        <Button
          variant="outline"
          onClick={() => {
            setState("all");
            setMode("all");
            setCursors([undefined]);
          }}
        >
          <UiText>{"Clear payment filters"}</UiText>
        </Button>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          <UiText>{"Refresh payments"}</UiText>
        </Button>
      </div>
      {query.isPending ? (
        <UiAttributes>
          <div role="status" aria-label="Loading online payments">
            <Skeleton className="h-20 w-full" />
          </div>
        </UiAttributes>
      ) : query.error ? (
        <UiAttributes>
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        </UiAttributes>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            {query.data.payments.length} records on this page. These are local records, not a live
            bank balance or seller settlement report. Creating/uncertain orders keep inventory
            reserved until reviewed.
          </p>
          {!query.data.payments.length && (
            <UiAttributes>
              <FinanceEmpty kind="payments" title="No matching online payments">
                Try another filter. No sample payments are shown in the connected dashboard.
              </FinanceEmpty>
            </UiAttributes>
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
                      <UiText>
                        {payment.testMode
                          ? "TEST order: no real payment. Do not fulfil."
                          : "Live-mode payment record"}
                      </UiText>
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
                    <UiText>{"Inspect payment"}</UiText>
                  </Button>
                ),
              },
            ]}
          />
          <UiAttributes>
            <nav aria-label="Payment pages" className="mt-6 flex flex-wrap gap-3">
              <Button
                variant="outline"
                disabled={cursors.length === 1 || query.isFetching}
                onClick={() => setCursors(cursors.slice(0, -1))}
              >
                <UiText>{"Previous payment page"}</UiText>
              </Button>
              <Button
                variant="outline"
                disabled={!query.data.next || query.isFetching}
                onClick={() => setCursors([...cursors, query.data.next])}
              >
                <UiText>{"Next payment page"}</UiText>
              </Button>
            </nav>
          </UiAttributes>
        </>
      )}
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="finance-drawer">
          <SheetTitle>
            <UiText>{"Payment details"}</UiText>
          </SheetTitle>
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
  if (query.isPending)
    return (
      <p role="status">
        <UiText>{"Loading payment details…"}</UiText>
      </p>
    );
  if (query.error)
    return (
      <UiAttributes>
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </UiAttributes>
    );
  const payment = query.data,
    mapping = !payment.providerOrderId;
  return (
    <UiAttributes>
      <section className="space-y-3 border-t pt-4" aria-label={`Payment details ${id}`}>
        <dl className="finance-detail-summary">
          <dt>
            <UiText>{"Marketplace order"}</UiText>
          </dt>
          <dd>{payment.orderId}</dd>
          <dt>
            <UiText>{"Amount (INR)"}</UiText>
          </dt>
          <dd>{inr(payment.amount / 100)}</dd>
          <dt>
            <UiText>{"Mode"}</UiText>
          </dt>
          <dd>
            <UiText>{payment.testMode ? "TEST: no real payment. Do not fulfil." : "Live"}</UiText>
          </dd>
          <dt>
            <UiText>{"State"}</UiText>
          </dt>
          <dd>{stateLabel[payment.state]}</dd>
          <dt>
            <UiText>{"Razorpay order ID"}</UiText>
          </dt>
          <dd>{payment.providerOrderId ?? "Not attached: reconciliation required"}</dd>
          <dt>
            <UiText>{"Created (IST)"}</UiText>
          </dt>
          <dd>{financeDate(payment.createdAt)}</dd>
        </dl>
        <p className="text-sm text-muted-foreground">
          Payment method, shop names, separate internal payment ID and a last-verification timestamp
          are not supplied by this API. Recent operator checks are listed below.
        </p>
        <p className="break-all text-sm">
          <UiText>{"Payment reference: "}</UiText>
          {payment.providerPaymentId ?? "No verified capture recorded"}
        </p>
        <RecoveryNotice recovery={payment.recovery} />
        {payment.paidAt && (
          <p className="text-sm">
            <UiText>{"Capture recorded "}</UiText>
            {financeDate(payment.paidAt)}
          </p>
        )}
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
              Copy the existing order ID from Razorpay after matching its marketplace receipt. Do
              not create a replacement provider order or enter secrets.
            </p>
            <label className="block text-sm">
              <UiText>{"Existing Razorpay order ID"}</UiText>
              <UiAttributes>
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
              </UiAttributes>
            </label>
            <label className="block text-sm">
              <UiText>{"Operator reason"}</UiText>
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
              I checked this existing provider order against the marketplace receipt. The server
              must still verify its account, INR amount and receipt.
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
            <UiText>
              {busy
                ? "Checking provider…"
                : mapping
                  ? "Verify mapping & recheck capture"
                  : "Recheck provider capture"}
            </UiText>
          </Button>
          <Button
            variant="outline"
            disabled={busy || query.isFetching}
            onClick={() => {
              setConfirmed(false);
              void query.refetch();
            }}
          >
            <UiText>{"Refresh payment details"}</UiText>
          </Button>
        </div>
        {message && (
          <p role="status" className="text-sm">
            <UiText>{message}</UiText>
          </p>
        )}
        <AdminRefunds orderId={id} />
        <h3 className="font-semibold">
          <UiText>{"Recent operator checks"}</UiText>
        </h3>
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
    </UiAttributes>
  );
}
