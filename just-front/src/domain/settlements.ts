export interface SettlementRow {
  sellerAccountId?: string;
  id: string;
  orderId: string;
  shopId: string;
  shopName: string;
  orderVersion: number;
  policy: string | null;
  proofValid: boolean;
  posted: boolean;
  grossAmount: number | null;
  sellerEntitlement: number | null;
  platformDeliveryFee: number | null;
  sellerRetained: number | null;
  payoutAmount: number | null;
  partnerCollection: number;
  holdReason: string | null;
  remittance: {
    state: "submitted" | "received";
    version: number;
    reference?: string;
    submittedAt: string;
    receivedAt?: string;
  } | null;
  payout: {
    state: "prepared" | "recorded";
    version: number;
    reference?: string;
    preparedAt: string;
    recordedAt?: string;
  } | null;
}
export interface SettlementJournal {
  id: string;
  kind: string;
  createdAt: string;
  entries: { account: string; deltaCents: number }[];
}
