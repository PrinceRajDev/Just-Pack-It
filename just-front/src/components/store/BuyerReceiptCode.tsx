import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useEffect, useState } from "react";
import { receipts } from "@/services/receipts";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/image";
export function BuyerReceiptCode({
  orderId,
  subId,
  version,
  amount,
  prepaid = false,
}: {
  orderId: string;
  subId: string;
  version: number;
  amount: number;
  prepaid?: boolean;
}) {
  const [received, setReceived] = useState(false),
    [paid, setPaid] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [expired, setExpired] = useState(false),
    [receipt, setReceipt] = useState<Awaited<ReturnType<typeof receipts.issue>> | null>(null);
  useEffect(() => {
    if (!receipt) return;
    const timer = setTimeout(
      () => {
        setReceipt(null);
        setExpired(true);
        setReceived(false);
        setPaid(false);
      },
      Math.max(0, new Date(receipt.expiresAt).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [receipt]);
  async function issue() {
    if (busy || !received || (!prepaid && !paid)) return;
    setBusy(true);
    setError("");
    setExpired(false);
    // A failed/replaced request must never keep displaying an old, possibly rotated code.
    setReceipt(null);
    try {
      const result = await receipts.issue(orderId, subId, version, prepaid);
      if (!prepaid && result.amount !== amount)
        throw new Error("The amount changed. Refresh your order before issuing a code.");
      setReceipt(result);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't issue the code. If a response was lost, wait 60 seconds before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <UiAttributes>
      <section
        className="space-y-3 rounded-lg border border-primary/20 bg-secondary/30 p-4"
        aria-label="Buyer receipt confirmation"
      >
        <h3 className="font-semibold">Confirm this shop's handoff</h3>
        <p className="text-sm">
          <UiText>
            {prepaid
              ? "Payment was captured online. Share this code only after receiving the goods; do not pay cash again."
              : "Generate and share this code only after receiving the goods and paying cash."}
          </UiText>{" "}
          It is shown in your account; no SMS is sent.
        </p>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 accent-primary"
            checked={received}
            onChange={(event) => setReceived(event.target.checked)}
            disabled={busy || !!receipt}
          />
          I received all items in this shop's suborder.
        </label>
        {!prepaid && (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 accent-primary"
              checked={paid}
              onChange={(event) => setPaid(event.target.checked)}
              disabled={busy || !!receipt}
            />
            I paid {inr(amount)} in cash for this shop's suborder.
          </label>
        )}
        <Button disabled={busy || !received || (!prepaid && !paid)} onClick={() => void issue()}>
          <UiText>
            {busy ? "Generating…" : receipt ? "Generate replacement code" : "Generate receipt code"}
          </UiText>
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error} Refresh the order if its status changed. A new code can be issued only once per
            minute.
          </p>
        )}
        {expired && (
          <p role="status" className="text-sm">
            The code expired. Confirm receipt/payment again to generate another.
          </p>
        )}
        {receipt && (
          <div role="status">
            <p className="text-sm">One-time receipt code</p>
            <UiAttributes>
              <output
                aria-label="One-time receipt code"
                className="font-mono text-3xl tracking-widest"
              >
                {receipt.code}
              </output>
            </UiAttributes>
            <p className="text-sm">
              <UiText>
                {prepaid
                  ? "Seller handoff confirmation is pending. No cash collection is required."
                  : "Seller confirmation is pending; issuing a code alone does not record cash collection."}
              </UiText>
            </p>
            <p className="text-sm">
              Valid until{" "}
              {new Date(receipt.expiresAt).toLocaleTimeString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}{" "}
              India time. Replacing a code invalidates the previous one.
            </p>
          </div>
        )}
      </section>
    </UiAttributes>
  );
}
