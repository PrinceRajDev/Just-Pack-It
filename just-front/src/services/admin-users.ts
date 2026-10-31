import { api } from "@/lib/api/client";
import type { AdminUser, UserFilters } from "@/domain/admin-users";
export const adminUsers = {
  list: (filters: UserFilters, cursor?: string) =>
    api<{ items: AdminUser[]; next?: string; total: number }>(
      `/admin/users?${new URLSearchParams({ role: filters.role, state: filters.state, ...(filters.q ? { q: filters.q } : {}), ...(cursor ? { cursor } : {}) })}`,
    ),
  access: (user: AdminUser, active: boolean, reason: string) =>
    api<AdminUser>(`/admin/users/${encodeURIComponent(user.id)}/access`, {
      method: "PATCH",
      body: JSON.stringify({ version: user.version, active, reason }),
    }),
};
