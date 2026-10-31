import { z } from "zod";
import { api, ApiError, sessionStorageKey } from "@/lib/api/client";
import { config } from "@/lib/config";
import type { Order } from "@/domain/types";
import type { OnlineCheckout, OnlineOrderInput } from "@/domain/online-payments";
const checkoutSchema = z.object({
  orderId: z.uuid(),
  keyId: z.string().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/),
  providerOrderId: z
    .string()
    .regex(/^order_[A-Za-z0-9]+$/)
    .nullable(),
  amount: z.number().int().positive(),
  currency: z.literal("INR"),
  state: z.enum(["creating", "uncertain", "ready", "paid"]),
  testMode: z.boolean(),
  reconciliationRequired: z.boolean(),
  enabled: z.boolean(),
});
const keyFor = (userId: string) => `jpi.online-attempt:${config.apiUrl}:${userId}`;
export function hasOnlineAttempt(userId: string) {
  return typeof window !== "undefined" && !!localStorage.getItem(keyFor(userId));
}
export async function createOnlineAttempt(userId: string, input: OnlineOrderInput | null) {
  if (!navigator.locks?.request)
    throw new Error("Safe payment recovery requires Web Locks and local storage.");
  return navigator.locks.request(keyFor(userId), { ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error("Another tab is processing this payment order.");
    const session = JSON.parse(localStorage.getItem(sessionStorageKey) ?? "null");
    if (session?.userId !== userId || session?.role !== "buyer" || session?.isDemo)
      throw new Error("Sign in again before ordering.");
    const cod = JSON.parse(
      localStorage.getItem(`jpi.cod-attempt:${config.apiUrl}:${userId}`) ?? "null",
    );
    if (cod && cod.state !== "rejected")
      throw new Error("Resolve your previous COD order attempt before creating an online order.");
    let saved: { key: string; input: OnlineOrderInput } | null = JSON.parse(
      localStorage.getItem(keyFor(userId)) ?? "null",
    );
    if (!saved) {
      if (!input) throw new Error("No saved online attempt was found. Check order history.");
      saved = { key: crypto.randomUUID(), input };
      const serialized = JSON.stringify(saved);
      localStorage.setItem(keyFor(userId), serialized);
      if (localStorage.getItem(keyFor(userId)) !== serialized)
        throw new Error("Payment recovery could not be saved. Ordering is paused.");
    }
    z.uuid().parse(saved.key);
    let result: OnlineCheckout;
    try {
      result = checkoutSchema.parse(
        await api<unknown>("/payments/razorpay/orders", {
          method: "POST",
          headers: { "Idempotency-Key": saved.key },
          body: JSON.stringify(saved.input),
          signal: AbortSignal.timeout(30_000),
        }),
      );
    } catch (cause) {
      // These failures occur after the existing-order lookup and roll back the creation transaction.
      const rolledBack = new Set([
        "PRICE_CHANGED",
        "ADDRESS_CHANGED",
        "INSUFFICIENT_STOCK",
        "MINIMUM_NOT_MET",
        "METHOD_UNAVAILABLE",
        "ADDRESS_UNSERVICEABLE",
        "DELIVERY_FEE_UNKNOWN",
        "AREA_UNAVAILABLE",
        "SHOP_UNAVAILABLE",
        "LISTING_UNAVAILABLE",
        "VARIANT_UNAVAILABLE",
        "HOLD_UNAVAILABLE",
        "INVALID_SHOP_SELECTION",
      ]);
      if (cause instanceof ApiError && cause.code && rolledBack.has(cause.code))
        localStorage.removeItem(keyFor(userId));
      throw cause;
    }
    localStorage.removeItem(keyFor(userId));
    return { checkout: result, input: saved.input };
  });
}
export const onlinePayments = {
  get: async (id: string) =>
    checkoutSchema.parse(await api<unknown>(`/payments/razorpay/orders/${encodeURIComponent(id)}`)),
  reconcile: (id: string) =>
    api<Order>(`/payments/razorpay/orders/${encodeURIComponent(id)}/reconcile`, {
      method: "POST",
      body: "{}",
      signal: AbortSignal.timeout(30_000),
    }),
  verify: (id: string, response: Callback) =>
    api<Order>(`/payments/razorpay/orders/${encodeURIComponent(id)}/verify`, {
      method: "POST",
      body: JSON.stringify(response),
      signal: AbortSignal.timeout(30_000),
    }),
};
interface Callback {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
interface Gateway {
  open(): void;
  on(event: "payment.failed", handler: () => void): void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => Gateway;
  }
}
let loader: Promise<void> | undefined;
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (!loader)
    loader = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      const timer = setTimeout(() => {
        script.remove();
        loader = undefined;
        reject(new Error("Secure checkout did not load. Check your connection."));
      }, 20_000);
      script.onload = () => {
        clearTimeout(timer);
        if (window.Razorpay) resolve();
        else {
          loader = undefined;
          reject(new Error("Secure checkout is unavailable."));
        }
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        loader = undefined;
        reject(new Error("Secure checkout could not load."));
      };
      document.head.append(script);
    });
  return loader;
}
export async function openOnlineCheckout(
  checkout: OnlineCheckout,
  onVerified: () => void,
  onMessage: (message: string) => void,
  onClosed: () => void,
) {
  if (checkout.state !== "ready" || !checkout.providerOrderId)
    throw new Error("This payment needs reconciliation before checkout can open.");
  await loadRazorpay();
  const gateway = new window.Razorpay!({
    key: checkout.keyId,
    order_id: checkout.providerOrderId,
    amount: checkout.amount,
    currency: "INR",
    name: "Just Pack It",
    description: checkout.testMode
      ? "TEST MODE — no real purchase"
      : "Neighbourhood marketplace order",
    theme: { color: "#154b31" },
    modal: {
      ondismiss: () => {
        onMessage(
          "Checkout closed. Payment is not confirmed; check payment status before retrying.",
        );
        onClosed();
      },
    },
    handler: async (response: Callback) => {
      try {
        const order = await onlinePayments.verify(checkout.orderId, response);
        if (order.paymentStatus === "paid") onVerified();
        else onMessage("Payment is awaiting capture. Check payment status shortly.");
      } catch {
        onMessage(
          "Payment could not be confirmed. Check payment status; do not start another order.",
        );
      } finally {
        onClosed();
      }
    },
  });
  gateway.on("payment.failed", () =>
    onMessage(
      "Payment attempt failed. A later attempt may still succeed; check this order before retrying.",
    ),
  );
  gateway.open();
}
