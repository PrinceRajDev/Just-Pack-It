import type { FulfilmentMethod, Order } from "./types";
export interface CodOrderInput {
  areaId: string;
  addressId: string;
  addressVersion: number;
  paymentMethod: "cod";
  expectedTotal: number;
  items: { productId: string; variantId?: string; qty: number }[];
  fulfilments: { shopId: string; method: FulfilmentMethod }[];
}
export interface CodAttempt {
  key: string;
  input: CodOrderInput;
  state: "pending" | "confirmed" | "rejected";
  orderId?: string;
  errorCode?: string;
}
export type ConfirmedCodOrder = Order & {
  paymentMethod: "cod";
  paymentStatus: NonNullable<Order["paymentStatus"]>;
};
