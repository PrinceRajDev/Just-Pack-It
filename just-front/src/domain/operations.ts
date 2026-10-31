export interface OperationsSummary {
  asOf: string;
  thresholds: {
    orderStaleMinutes: number;
    paymentPendingMinutes: number;
    refundPendingHours: number;
  };
  support?: {
    count: number;
    items: {
      id: string;
      orderId: string;
      shopName: string;
      status: "open" | "in_progress";
      createdAt: string;
    }[];
  };
  pendingShops: { count: number; items: { id: string; name: string }[] };
  staleSuborders: {
    count: number;
    items: {
      orderId: string;
      suborderId: string;
      shopName: string;
      status: string;
      lastUpdate: string;
    }[];
  };
  payments: { count: number; items: { orderId: string; state: string; createdAt: string }[] };
  refunds: {
    count: number;
    items: {
      id: string;
      orderId: string;
      shopName: string;
      state: string;
      testMode: boolean;
      updatedAt: string;
    }[];
  };
}
