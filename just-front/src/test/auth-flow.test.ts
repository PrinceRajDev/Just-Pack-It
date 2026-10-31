import { expect, it } from "vitest";
import { authDestination } from "@/lib/auth-flow";
it.each([
  ["buyer", "/admin/users", "/account"],
  ["seller", "/account", "/seller"],
  ["delivery", "/seller/orders", "/delivery"],
  ["admin", "/checkout", "/admin"],
  ["admin", "/admin/users?q=hello#list", "/admin/users?q=hello#list"],
  ["buyer", "/checkout?step=delivery", "/checkout?step=delivery"],
  ["seller", "/seller/products", "/seller/products"],
  ["delivery", "/delivery", "/delivery"],
  ["buyer", "https://evil.invalid", "/account"],
  ["buyer", "//evil.invalid", "/account"],
  ["buyer", "/%2f%2fevil.invalid", "/account"],
  ["buyer", "/admin%252fusers", "/account"],
  ["buyer", "/login?redirect=/admin", "/account"],
  ["buyer", "/%zz", "/account"],
  ["buyer", "/category/fast-food-snacks", "/category/fast-food-snacks"],
] as const)("routes %s from %s safely", (role, redirect, expected) =>
  expect(authDestination(role, redirect)).toBe(expected),
);
