export type RefundState =
  "requested" | "submitting" | "uncertain" | "pending" | "processed" | "failed";
export interface RefundSummary {
  state: RefundState;
  amount: number;
  updatedAt: string;
}
export interface AdminRefund extends RefundSummary {
  recovery?: import("./recovery").RecoveryStatus;
  id: string;
  orderId: string;
  shopId: string;
  shopName: string;
  testMode: boolean;
  reason: string;
  providerRefundId: string | null;
  createdAt: string;
  canSubmit: boolean;
  canReconcile: boolean;
}
