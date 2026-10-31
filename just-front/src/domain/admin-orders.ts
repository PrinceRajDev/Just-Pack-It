export interface AdminOrder {
  testMode?: boolean;
  id: string;
  createdAt: string;
  paymentMethod: "cod" | "razorpay";
  paymentStatus: "unpaid" | "partially_cash_recorded" | "cash_recorded" | "paid";
  total: number;
  amountDue: number;
  cashRecordedAmount: number;
  cancelledAmount: number;
  subOrders: {
    id: string;
    shopId: string;
    shopName: string;
    status: string;
    fulfilment: "pickup" | "seller_delivery" | "platform_delivery";
    amountDue: number;
    cancelReason?: string;
    cashCollection?: {
      method: "cash";
      amount: number;
      recordedAt: string;
      buyerConfirmedAt: string;
    };
  }[];
}
