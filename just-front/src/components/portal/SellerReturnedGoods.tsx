import { UiAttributes } from "@/lib/i18n/Language";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SellerSuborder } from "@/domain/seller-orders";
import { delivery } from "@/services/delivery";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
export function SellerReturnedGoods({ sub }: { sub: SellerSuborder }) {
  const [confirmed, setConfirmed] = useState(false),
    [restock, setRestock] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    client = useQueryClient();
  if (sub.delivery?.state !== "returning") return null;
  return (
    <form
      className="space-y-3 rounded border border-warning p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current || !confirmed || !restock || reason.trim().length < 10) return;
        lock.current = true;
        setBusy(true);
        setError("");
        try {
          await delivery.returned(sub.orderId, sub.id, {
            version: sub.version,
            partnerId: sub.delivery!.partnerId,
            confirmGoodsReceived: true,
            restock: restock === "yes",
            reason: reason.trim(),
          });
          await client.invalidateQueries({ queryKey: ["seller-orders"] });
          void client.invalidateQueries({ queryKey: ["seller-products"] });
          void client.invalidateQueries({ queryKey: ["seller-dashboard"] });
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Return not confirmed. Refresh before retrying.",
          );
        } finally {
          setBusy(false);
          lock.current = false;
        }
      }}
    >
      <h3 className="font-semibold">Receive returned goods</h3>
      <p className="text-sm">
        Check all goods and the assigned partner ID before confirming. This cancels only this shop
        order. Any prepaid refund is requested separately; it is not marked paid.
      </p>
      <fieldset disabled={busy} className="space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I physically received all returned goods from the assigned partner.
        </label>
        <label className="block text-sm">
          Sellable stock decision
          <UiAttributes>
            <select
              className="mt-1 block w-full rounded border border-input bg-background p-2"
              aria-label="Sellable stock decision"
              value={restock}
              onChange={(e) => setRestock(e.target.value)}
            >
              <option value="">Choose after inspecting all items</option>
              <option value="yes">All goods sellable: restore ordered quantities</option>
              <option value="no">Do not restock returned goods</option>
            </select>
          </UiAttributes>
        </label>
        <label className="block text-sm">
          Return receipt note
          <Textarea value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
        </label>
        <Button
          variant="outline"
          disabled={busy || !confirmed || !restock || reason.trim().length < 10}
        >
          Confirm returned goods and cancel this part
        </Button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
