export type AccountRole = "buyer" | "seller" | "delivery" | "admin";
export interface AdminUser {
  id: string;
  name: string;
  phone: string;
  role: AccountRole;
  active: boolean;
  version: number;
  emailVerified: boolean;
  createdAt: string | null;
}
export interface UserFilters {
  q?: string;
  role: AccountRole | "all";
  state: "all" | "active" | "blocked";
}
