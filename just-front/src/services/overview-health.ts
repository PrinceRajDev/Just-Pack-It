import { api } from "@/lib/api/client";
export const overviewHealth = {
  api: () => api<{ status: string }>("/health", { signal: AbortSignal.timeout(10000) }),
  database: () => api<{ status: string }>("/health/ready", { signal: AbortSignal.timeout(10000) }),
};
