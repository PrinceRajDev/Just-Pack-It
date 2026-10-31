import { api, apiResponse, ApiError } from "@/lib/api/client";
import type { MarketplaceNotification } from "@/domain/notifications";

export const notifications = {
  count: () => api<{ count: number }>("/notifications/unread-count"),
  async list(cursor?: string) {
    const query = new URLSearchParams({ limit: "20" });
    if (cursor) query.set("cursor", cursor);
    const { data, headers } = await apiResponse<MarketplaceNotification[]>(
      `/notifications?${query}`,
    );
    const next = headers.get("X-Next-Cursor") ?? undefined;
    if (headers.get("X-Has-More") === "true" && !next)
      throw new ApiError("Notification pagination headers missing", 502);
    return { items: data, next };
  },
  read: (id: string) =>
    api<void>(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST", body: "{}" }),
};
