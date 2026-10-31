import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/config", () => ({
  config: { apiUrl: "http://api.test", imageBaseUrl: "" },
  isDemoMode: false,
}));
import { api, apiAll, sessionStorageKey } from "@/lib/api/client";
import { catalog, productById, shopById } from "@/services/catalog";
import { safeRedirect, authentication } from "@/services/auth";
import { reviewCart } from "@/services/cart-review";
import { sellerOrders } from "@/services/seller-orders";
import type { SellerSuborder } from "@/domain/seller-orders";
import { receipts } from "@/services/receipts";
const response = (data: unknown, headers: Record<string, string> = {}, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe("Phase 1 API adapter", () => {
  it("requests only server-issued receipt codes and confirms a scoped cash amount without status overrides", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          code: "123456",
          issuedAt: "2026-10-30T00:00:00Z",
          expiresAt: "2026-10-30T00:05:00Z",
          amount: 25,
        }),
      )
      .mockResolvedValueOnce(response({ status: "delivered" }));
    vi.stubGlobal("fetch", fetcher);
    await receipts.issue("order", "sub", 3);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      version: 3,
      confirmReceived: true,
      confirmCashPaid: true,
    });
    await receipts.complete(
      { orderId: "order", id: "sub", version: 3, amountDue: 25 } as SellerSuborder,
      "123456",
    );
    expect(fetcher.mock.calls[1][0]).toBe(
      "http://api.test/seller/orders/order/suborders/sub/complete-cash",
    );
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      version: 3,
      code: "123456",
      confirmCashReceived: true,
      amountReceived: 25,
    });
  });
  it("sends only the seller suborder version/status/reason to the scoped mutation endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ status: "cancelled", version: 3 }));
    vi.stubGlobal("fetch", fetcher);
    await sellerOrders.transition(
      { orderId: "order", id: "sub", version: 2 } as SellerSuborder,
      "cancelled",
      "  Stock damaged  ",
    );
    expect(fetcher.mock.calls[0][0]).toBe("http://api.test/seller/orders/order/suborders/sub");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      version: 2,
      status: "cancelled",
      reason: "Stock damaged",
    });
  });
  it("strips accepted prices and ownership from server cart review requests", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ lines: [], shops: [] }));
    vi.stubGlobal("fetch", fetcher);
    await reviewCart("area", [{ productId: "p", variantId: "v", qty: 2, acceptedPrice: 1 }]);
    expect(fetcher.mock.calls[0][0]).toBe("http://api.test/cart/quote");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      areaId: "area",
      items: [{ productId: "p", variantId: "v", qty: 2 }],
    });
  });
  it("uses the seller onboarding endpoint with shop data and no privileged role fields", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response({ userId: "seller", role: "seller", token: "opaque", isDemo: false }),
      );
    vi.stubGlobal("fetch", fetcher);
    const input = {
      name: "Test owner",
      phone: "+919876543210",
      password: "Test-only-password",
      shop: {
        name: "Test shop",
        address: "Test address",
        categoryIds: ["category"],
        serviceAreaIds: ["area"],
        since: 2020,
        fulfilment: ["pickup" as const],
      },
    };
    await authentication.registerSeller(input);
    expect(fetcher.mock.calls[0][0]).toBe("http://api.test/auth/register/seller");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(input);
  });
  it("follows array pagination without losing filters or cursor scope", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response([{ id: "first" }], { "X-Next-Cursor": "signed-cursor", "X-Has-More": "true" }),
      )
      .mockResolvedValueOnce(response([{ id: "second" }], { "X-Has-More": "false" }));
    vi.stubGlobal("fetch", fetcher);
    expect(await apiAll("/products?area=area-id&sort=price_asc")).toEqual([
      { id: "first" },
      { id: "second" },
    ]);
    expect(fetcher.mock.calls[1][0]).toContain("area=area-id");
    expect(fetcher.mock.calls[1][0]).toContain("sort=price_asc");
    expect(fetcher.mock.calls[1][0]).toContain("cursor=signed-cursor");
    expect(fetcher.mock.calls[1][0]).toContain("limit=100");
  });
  it("fails rather than returning partial lists or looping repeated cursors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([], { "X-Has-More": "true" })));
    await expect(apiAll("/shops")).rejects.toMatchObject({ code: "PAGINATION_HEADERS_MISSING" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() => Promise.resolve(response([], { "X-Next-Cursor": "repeat" }))),
    );
    await expect(apiAll("/shops")).rejects.toMatchObject({ code: "INVALID_CURSOR_CHAIN" });
  });
  it("keeps demo tokens out of live requests and emits expiry on 401", async () => {
    localStorage.setItem(sessionStorageKey, JSON.stringify({ token: "demo", isDemo: true }));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response({ message: "Expired", code: "INVALID_SESSION" }, {}, 401));
    vi.stubGlobal("fetch", fetcher);
    await api("/health");
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
    const expired = vi.fn();
    window.addEventListener("jpi:session-expired", expired);
    await expect(api("/auth/me")).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledOnce();
    window.removeEventListener("jpi:session-expired", expired);
  });
  it("returns null for missing records and never falls back to demo lookups", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ message: "Not found" }, {}, 404)));
    expect(await catalog.product("missing")).toBeNull();
    expect(await catalog.shop("missing")).toBeNull();
    expect(shopById("s1")).toBeUndefined();
    expect(productById("p1")).toBeUndefined();
  });
  it("loads real shop metadata for direct product links", async () => {
    const product = { id: "real-product", shopId: "real-shop", name: "Real listing" };
    const shop = { id: "real-shop", slug: "real-shop", name: "Real shop" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response(product))
        .mockResolvedValueOnce(response([shop])),
    );
    expect(await catalog.product("real-product")).toEqual(product);
    expect(shopById("real-shop")).toEqual(shop);
    expect(productById("real-product")).toEqual(product);
  });
  it("uses password auth endpoints without client-supplied role", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(response({ userId: "u", role: "buyer", token: "opaque", isDemo: false }));
    vi.stubGlobal("fetch", fetcher);
    await authentication.register("Buyer", "+919999999999", "test-password-only");
    expect(fetcher.mock.calls[0][0]).toBe("http://api.test/auth/register");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      name: "Buyer",
      phone: "+919999999999",
      password: "test-password-only",
    });
  });
  it("rejects external and protocol-relative login redirects", () => {
    expect(safeRedirect("https://other.example", "/account")).toBe("/account");
    expect(safeRedirect("//other.example", "/account")).toBe("/account");
    expect(safeRedirect("/\\other.example", "/account")).toBe("/account");
    expect(safeRedirect("/category/grocery-kirana", "/account")).toBe("/category/grocery-kirana");
  });
});
