import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("@/lib/config", () => ({ config: { apiUrl: "http://api.test" }, isDemoMode: false }));
import {
  createOnlineAttempt,
  hasOnlineAttempt,
  openOnlineCheckout,
} from "@/services/online-payments";
import { sessionStorageKey } from "@/lib/api/client";
import type { OnlineOrderInput, OnlineCheckout } from "@/domain/online-payments";
const input: OnlineOrderInput = {
  areaId: randomUUID(),
  addressId: randomUUID(),
  addressVersion: 0,
  paymentMethod: "razorpay",
  expectedTotal: 25,
  items: [{ productId: randomUUID(), qty: 2 }],
  fulfilments: [{ shopId: randomUUID(), method: "pickup" }],
};
const checkout: OnlineCheckout = {
  orderId: randomUUID(),
  keyId: "rzp_test_isolated",
  providerOrderId: "order_isolated",
  amount: 2500,
  currency: "INR",
  state: "ready",
  testMode: true,
  reconciliationRequired: false,
  enabled: true,
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    sessionStorageKey,
    JSON.stringify({ userId: "buyer", role: "buyer", isDemo: false, token: "isolated" }),
  );
  vi.stubGlobal("crypto", { randomUUID });
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: vi.fn(async (_key: string, _opts: unknown, callback: (lock: object) => unknown) =>
        callback({}),
      ),
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete window.Razorpay;
});
it("recovers a lost create response using exactly the same key and body", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("lost response"))
    .mockResolvedValueOnce(response(checkout));
  vi.stubGlobal("fetch", fetcher);
  await expect(createOnlineAttempt("buyer", input)).rejects.toThrow();
  expect(hasOnlineAttempt("buyer")).toBe(true);
  const recovered = await createOnlineAttempt("buyer", null);
  expect(recovered.checkout.orderId).toBe(checkout.orderId);
  expect(hasOnlineAttempt("buyer")).toBe(false);
  const a = fetcher.mock.calls[0][1],
    b = fetcher.mock.calls[1][1];
  expect(a.body).toBe(b.body);
  expect(a.headers["Idempotency-Key"]).toBe(b.headers["Idempotency-Key"]);
});
it("does not submit when session changes or an unresolved COD attempt exists", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(createOnlineAttempt("someone-else", input)).rejects.toThrow(/Sign in/);
  localStorage.setItem(
    "jpi.cod-attempt:http://api.test:buyer",
    JSON.stringify({ state: "pending" }),
  );
  await expect(createOnlineAttempt("buyer", input)).rejects.toThrow(/previous COD/);
  expect(fetcher).not.toHaveBeenCalled();
});
it("allows a fresh review after a definitive transaction rollback but retains uncertain errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(response({ code: "PRICE_CHANGED", message: "Price changed" }, 409))
      .mockResolvedValueOnce(response({ code: "INTERNAL_ERROR", message: "Uncertain" }, 500)),
  );
  await expect(createOnlineAttempt("buyer", input)).rejects.toThrow();
  expect(hasOnlineAttempt("buyer")).toBe(false);
  await expect(createOnlineAttempt("buyer", input)).rejects.toThrow();
  expect(hasOnlineAttempt("buyer")).toBe(true);
});
it("does not treat checkout dismissal or an authorized callback as paid", async () => {
  let options: Record<string, unknown> = {};
  window.Razorpay = class {
    constructor(value: Record<string, unknown>) {
      options = value;
    }
    open() {}
    on() {}
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ paymentStatus: "unpaid" })));
  const verified = vi.fn(),
    message = vi.fn(),
    closed = vi.fn();
  await openOnlineCheckout(checkout, verified, message, closed);
  (options.modal as { ondismiss: () => void }).ondismiss();
  expect(verified).not.toHaveBeenCalled();
  expect(message).toHaveBeenCalledWith(expect.stringContaining("not confirmed"));
  await (options.handler as (value: unknown) => Promise<void>)({
    razorpay_order_id: "order_isolated",
    razorpay_payment_id: "pay_isolated",
    razorpay_signature: "0".repeat(64),
  });
  expect(verified).not.toHaveBeenCalled();
  expect(message).toHaveBeenCalledWith(expect.stringContaining("awaiting capture"));
});
