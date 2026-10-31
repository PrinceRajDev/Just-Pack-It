import type { CodOrderInput } from "./cod";
export type OnlineOrderInput = Omit<CodOrderInput, "paymentMethod"> & { paymentMethod: "razorpay" };
export interface OnlineCheckout {
  orderId: string;
  keyId: string;
  providerOrderId: string | null;
  amount: number;
  currency: "INR";
  state: "creating" | "uncertain" | "ready" | "paid";
  testMode: boolean;
  reconciliationRequired: boolean;
  enabled: boolean;
}
