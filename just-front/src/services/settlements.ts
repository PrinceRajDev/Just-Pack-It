import { api } from "@/lib/api/client";
import type { SettlementRow, SettlementJournal } from "@/domain/settlements";
const post = (path: string, body: unknown) =>
  api(path, { method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
export const settlements = {
  list: (query: { shopId?: string; suborderId?: string } = {}, cursor?: string) =>
    api<{ items: SettlementRow[]; next?: string }>(
      `/settlements?${new URLSearchParams({ ...query, ...(cursor ? { cursor } : {}) })}`,
    ),
  post: (row: SettlementRow) => post(`/settlements/${row.id}/post`, { version: row.orderVersion }),
  submitCash: (row: SettlementRow) =>
    post(`/settlements/${row.id}/remittance`, { confirmHandedOver: true }),
  receiveCash: (row: SettlementRow, reference: string) =>
    post(`/settlements/${row.id}/remittance/receive`, {
      version: row.remittance!.version,
      confirmReceived: true,
      reference,
    }),
  prepare: (row: SettlementRow) =>
    post(`/settlements/${row.id}/payout/prepare`, { confirmSellerVerified: true }),
  record: (row: SettlementRow, reference: string) =>
    post(`/settlements/${row.id}/payout/record`, {
      version: row.payout!.version,
      confirmTransferred: true,
      reference,
    }),
  journals: (id: string) => api<SettlementJournal[]>(`/settlements/${id}/journals`),
};
