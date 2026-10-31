import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("@/lib/config", () => ({
  config: { apiUrl: "http://api.test", imageBaseUrl: "" },
  isDemoMode: false,
}));
import { readCodAttempt, submitCodAttempt, resetCodAttempt } from "@/services/cod-orders";
import { sessionStorageKey } from "@/lib/api/client";
import type { CodOrderInput } from "@/domain/cod";
const input: CodOrderInput = {
  areaId: "11111111-1111-4111-8111-111111111111",
  addressId: "22222222-2222-4222-8222-222222222222",
  addressVersion: 0,
  paymentMethod: "cod",
  expectedTotal: 25,
  items: [{ productId: "33333333-3333-4333-8333-333333333333", qty: 2 }],
  fulfilments: [{ shopId: "44444444-4444-4444-8444-444444444444", method: "pickup" }],
};
const order = {
  id: "55555555-5555-4555-8555-555555555555",
  paymentMethod: "cod",
  paymentStatus: "unpaid",
  total: 25,
  subOrders: [{ id: "sub" }],
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
let active = false;
beforeEach(() => {
  localStorage.clear();
  active = false;
  localStorage.setItem(
    sessionStorageKey,
    JSON.stringify({ userId: "buyer", role: "buyer", token: "test-only", isDemo: false }),
  );
  vi.stubGlobal("crypto", { randomUUID });
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: vi.fn(
        async (_name: string, _options: unknown, callback: (lock: object | null) => unknown) => {
          if (active) return callback(null);
          active = true;
          try {
            return await callback({});
          } finally {
            active = false;
          }
        },
      ),
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it("persists before sending and reuses exact payload/key after an unknown network outcome", async () => {
  const fetcher = vi
    .fn()
    .mockImplementationOnce(() => {
      expect(readCodAttempt("buyer")?.state).toBe("pending");
      throw new Error("Network");
    })
    .mockResolvedValueOnce(response(order));
  vi.stubGlobal("fetch", fetcher);
  await expect(submitCodAttempt("buyer", input)).rejects.toThrow();
  const saved = readCodAttempt("buyer")!;
  expect(saved.state).toBe("pending");
  await submitCodAttempt("buyer", null);
  expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe(saved.key);
  expect(fetcher.mock.calls[1][1].headers["Idempotency-Key"]).toBe(saved.key);
  expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
  expect(readCodAttempt("buyer")).toMatchObject({ state: "confirmed", orderId: order.id });
  await expect(submitCodAttempt("buyer", input)).rejects.toThrow(/previous order attempt/);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("blocks changed pending attempts and never discards an uncertain request", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("Network"));
  vi.stubGlobal("fetch", fetcher);
  await expect(submitCodAttempt("buyer", input)).rejects.toThrow();
  await expect(submitCodAttempt("buyer", { ...input, expectedTotal: 30 })).rejects.toThrow(
    /unresolved/,
  );
  await expect(resetCodAttempt("buyer")).rejects.toThrow(/pending attempt/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("marks confirmed transaction rollback errors rejected, but keeps 503 outcomes pending", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      response({ code: "PRICE_CHANGED", message: "Review current price" }, 409),
    )
    .mockResolvedValueOnce(response({ code: "ORDERING_UNAVAILABLE", message: "Disabled" }, 503));
  vi.stubGlobal("fetch", fetcher);
  await expect(submitCodAttempt("buyer", input)).rejects.toThrow();
  expect(readCodAttempt("buyer")?.state).toBe("rejected");
  const old = readCodAttempt("buyer")!.key;
  await resetCodAttempt("buyer");
  await expect(submitCodAttempt("buyer", input)).rejects.toThrow();
  expect(readCodAttempt("buyer")?.state).toBe("pending");
  expect(readCodAttempt("buyer")!.key).not.toBe(old);
});
it("fails before POST when persistence, tab locks or account identity is unavailable", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const setter = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Blocked storage");
  });
  await expect(submitCodAttempt("buyer", input)).rejects.toThrow();
  setter.mockRestore();
  Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  await expect(submitCodAttempt("buyer", input)).rejects.toThrow(/Web Locks/);
  expect(fetcher).not.toHaveBeenCalled();
});
it("allows a fresh review after a deleted owned address is rejected transactionally", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(response({ code: "NOT_FOUND", message: "Address not found" }, 404)),
  );
  await expect(submitCodAttempt("buyer", input)).rejects.toThrow("Address not found");
  expect(readCodAttempt("buyer")?.state).toBe("rejected");
  await resetCodAttempt("buyer");
  expect(readCodAttempt("buyer")).toBeNull();
});
it("serializes tabs and rejects malformed successes without clearing recovery", async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const first = submitCodAttempt("buyer", input);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  await expect(submitCodAttempt("buyer", input)).rejects.toThrow(/Another tab/);
  finish(response({ ...order, total: 1 }));
  await expect(first).rejects.toThrow(/could not be verified/);
  expect(readCodAttempt("buyer")!.state).toBe("pending");
});
it("isolates recovery per buyer and requires explicit reset after success", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(order)));
  await submitCodAttempt("buyer", input);
  expect(readCodAttempt("other")).toBeNull();
  await expect(submitCodAttempt("other", input)).rejects.toThrow(/account changed/);
  await resetCodAttempt("buyer");
  expect(readCodAttempt("buyer")).toBeNull();
});
it("recovers an original order even when cash was recorded before the response was recovered", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      response({
        ...order,
        paymentStatus: "cash_recorded",
        amountDue: 0,
        cashRecordedAmount: 25,
      }),
    ),
  );
  const result = await submitCodAttempt("buyer", input);
  expect(result.order.paymentStatus).toBe("cash_recorded");
  expect(readCodAttempt("buyer")?.state).toBe("confirmed");
});
