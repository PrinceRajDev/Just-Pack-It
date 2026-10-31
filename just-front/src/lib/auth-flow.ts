import type { Role } from "@/domain/types";
import { safeRedirect } from "@/services/auth";

export const accountLabels: Record<Role, string> = {
  buyer: "Buyer",
  seller: "Seller",
  delivery: "Delivery partner",
  admin: "Admin",
};
const homes: Record<Role, string> = {
  buyer: "/account",
  seller: "/seller",
  delivery: "/delivery",
  admin: "/admin",
};
/** A return URL never grants a role or sends a signed-in user into another role's workspace. */
export function authDestination(role: Role, redirect?: string) {
  const fallback = homes[role];
  const destination = safeRedirect(redirect, fallback);
  try {
    const url = new URL(destination, "https://justpackit.invalid");
    if (url.origin !== "https://justpackit.invalid") return fallback;
    let path = url.pathname;
    for (let i = 0; i < 2; i++) path = decodeURIComponent(path);
    if (path.startsWith("//") || path.includes("\\") || /[\r\n]/.test(path)) return fallback;
    const first = path.split("/")[1]?.toLowerCase();
    if (["login", "signup"].includes(first)) return fallback;
    const required: Record<string, Role> = {
      admin: "admin",
      seller: "seller",
      delivery: "delivery",
      account: "buyer",
      orders: "buyer",
      checkout: "buyer",
    };
    return required[first] && required[first] !== role ? fallback : destination;
  } catch {
    return fallback;
  }
}
