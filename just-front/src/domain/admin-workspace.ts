export interface ModerationProduct {
  id: string;
  name: string;
  shopId: string;
  shopName: string;
  active: boolean;
  version: number;
  price: number;
  variantCount: number;
  moderation: { blocked: boolean; reason: string; updatedAt: string } | null;
}
export interface AuditEntry {
  id: string;
  actorId: string;
  role: string;
  action: string;
  targetId: string;
  version?: number;
  createdAt: string;
}
export interface ReconciliationLine {
  id: string;
  orderId: string;
  shopId: string;
  shopName: string;
  status: string;
  method: string;
  originalAmount: number;
  cancelledAmount: number;
  onlineCapturedAllocation: number;
  cashRecorded: number;
  cashCollector: string | null;
  refund: { state: string; amount: number } | null;
  settlementStatus: string;
}
