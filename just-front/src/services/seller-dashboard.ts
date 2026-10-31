import { api } from "@/lib/api/client";
import type { SellerDashboard } from "@/domain/seller-dashboard";
export const sellerDashboard = () => api<SellerDashboard>("/seller/dashboard");
