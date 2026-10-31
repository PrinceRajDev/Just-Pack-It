import { api } from "@/lib/api/client";
import type { AdminReport } from "@/domain/admin-reports";
export const adminReports = {
  get: (range: { from: string; to: string }) =>
    api<AdminReport>(`/admin/reports?${new URLSearchParams(range)}`),
};
