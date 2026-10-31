// Domain types shared by UI and services.
// These mirror the EXPECTED backend (Express + MongoDB) shapes. They are
// assumptions until the backend publishes its contract — see docs/API_CONTRACT.md.

export type Role = "buyer" | "seller" | "delivery" | "admin";

export type FulfilmentMethod = "seller_delivery" | "platform_delivery" | "pickup";

export interface ServiceArea {
  id: string;
  name: string;
  city: string;
  pincodes: string[];
  active: boolean;
}

export interface Category {
  slug: string;
  name: string;
  blurb: string;
  image: string;
  /** Platform-managed taxonomy. Subcategories are configuration, not route code. */
  subcategories?: { slug: string; name: string }[];
  iconLabel?: string;
}

export interface Shop {
  location?: { type: "Point"; coordinates: [number, number] };
  /** Explicit serviceability assignments; never inferred from locality text. */
  serviceAreaIds?: string[];
  id: string;
  slug: string;
  name: string;
  tagline: string;
  locality: string;
  address?: string;
  categories: string[];
  isOpen: boolean;
  temporarilyClosed?: boolean;
  availability?: "open" | "closed" | "temporarily_closed";
  scheduleLabel?: string;
  hours: string;
  fulfilment: FulfilmentMethod[];
  since: number;
  initials: string;
  description?: string;
  coverImage?: string;
  deliveryFee?: number;
  /** INR item subtotal required per shop, excluding delivery. Omitted means unknown. */
  minimumOrderAmount?: number;
  pickupNote?: string;
  offer?: Offer;
}

export interface Offer {
  validFrom?: string;
  conditions?: string;
  minimumSpend?: number;
  label: string; // e.g. "10% off"
  validUntil: string; // ISO date
}

export interface Product {
  id: string;
  name: string;
  unit: string;
  price: number; // INR, display only — server is the source of truth
  mrp?: number;
  image?: string;
  categorySlug: string;
  shopId: string;
  stock: number;
  offer?: Offer;
  description: string;
  tags?: ("fresh" | "bestseller" | "new" | "essential")[];
  /** Category-specific display data; fields are defined by the category, never inferred by the UI. */
  attributes?: { label: string; value: string }[];
  variants?: ProductVariant[];
}

export interface ProductVariant {
  id: string;
  label: string;
  price: number;
  stock: number;
  attributes?: { label: string; value: string }[];
}

/** A buyer cart line always identifies the shop-owned listing and, when chosen, its variant. */
export interface CartLine {
  /** Last explicitly accepted display price; never trusted by the order API. */
  acceptedPrice?: number;
  productId: string;
  variantId?: string;
  qty: number;
}

export interface Address {
  location?: { type: "Point"; coordinates: [number, number] } | null;
  id: string;
  label: string;
  line1: string;
  locality: string;
  city: string;
  pincode: string;
}

export type SubOrderStatus =
  | "placed"
  | "accepted"
  | "preparing"
  | "ready"
  | "picked_up"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "delivery_failed";

export interface OrderLine {
  productId: string;
  variantId?: string;
  variantLabel?: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
}

export interface SubOrder {
  deliveryState?:
    "claimed" | "picked_up" | "out_for_delivery" | "returning" | "returned" | "delivered";
  refund?: import("./refunds").RefundSummary;
  cashCollection?: { method: "cash"; amount: number; recordedAt: string; buyerConfirmedAt: string };
  version?: number;
  updatedAt?: string;
  cancelReason?: string;
  amountDue?: number;
  shopName?: string;
  shopAddress?: string;
  id: string;
  shopId: string;
  status: SubOrderStatus;
  fulfilment: FulfilmentMethod;
  lines: OrderLine[];
  deliveryFee: number;
  eta?: string; // only present when supplied by delivery data
}

export interface Order {
  testMode?: boolean;
  onlinePaidAmount?: number;
  cashRecordedAmount?: number;
  amountDue?: number;
  cancelledAmount?: number;
  address?: Omit<Address, "id">;
  paymentStatus?: "unpaid" | "partially_cash_recorded" | "cash_recorded" | "paid";
  id: string;
  createdAt: string;
  addressId: string;
  paymentMethod: PaymentMethod;
  subOrders: SubOrder[];
  total: number;
  isDemo?: boolean;
}

export type PaymentMethod = "cod" | "upi" | "card" | "razorpay";

export interface DeliveryTask {
  id: string;
  subOrderId: string;
  shopName: string;
  pickup: string;
  drop: string;
  customerName: string;
  items: number;
  payout: number;
  codAmount?: number;
  status: "available" | "assigned" | "picked_up" | "out_for_delivery" | "delivered" | "failed";
  distanceKm: number;
}

export interface Session {
  userId: string;
  name: string;
  role: Role;
  token: string;
  isDemo: boolean;
}
