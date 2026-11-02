import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { createOnlineAttempt } from "@/services/online-payments";
import type { OnlineOrderInput } from "@/domain/online-payments";
import { useCart } from "@/stores/cart";
import { Button } from "@/components/ui/button";
export function OnlineOrderAction({
  userId,
  input = null,
}: {
  userId: string;
  input?: OnlineOrderInput | null;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [consent, setConsent] = useState(false);
  const navigate = useNavigate(),
    cart = useCart();
  async function submit(recover = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await createOnlineAttempt(userId, recover ? null : input);
      cart.removePurchased(result.input.items);
      void navigate({
        to: "/orders/$id",
        params: { id: result.checkout.orderId },
        search: { placed: false },
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Payment order is uncertain. Recover the same attempt or check order history.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <UiAttributes>
      <section className="space-y-3 rounded-lg border p-4" aria-label="Online payment order">
        <p className="text-sm">
          Create a reserved order, then pay through Razorpay. Shops receive it only after verified
          capture. Closing checkout does not cancel the reservation.
        </p>
        {input && (
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(event) => setConsent(event.target.checked)}
            />
            I reviewed the total and want to continue to secure online payment.
          </label>
        )}
        {input && (
          <Button disabled={busy || !consent} onClick={() => void submit()}>
            <UiText>{"Continue to secure payment"}</UiText>
          </Button>
        )}
        <Button variant="outline" disabled={busy} onClick={() => void submit(true)}>
          Recover online order attempt
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </section>
    </UiAttributes>
  );
}
