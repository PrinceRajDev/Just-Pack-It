import { SellerReturnedGoods } from "./SellerReturnedGoods";
import { delivery } from "@/services/delivery";
import { DeliveryPinLink } from "@/components/store/DeliveryPinLink";
import { SellerOrderAlerts } from "./SellerOrderAlerts";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sellerOrders } from "@/services/seller-orders";
import type { SellerOrderStatus, SellerSuborder } from "@/domain/seller-orders";
import type { ManagedShop } from "@/domain/management";
import { PortalHeader } from "./PortalShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { inr } from "@/lib/image";
import { fulfilmentLabel } from "@/components/store/ShopMark";
import { SellerCashHandoff } from "./SellerCashHandoff";
import { cashLabel } from "@/lib/cash-label";
import { RefundNotice } from "@/components/store/RefundNotice";
export function LiveSellerOrders({ shop }: { shop: ManagedShop }) {
  const [status, setStatus] = useState<SellerOrderStatus | "all">("placed");
  const [notice, setNotice] = useState(""),
    [refreshToken, setRefreshToken] = useState(0);
  const query = useQuery({
    queryKey: ["seller-orders", shop.id, status],
    queryFn: () => sellerOrders.list(status === "all" ? undefined : status),
    refetchInterval: 15000,
    retry: false,
  });
  return (
    <>
      <PortalHeader
        title="Your shop's orders"
        sub="Accept and prepare only your shop's part. COD is not collected by changing these statuses."
      />
      <SellerOrderAlerts
        key={shop.id}
        shopId={shop.id}
        onReview={() => {
          setStatus("placed");
          void query.refetch();
        }}
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Label htmlFor="seller-order-filter">Order status</Label>
        <select
          id="seller-order-filter"
          className="rounded-lg border border-input bg-background p-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as SellerOrderStatus | "all")}
        >
          {[
            "placed",
            "accepted",
            "preparing",
            "ready",
            "out_for_delivery",
            "delivered",
            "cancelled",
            "all",
          ].map((value) => (
            <option key={value} value={value}>
              {value === "placed" ? "New / awaiting acceptance" : value}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() =>
            void query.refetch().then((result) => {
              if (!result.isError) setRefreshToken((value) => value + 1);
            })
          }
        >
          Refresh orders
        </Button>
      </div>
      {notice && (
        <p role="status" className="mb-3 text-sm text-primary">
          {notice}
        </p>
      )}
      {query.isPending ? (
        <p role="status">Loading shop orders…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>Couldn't load shop orders. No sample orders are shown.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry shop orders
          </Button>
        </div>
      ) : !query.data.length ? (
        <p>No orders in this view.</p>
      ) : (
        <ul className="space-y-5">
          {query.data.map((sub) => (
            <li key={`${sub.orderId}:${sub.id}`}>
              <SellerOrderCard
                key={`${sub.id}:${sub.version}:${refreshToken}`}
                sub={sub}
                canProcess={shop.active && shop.status === "approved"}
                onSaved={(value) => setNotice(`Order status saved: ${value}.`)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
export function SellerOrderCard({
  sub,
  canProcess,
  onSaved,
}: {
  sub: SellerSuborder;
  canProcess: boolean;
  onSaved: (status: SellerOrderStatus) => void;
}) {
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const client = useQueryClient();
  const next =
    sub.status === "placed"
      ? "accepted"
      : sub.status === "accepted"
        ? "preparing"
        : sub.status === "preparing"
          ? "ready"
          : sub.status === "ready" && sub.fulfilment === "seller_delivery"
            ? "out_for_delivery"
            : undefined;
  async function change(status: Exclude<SellerOrderStatus, "placed">) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await sellerOrders.transition(sub, status, reason);
      onSaved(status);
      setNotice("Order status saved.");
      await client.invalidateQueries({ queryKey: ["seller-orders"] });
      void client.invalidateQueries({ queryKey: ["seller-dashboard"] });
      void client.invalidateQueries({ queryKey: ["orders"] });
      void client.invalidateQueries({ queryKey: ["order"] });
      if (status === "cancelled") {
        void client.invalidateQueries({ queryKey: ["seller-products"] });
        void client.invalidateQueries({ queryKey: ["seller-product"] });
        void client.invalidateQueries({ queryKey: ["products"] });
        void client.invalidateQueries({ queryKey: ["product"] });
        void client.invalidateQueries({ queryKey: ["cart-review"] });
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Status could not be confirmed. Refresh orders before acting again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="space-y-3 rounded-xl border border-border bg-card p-5">
      {sub.testMode && (
        <p className="font-semibold">
          Test order — no real payment. Do not physically fulfil or collect cash.
        </p>
      )}
      <h2 className="font-display text-xl">
        Order {sub.orderId.slice(0, 8)} · {sub.shopName}
      </h2>
      <p className="text-sm">
        {sub.status} · {fulfilmentLabel[sub.fulfilment]} ·{" "}
        {sub.paymentMethod === "razorpay" ? "Prepaid online" : "COD"} ·{" "}
        {cashLabel(sub.paymentStatus)}
      </p>
      <ul className="divide-y divide-border text-sm">
        {sub.lines.map((line, index) => (
          <li
            key={`${line.productId}:${line.variantId ?? index}`}
            className="flex justify-between gap-3 py-2"
          >
            <span>
              {line.name}
              {line.variantLabel ? ` · ${line.variantLabel}` : ""} · {line.unit} × {line.qty}
            </span>
            <span>{inr(line.price * line.qty)}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        Items: {inr(sub.itemsSubtotal)} · Delivery: {inr(sub.deliveryFee)}
      </p>
      <p className="font-semibold">
        {sub.paymentMethod === "razorpay" ? "Online amount due" : "COD amount due for your shop"}:{" "}
        {inr(sub.amountDue)}
      </p>
      {sub.deliveryAddress && (
        <p className="text-sm">
          Deliver to: {sub.deliveryAddress.line1}, {sub.deliveryAddress.locality},{" "}
          {sub.deliveryAddress.city} {sub.deliveryAddress.pincode}
        </p>
      )}
      {sub.deliveryAddress?.location && <DeliveryPinLink location={sub.deliveryAddress.location} />}
      {sub.delivery && (
        <div className="space-y-2 rounded border border-border p-3 text-sm">
          <p>
            Assigned delivery partner ID:{" "}
            <span className="break-all font-mono">{sub.delivery.partnerId}</span> ·{" "}
            {sub.delivery.state.replaceAll("_", " ")}
          </p>
          {sub.delivery.state === "claimed" && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={async () => {
                if (
                  !window.confirm(
                    "Verify the assigned partner ID in their delivery screen. Confirm you actually handed over these goods?",
                  )
                )
                  return;
                setBusy(true);
                setError("");
                try {
                  await delivery.pickup(sub.orderId, sub.id, sub.version, sub.delivery!.partnerId);
                  await client.invalidateQueries({ queryKey: ["seller-orders"] });
                  void client.invalidateQueries({ queryKey: ["seller-dashboard"] });
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : "Pickup not confirmed; refresh.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirm goods handed to assigned partner
            </Button>
          )}
        </div>
      )}
      <SellerReturnedGoods sub={sub} />
      {sub.cancelReason && <p className="text-sm">Cancellation reason: {sub.cancelReason}</p>}
      {sub.refund && <RefundNotice refund={sub.refund} />}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error} Refresh orders before trying another action.
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      {sub.paymentMethod === "razorpay" && (
        <p className="text-sm">
          Paid online. Do not collect cash. Cancelling before preparation requests an admin-issued
          refund; it does not instantly return money.
        </p>
      )}
      {next && (
        <Button disabled={busy || !!error || !canProcess} onClick={() => void change(next)}>
          {busy
            ? "Saving…"
            : next === "accepted"
              ? "Accept order"
              : next === "preparing"
                ? "Start preparing"
                : next === "ready"
                  ? "Mark ready"
                  : "Mark out for delivery"}
        </Button>
      )}
      {next && !canProcess && (
        <p className="text-sm text-muted-foreground">
          Your shop needs active approval to process orders. Pre-preparation rejection/cancellation
          remains available.
        </p>
      )}
      {(sub.status === "placed" || sub.status === "accepted") && (
        <div className="space-y-2 border-t border-border pt-3">
          <Label htmlFor={`cancel-${sub.id}`}>Reason for buyer (required to reject/cancel)</Label>
          <Textarea
            id={`cancel-${sub.id}`}
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy || !!error}
          />
          <Button
            variant="outline"
            disabled={busy || !!error || reason.trim().length < 3}
            onClick={() => void change("cancelled")}
          >
            {sub.status === "placed" ? "Reject this suborder" : "Cancel before preparation"}
          </Button>
          <p className="text-xs text-muted-foreground">
            This returns your shop's reserved units once. For prepaid orders it creates a refund
            request for admin handling; for COD it removes the amount due.
          </p>
        </div>
      )}
      {sub.status === "ready" && (
        <p className="text-sm text-muted-foreground">
          Ready for handoff. Verify the correct buyer using their account receipt code. Collect cash
          only for COD orders.
        </p>
      )}
      {((sub.fulfilment === "pickup" && sub.status === "ready") ||
        (sub.fulfilment === "seller_delivery" && sub.status === "out_for_delivery")) &&
        !sub.cashCollection && <SellerCashHandoff sub={sub} onSaved={() => onSaved("delivered")} />}
      {sub.cashCollection && (
        <p className="text-sm">
          Cash recorded: {inr(sub.cashCollection.amount)}. Buyer receipt code and seller report
          recorded; not gateway-verified or settled.
        </p>
      )}
      {sub.status === "cancelled" && (
        <p className="text-sm text-muted-foreground">
          Cancelled. No COD amount is due for this suborder.
        </p>
      )}
    </article>
  );
}
