export interface SupportTicket {
  id: string;
  orderId: string;
  suborderId: string;
  shopName: string;
  kind: string;
  description: string;
  status: "open" | "in_progress" | "resolved";
  version: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}
