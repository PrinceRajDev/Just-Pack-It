import type { SellerSuborder, SellerOrderStatus } from "./seller-orders";
export interface SellerDashboard {
  checkedAt: string;
  date: string;
  timezone: string;
  todayOrders: number;
  pendingPayment: number;
  counts: Partial<Record<SellerOrderStatus, number>>;
  urgent: SellerSuborder[];
  lowStock: {
    threshold: number;
    count: number;
    outOfStock: number;
    items: { productId: string; name: string; variantId?: string; label?: string; stock: number }[];
  };
}
