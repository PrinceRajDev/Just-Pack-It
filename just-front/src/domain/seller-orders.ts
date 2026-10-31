import type { Address, Order, SubOrder, OrderLine, FulfilmentMethod } from "./types";
export type SellerOrderStatus =
  "placed" | "accepted" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled";
export interface SellerSuborder {
  delivery?: {
    partnerId: string;
    state: "claimed" | "picked_up" | "out_for_delivery" | "returning" | "returned" | "delivered";
  };
  refund?: SubOrder["refund"];
  testMode?: boolean;
  orderId: string;
  id: string;
  createdAt: string;
  shopId: string;
  shopName: string;
  status: SellerOrderStatus;
  version: number;
  updatedAt?: string;
  cancelReason?: string;
  fulfilment: FulfilmentMethod;
  lines: OrderLine[];
  itemsSubtotal: number;
  deliveryFee: number;
  total: number;
  amountDue: number;
  paymentMethod: "cod" | "razorpay";
  paymentStatus: NonNullable<Order["paymentStatus"]>;
  cashCollection?: SubOrder["cashCollection"];
  deliveryAddress?: Omit<Address, "id">;
}
