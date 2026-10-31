import { api } from "@/lib/api/client";
import type { OperationsSummary } from "@/domain/operations";
export const operationsSummary = () => api<OperationsSummary>("/admin/operations");
