import type { Category, ServiceArea, Shop, Product } from "./types";
export interface SellerAccount {
  id: string;
  name: string;
  phone: string;
  role: "seller";
  active: boolean;
}
export type ManagedCategory = Omit<Category, "subcategories"> & {
  id: string;
  version: number;
  active?: boolean;
  subcategories: {
    id: string;
    categoryId?: string;
    slug: string;
    name: string;
    active?: boolean;
  }[];
};
export type ManagedArea = ServiceArea & { version: number };
export type ShopStatus = "pending" | "approved" | "rejected" | "suspended";
export interface ShopReview {
  status: ShopStatus;
  reason?: string;
  reviewedAt: string;
  reviewedBy?: string;
}
export type OpeningHour = { day: number; opens: string; closes: string };
export type ManagedShop = Shop & {
  /** Present on admin shop responses; seller/public responses need not expose it. */
  ownerId?: string;
  review?: ShopReview;
  version: number;
  status: ShopStatus;
  active: boolean;
  categoryIds: string[];
  subcategoryIds: string[];
  serviceAreaIds: string[];
  timezone: string;
  openingHours: OpeningHour[];
  temporarilyClosed?: boolean;
};
export type ManagedProduct = Product & {
  moderation?: { blocked: boolean; reason: string };
  version: number;
  categoryId: string;
  subcategoryId?: string;
  active: boolean;
};
export type ShopInput = {
  location?: { type: "Point"; coordinates: [number, number] };
  address?: string;
  slug?: string;
  name: string;
  locality: string;
  tagline: string;
  description: string;
  categoryIds: string[];
  subcategoryIds: string[];
  serviceAreaIds: string[];
  fulfilment: Shop["fulfilment"];
  since: number;
  initials: string;
  timezone: string;
  openingHours: OpeningHour[];
  temporarilyClosed: boolean;
  hours: string;
  coverImage?: string;
  deliveryFee?: number;
  minimumOrderAmount?: number;
  pickupNote: string;
};
export interface SignupEmailProof {
  email: string;
  emailChallengeId?: string;
  emailOtp?: string;
  googleIdToken?: string;
}
export interface SellerSignupInput extends Partial<SignupEmailProof> {
  name: string;
  phone: string;
  password: string;
  shop: {
    name: string;
    address: string;
    categoryIds: string[];
    serviceAreaIds: string[];
    since: number;
    fulfilment: Shop["fulfilment"];
  };
}
export type ProductInput = {
  name: string;
  unit: string;
  description: string;
  categoryId: string;
  subcategoryId?: string | null;
  price: number;
  stock: number;
  mrp?: number | null;
  image?: string | null;
  active: boolean;
  attributes: { label: string; value: string }[];
};
export type VariantInput = {
  label: string;
  price: number;
  stock: number;
  attributes: { label: string; value: string }[];
};
