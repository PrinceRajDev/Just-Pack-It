import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Order, SubOrder } from "@/domain/types";
import { orders } from "@/services/orders";
import { Button } from "@/components/ui/button";
export function BuyerCancellation({ order, sub }: { order: Order; sub: SubOrder }) {
  const client = useQueryClient(),
    [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const cancel = useMutation({
    mutationFn: () => orders.cancel(order.id, sub.id, sub.version!, reason.trim()),
    onSuccess: async () => {
      setOpen(false);
      await client.invalidateQueries({ queryKey: ["order"] });
      await client.invalidateQueries({ queryKey: ["orders"] });
      await client.invalidateQueries({ queryKey: ["notifications"] });
      await client.invalidateQueries({ queryKey: ["products"] });
      await client.invalidateQueries({ queryKey: ["product"] });
      await client.invalidateQueries({ queryKey: ["cart-review"] });
    },
  });
  if (sub.status === "cancelled") return null;
  const eligible =
    ["placed", "accepted"].includes(sub.status) &&
    sub.version !== undefined &&
    (order.paymentMethod === "cod" || order.paymentStatus === "paid");
  if (!eligible)
    return (
      <p className="text-sm text-muted-foreground">
        {order.paymentMethod === "razorpay" && order.paymentStatus !== "paid"
          ? "Online payment is not yet verified. Self-service cancellation is unavailable; check payment status or contact the platform."
          : "Self-service cancellation closes when preparation starts. Contact the shop for help; cancellation is not guaranteed."}
      </p>
    );
  return (
    <div className="rounded-lg border border-border p-3">
      {!open ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Cancel this shop’s items
        </Button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmed) cancel.mutate();
          }}
        >
          <p className="text-sm">
            Cancel only {sub.shopName ?? "this shop"}’s part? Other shops stay unchanged.{" "}
            {order.paymentMethod === "razorpay"
              ? "A refund request will be recorded; this does not confirm money returned to your bank."
              : "No cash is due for this cancelled part."}
          </p>
          <label className="block text-sm">
            Cancellation reason
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={reason}
              disabled={cancel.isPending}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 block w-full rounded border bg-background p-2"
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={cancel.isPending}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I want to cancel this shop’s part.
          </label>
          {cancel.isError && (
            <p role="alert" className="text-sm">
              {cancel.error.message} Refresh the order before retrying; it may already have changed.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={!confirmed || reason.trim().length < 3 || cancel.isPending}
            >
              {cancel.isPending ? "Cancelling…" : "Confirm shop cancellation"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={cancel.isPending}
              onClick={() => setOpen(false)}
            >
              Keep items
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
