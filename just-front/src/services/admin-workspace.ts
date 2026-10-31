import { api } from "@/lib/api/client";
import type { ModerationProduct, AuditEntry, ReconciliationLine } from "@/domain/admin-workspace";
const params = (query: Record<string, string | undefined>) =>
  new URLSearchParams(
    Object.entries(query).filter((entry): entry is [string, string] => !!entry[1]),
  );
export const adminWorkspace = {
  products: (query: { q?: string; shopId?: string; state?: string }, cursor?: string) =>
    api<{ items: ModerationProduct[]; next?: string }>(
      `/admin/products?${params({ ...query, cursor })}`,
    ),
  moderate: (product: ModerationProduct, blocked: boolean, reason: string) =>
    api(`/admin/products/${product.id}/moderation`, {
      method: "PATCH",
      body: JSON.stringify({ version: product.version, blocked, reason }),
    }),
  reactivate: (id: string, version: number, subId?: string) =>
    api(`/admin/categories/${id}/reactivate`, {
      method: "POST",
      body: JSON.stringify({ version, subId }),
    }),
  audit: (query: { action?: string; actorId?: string; targetId?: string }, cursor?: string) =>
    api<{ items: AuditEntry[]; next?: string }>(`/admin/audit?${params({ ...query, cursor })}`),
  reconciliation: (shopId?: string, cursor?: string) =>
    api<{ checkedAt: string; items: ReconciliationLine[]; next?: string }>(
      `/admin/reconciliation?${params({ shopId, cursor })}`,
    ),
};
