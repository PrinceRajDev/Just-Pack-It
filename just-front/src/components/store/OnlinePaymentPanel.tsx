import { LoadingState } from "@/components/common/LoadingState";
import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { onlinePayments, openOnlineCheckout } from "@/services/online-payments";
import { Button } from "@/components/ui/button";
export function OnlinePaymentPanel({ id }: { id: string }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const client = useQueryClient();
  const active = useRef(false);
  const query = useQuery({
    queryKey: ["online-payment", id],
    queryFn: () => onlinePayments.get(id),
    retry: false,
    refetchInterval: (q) => (q.state.data?.state === "paid" ? false : 15_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
  async function refresh() {
    await client.invalidateQueries({ queryKey: ["order"] });
    await client.invalidateQueries({ queryKey: ["orders"] });
    await query.refetch();
  }
  async function check() {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    try {
      const result = await onlinePayments.reconcile(id);
      setMessage(
        result.paymentStatus === "paid"
          ? "Online payment captured and verified."
          : "Payment is not captured yet. Do not pay cash for this order.",
      );
      await refresh();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Payment status is uncertain; retry this check.",
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  async function pay() {
    if (
      active.current ||
      !query.data?.enabled ||
      query.data.state !== "ready" ||
      query.data.reconciliationRequired
    )
      return;
    active.current = true;
    setBusy(true);
    setMessage("");
    try {
      await openOnlineCheckout(
        query.data,
        () => {
          setMessage("Online payment captured and verified.");
          void refresh();
        },
        setMessage,
        () => {
          active.current = false;
          setBusy(false);
        },
      );
    } catch (cause) {
      active.current = false;
      setMessage(cause instanceof Error ? cause.message : "Secure checkout could not open.");
      setBusy(false);
    }
  }
  return (
    <UiAttributes>
      <section
        className="space-y-3 rounded-xl border border-primary/20 bg-secondary/30 p-4"
        aria-label="Online payment status"
      >
        <h2 className="font-semibold">Razorpay online payment</h2>
        {query.data?.testMode && (
          <p className="font-semibold">Test mode: no real payment or purchase.</p>
        )}
        <p className="text-sm">
          Do not pay cash for this online order. Payment confirmation and shop acceptance are
          separate.
        </p>
        {query.isPending ? (
          <LoadingState label="Loading payment…" compact />
        ) : query.error ? (
          <p role="alert">{query.error.message}</p>
        ) : query.data.state === "paid" ? (
          <p>Captured online. Seller settlement is separate.</p>
        ) : query.data.reconciliationRequired ? (
          <p role="alert">
            Provider creation is uncertain. Contact the operator with this order ID; do not create a
            replacement payment.
          </p>
        ) : !query.data.enabled ? (
          <p role="alert">
            Online checkout is unavailable. Check this order before trying another payment.
          </p>
        ) : (
          <Button disabled={busy} onClick={() => void pay()}>
            Pay securely with Razorpay
          </Button>
        )}
        <Button variant="outline" disabled={busy} onClick={() => void check()}>
          Check payment status
        </Button>
        {message && (
          <p role="status" className="text-sm">
            <UiText>{message}</UiText>
          </p>
        )}
      </section>
    </UiAttributes>
  );
}
