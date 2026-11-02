import { api } from "@/lib/api/client";
import type {
  LiveDeliveryTask,
  PartnerProfile,
  AdminPartner,
  DeliveryException,
  DeliveryResolution,
} from "@/domain/live-delivery";
const post = <T>(path: string, body: unknown, method = "POST") =>
  api<T>(path, { method, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
export const delivery = {
  exceptions: (taskId?: string, cursor?: string) =>
    api<{ items: DeliveryException[]; next?: string }>(
      `/admin/delivery/exceptions?${new URLSearchParams({ ...(taskId ? { taskId } : {}), ...(cursor ? { cursor } : {}) })}`,
    ),
  resolve: (id: string, input: DeliveryResolution) =>
    post(`/admin/delivery/tasks/${encodeURIComponent(id)}/resolve`, input),
  returned: (
    orderId: string,
    id: string,
    input: {
      version: number;
      partnerId: string;
      confirmGoodsReceived: true;
      restock: boolean;
      reason: string;
    },
  ) =>
    post(
      `/seller/orders/${encodeURIComponent(orderId)}/suborders/${encodeURIComponent(id)}/returned`,
      input,
    ),
  profile: () => api<PartnerProfile | null>("/delivery/profile"),
  availability: (online: boolean) => post("/delivery/availability", { online }, "PUT"),
  active: () => api<LiveDeliveryTask | null>("/delivery/active"),
  available: (cursor?: string) =>
    api<{ items: LiveDeliveryTask[]; next: string | null }>(
      `/delivery/available?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  claim: (task: LiveDeliveryTask) =>
    post<LiveDeliveryTask>(`/delivery/tasks/${encodeURIComponent(task.id)}/claim`, {
      version: task.version,
    }),
  dispatch: (task: LiveDeliveryTask) =>
    post<LiveDeliveryTask>(`/delivery/tasks/${encodeURIComponent(task.id)}/dispatch`, {
      version: task.version,
    }),
  contact: (id: string) =>
    api<{ buyer: string | null; shop: string | null }>(
      `/delivery/tasks/${encodeURIComponent(id)}/contact`,
    ),
  complete: (task: LiveDeliveryTask, code: string) =>
    post(`/delivery/tasks/${encodeURIComponent(task.id)}/complete`, {
      version: task.version,
      code,
      ...(task.paymentMethod === "cod"
        ? { confirmCashReceived: true, amountReceived: task.amountToCollect }
        : { confirmHandoff: true }),
    }),
  issues: () =>
    api<
      {
        id: string;
        orderId: string;
        shopName: string;
        partnerId: string;
        reason: string;
        at: string;
      }[]
    >("/admin/delivery/issues"),
  report: (task: LiveDeliveryTask, reason: string) =>
    post(`/delivery/tasks/${encodeURIComponent(task.id)}/issue`, { version: task.version, reason }),
  partners: () =>
    api<AdminPartner[]>("/admin/delivery/partners", { signal: AbortSignal.timeout(30000) }),
  savePartner: (partner: AdminPartner, approved: boolean, areaIds: string[]) =>
    post<{ version: number }>(
      `/admin/delivery/partners/${encodeURIComponent(partner.id)}`,
      { version: partner.version, approved, areaIds },
      "PUT",
    ),
  pickup: (orderId: string, id: string, version: number, partnerId: string) =>
    post(
      `/seller/orders/${encodeURIComponent(orderId)}/suborders/${encodeURIComponent(id)}/pickup`,
      { version, partnerId, confirmHandoff: true },
    ),
};
