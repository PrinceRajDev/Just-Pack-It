import { api } from "@/lib/api/client";
export interface RiderEarning {
  id: string;
  shopName: string;
  partnerId?: string;
  amount: number;
  holdReason: string | null;
  payout: { state: "prepared" | "recorded"; version: number; reference?: string } | null;
}
export const riderEarnings = {
  list: (cursor?: string) =>
    api<{ items: RiderEarning[]; next?: string }>(
      `/rider-earnings${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  prepare: (id: string) =>
    api(`/rider-earnings/${id}/prepare`, {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }),
  record: (row: RiderEarning, reference: string) =>
    api(`/rider-earnings/${row.id}/record`, {
      method: "POST",
      body: JSON.stringify({ confirm: true, version: row.payout?.version, reference }),
    }),
};
