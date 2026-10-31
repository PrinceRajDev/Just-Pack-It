import type { Address, OrderLine } from "./types";
export interface LiveDeliveryTask {
  issue?: { reason: string; at: string };
  id: string;
  orderId: string;
  version: number;
  shopName: string;
  status:
    | "available"
    | "claimed"
    | "picked_up"
    | "out_for_delivery"
    | "returning"
    | "returned"
    | "delivered";
  itemCount: number;
  paymentMethod: "cod" | "razorpay";
  amountToCollect: number;
  pickup?: string | null;
  drop?: Omit<Address, "id">;
  lines?: OrderLine[];
  cashRecorded?: number | null;
}
export interface PartnerProfile {
  approved: boolean;
  areaIds: string[];
  online: boolean;
  version: number;
}
export interface AdminPartner {
  id: string;
  name: string;
  active: boolean;
  approved: boolean;
  areaIds: string[];
  version: number;
  activeTask: boolean;
}

export interface DeliveryException {
  id: string;
  orderId: string;
  shopName: string;
  version: number;
  status: string;
  deliveryState: string;
  partnerId: string | null;
  claimedAt?: string;
  reason: string | null;
  financialReviewRequired: boolean;
  history: { action: string; reason: string; at: string; restock?: boolean }[];
}
export type DeliveryResolution =
  | { version: number; reason: string; action: "release"; confirmGoodsAtShop: true }
  | {
      version: number;
      reason: string;
      action: "cancel_before_pickup";
      confirmGoodsAtShop: true;
      restock: boolean;
    }
  | { version: number; reason: string; action: "request_return" | "resume" };
