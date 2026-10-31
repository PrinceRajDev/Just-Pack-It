export interface ReportAmount {
  count: number;
  amountCents: number;
}
export interface AdminReport {
  checkedAt: string;
  from: string;
  to: string;
  timezone: string;
  currency: "INR";
  amountUnit: "paise";
  orders: ReportAmount;
  captures: ReportAmount;
  cash: ReportAmount;
  daily: (ReportAmount & { date: string })[];
  statuses: { status: string; count: number }[];
  shops: {
    shopId: string;
    shopName: string;
    count: number;
    cancelled: number;
    amountCents: number;
  }[];
  refunds: (ReportAmount & { state: string })[];
}
