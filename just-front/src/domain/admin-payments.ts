export type PaymentState = "creating" | "uncertain" | "ready" | "paid";
export type PaymentMode = "all" | "test" | "live";
export interface AdminPayment {
  recovery?: import("./recovery").RecoveryStatus;
  orderId: string;
  state: PaymentState;
  amount: number;
  currency: "INR";
  testMode: boolean;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  createdAt: string;
  paidAt: string | null;
  accountMatches: boolean;
  onlineEnabled: boolean;
}
export interface AdminPaymentDetail extends AdminPayment {
  audit: { id: string; action: string; outcome: string; code: string | null; at: string }[];
}
