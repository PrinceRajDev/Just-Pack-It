import type { Order } from "@/domain/types";
export function cashLabel(status: Order["paymentStatus"]) {
  if (status === "paid") return "Online payment captured";
  return status === "unpaid"
    ? "Unpaid"
    : status === "cash_recorded"
      ? "Cash recorded"
      : status === "partially_cash_recorded"
        ? "Cash partly recorded"
        : "Payment status not supplied";
}
