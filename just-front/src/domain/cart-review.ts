import type { Product, Shop } from "./types";
export interface CartReviewIssue {
  code: string;
  message: string;
}
export interface CartReviewLine {
  productId: string;
  variantId?: string;
  qty: number;
  shopId?: string;
  product?: Product;
  unitPrice?: number;
  lineTotal?: number;
  availableStock?: number;
  issues: CartReviewIssue[];
}
export interface CartReview {
  checkedAt: string;
  areaId: string;
  currency: "INR";
  reserved: false;
  checkoutAvailable: false;
  lines: CartReviewLine[];
  shops: { shop: Shop; itemsSubtotal: number; issues: CartReviewIssue[] }[];
  itemsSubtotal: number;
  deliveryTotal: null;
  grandTotal: null;
}
