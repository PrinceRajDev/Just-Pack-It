import type { Order } from "@/domain/types";
export function needsOrderRefresh(order: Order | null | undefined) {
  return (
    !!order &&
    (order.subOrders.some(
      (sub) => !["delivered", "cancelled", "delivery_failed"].includes(sub.status),
    ) ||
      (order.paymentMethod === "razorpay" && order.paymentStatus !== "paid") ||
      order.subOrders.some(
        (sub) => sub.refund && !["processed", "failed"].includes(sub.refund.state),
      ))
  );
}
export const trackingInterval = (order: Order | null | undefined) =>
  needsOrderRefresh(order) ? 15000 : false;
