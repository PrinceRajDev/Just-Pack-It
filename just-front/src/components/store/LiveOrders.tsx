import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { BuyAgain } from "./BuyAgain";
import { OrderReceipt } from "./OrderReceipt";
import { DeliveryPinLink } from "./DeliveryPinLink";
import { trackingInterval, needsOrderRefresh } from "@/lib/order-tracking";
import { ShopOrderTimeline } from "./ShopOrderTimeline";
import { OrderSupport } from "./OrderSupport";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAuth } from "@/stores/auth";
import { orders } from "@/services/orders";
import { StoreLayout, PageTitle } from "./StoreLayout";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/image";
import { fulfilmentLabel } from "./ShopMark";
import { BuyerReceiptCode } from "./BuyerReceiptCode";
import { cashLabel } from "@/lib/cash-label";
import { OnlinePaymentPanel } from "./OnlinePaymentPanel";
import { RefundNotice } from "./RefundNotice";
import { BuyerCancellation } from "./BuyerCancellation";
function BuyerOrders({ children }: { children: (userId: string) => ReactNode }) {
  const { session, ready } = useAuth();
  if (!ready) return <p role="status">Checking your session…</p>;
  if (!session)
    return (
      <Button asChild>
        <Link to="/login">Sign in to view your orders</Link>
      </Button>
    );
  if (session.role !== "buyer") return <p>Order history is available to buyer accounts.</p>;
  return <>{children(session.userId)}</>;
}
export function LiveOrdersPage() {
  return (
    <StoreLayout>
      <UiAttributes>
        <PageTitle title="Your orders" eyebrow="Your account" />
      </UiAttributes>
      <section className="mx-auto max-w-5xl space-y-4 px-4 pb-12">
        <BuyerOrders>{(userId) => <History userId={userId} />}</BuyerOrders>
      </section>
    </StoreLayout>
  );
}
function History({ userId }: { userId: string }) {
  const query = useQuery({
    queryKey: ["orders", userId],
    queryFn: () => orders.list(),
    retry: false,
  });
  if (query.isPending)
    return (
      <p role="status">
        <UiText>{"Loading orders…"}</UiText>
      </p>
    );
  if (query.isError)
    return (
      <div role="alert">
        <p>Couldn't load your orders.</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry orders
        </Button>
      </div>
    );
  if (!query.data.length) return <p>No orders yet. Your confirmed orders will appear here.</p>;
  return (
    <ul className="space-y-3">
      {query.data.map((order) => (
        <li key={order.id} className="rounded-xl border border-border bg-card p-4">
          {order.testMode && (
            <p className="font-semibold">Test order: no real payment. Do not fulfil.</p>
          )}
          <Link to="/orders/$id" params={{ id: order.id }} className="font-medium underline">
            <UiText>{"Order "}</UiText>
            {order.id.slice(0, 8)}
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            {new Date(order.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
            <UiText>{"· India time"}</UiText>
          </p>
          <p className="text-sm">
            {order.subOrders.map((sub) => sub.shopName ?? "Shop").join(", ")}
          </p>
          <p className="font-semibold">
            {inr(order.amountDue ?? order.total)} · {order.paymentMethod.toUpperCase()} ·{" "}
            {cashLabel(order.paymentStatus)}
          </p>
        </li>
      ))}
    </ul>
  );
}
export function LiveOrderPage({ id }: { id: string }) {
  return (
    <StoreLayout>
      <UiAttributes>
        <PageTitle title="Order details" eyebrow="Shop by shop" />
      </UiAttributes>
      <section className="mx-auto max-w-5xl space-y-4 px-4 pb-12">
        <BuyerOrders>
          {(userId) => <Detail key={`${userId}:${id}`} userId={userId} id={id} />}
        </BuyerOrders>
      </section>
    </StoreLayout>
  );
}
function Detail({ userId, id }: { userId: string; id: string }) {
  const query = useQuery({
    queryKey: ["order", userId, id],
    queryFn: () => orders.get(id),
    refetchInterval: (query) => trackingInterval(query.state.data),
    refetchIntervalInBackground: false,
    retry: false,
  });
  if (query.isPending) return <p role="status">Loading order…</p>;
  if (query.isError && !query.data)
    return (
      <div role="alert">
        <p>Couldn't load this order.</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry order
        </Button>
      </div>
    );
  const order = query.data;
  if (!order) return <p>Order not found for this account.</p>;
  return (
    <>
      <p className="break-all font-mono text-sm">
        <UiText>{"Order "}</UiText>
        {order.id}
      </p>
      <OrderReceipt order={order} />
      <BuyAgain order={order} />
      <UiAttributes>
        <div
          className="space-y-2 rounded-xl border border-border bg-card p-4"
          aria-label="Order update status"
        >
          <p className="text-sm">
            <UiText>
              {query.isFetching
                ? "Checking for updates…"
                : `Last checked: ${new Date(query.dataUpdatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · India time`}
            </UiText>
          </p>
          <p className="text-sm text-muted-foreground">
            <UiText>
              {needsOrderRefresh(order)
                ? "Checks every 15 seconds while this page is active. Each shop progresses separately."
                : "Fulfilment is complete or stopped. You can refresh manually for later updates."}
            </UiText>
          </p>
          {query.isError && (
            <p role="alert" className="text-sm text-destructive">
              Could not refresh. Showing the last successfully loaded order; its status may be
              outdated. Retry with Refresh order status.
            </p>
          )}
        </div>
      </UiAttributes>
      {order.testMode && (
        <p role="status" className="font-semibold">
          Test order: no real payment or purchase. Do not fulfil.
        </p>
      )}
      <p className="font-semibold">
        <UiText>{order.paymentMethod === "razorpay" ? "Razorpay" : "COD"}</UiText> ·{" "}
        {cashLabel(order.paymentStatus)} · Total {inr(order.total)}
      </p>
      {order.amountDue !== undefined && (
        <p className="font-semibold">
          Current <UiText>{order.paymentMethod === "razorpay" ? "online" : "COD"}</UiText> amount
          due: {inr(order.amountDue)}
        </p>
      )}
      {!!order.cancelledAmount && (
        <p className="text-sm">
          Cancelled portion: {inr(order.cancelledAmount)}. The original order total is retained
          above.
        </p>
      )}
      {!!order.cashRecordedAmount && (
        <p className="text-sm">
          <UiText>{"Cash recorded: "}</UiText>
          {inr(order.cashRecordedAmount)}. This is a receipt/cash report, not gateway verification
          or settlement.
        </p>
      )}
      <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
        Refresh order status
      </Button>
      {order.paymentMethod === "razorpay" && <OnlinePaymentPanel id={order.id} />}
      <p className="text-sm text-muted-foreground">
        Each shop confirms and updates its part separately. Review the latest delivery status below;
        no arrival estimate is promised.
      </p>
      {order.address && (
        <div className="rounded-xl border border-border p-4">
          <h2 className="font-semibold">Saved order address</h2>
          <DeliveryPinLink location={order.address.location} />
          <p className="text-sm">
            <UiText>{order.address.label}</UiText>: {order.address.line1}, {order.address.locality},{" "}
            {order.address.city} {order.address.pincode}
          </p>
        </div>
      )}
      {order.subOrders.map((sub) => (
        <section key={sub.id} className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-2xl">{sub.shopName ?? "Shop"}</h2>
          <p className="text-sm">
            Status:{" "}
            <UiText>
              {sub.deliveryState === "returning"
                ? "returning to shop"
                : sub.status.replaceAll("_", " ")}
            </UiText>{" "}
            · {fulfilmentLabel[sub.fulfilment]}
          </p>
          <UiAttributes>
            <ShopOrderTimeline
              sub={sub}
              paymentPending={
                order.paymentMethod === "razorpay" &&
                order.paymentStatus !== "paid" &&
                sub.status === "placed"
              }
            />
          </UiAttributes>
          {sub.shopAddress && <p className="text-sm text-muted-foreground">{sub.shopAddress}</p>}
          {sub.deliveryState === "returning" && (
            <p role="status">
              This delivery is being returned to the shop. Cancellation and any prepaid refund will
              appear after the shop confirms receiving the goods. Do not generate a delivery receipt
              code for a return.
            </p>
          )}
          {sub.cancelReason && (
            <p className="text-sm">
              <UiText>{"Cancellation reason: "}</UiText>
              {sub.cancelReason}
            </p>
          )}
          {sub.refund && <RefundNotice refund={sub.refund} />}
          <UiAttributes>
            <BuyerCancellation order={order} sub={sub} />
          </UiAttributes>
          <OrderSupport orderId={order.id} suborderId={sub.id} />
          <ul className="divide-y divide-border">
            {sub.lines.map((line, index) => (
              <li
                key={`${line.productId}:${line.variantId ?? index}`}
                className="flex justify-between gap-3 py-2 text-sm"
              >
                <span>
                  {line.name}
                  <UiText>{line.variantLabel ? ` · ${line.variantLabel}` : ""}</UiText> ·{" "}
                  {line.unit} × {line.qty}
                </span>
                <span>{inr(line.price * line.qty)}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm">Delivery charge: {inr(sub.deliveryFee)}</p>
          <p className="font-medium">
            Shop total:{" "}
            {inr(sub.deliveryFee + sub.lines.reduce((sum, line) => sum + line.price * line.qty, 0))}
          </p>
          {sub.amountDue !== undefined && (
            <p className="text-sm">
              Current <UiText>{order.paymentMethod === "razorpay" ? "online" : "COD"}</UiText> due
              for this shop: {inr(sub.amountDue)}
            </p>
          )}
          {sub.cashCollection && (
            <p className="text-sm">
              <UiText>{"Cash recorded: "}</UiText>
              {inr(sub.cashCollection.amount)} · Buyer receipt and seller cash confirmation saved.
            </p>
          )}
          {((sub.fulfilment === "pickup" && sub.status === "ready") ||
            ((sub.fulfilment === "seller_delivery" || sub.fulfilment === "platform_delivery") &&
              sub.status === "out_for_delivery")) &&
            sub.amountDue !== undefined &&
            !sub.cashCollection &&
            sub.deliveryState !== "returning" &&
            (order.paymentMethod !== "razorpay" || order.paymentStatus === "paid") && (
              <BuyerReceiptCode
                key={`${userId}:${sub.id}:${sub.version}`}
                orderId={order.id}
                subId={sub.id}
                version={sub.version ?? 0}
                amount={sub.amountDue}
                prepaid={order.paymentMethod === "razorpay"}
              />
            )}
        </section>
      ))}
      <Button asChild variant="outline">
        <Link to="/orders">All your orders</Link>
      </Button>
    </>
  );
}
