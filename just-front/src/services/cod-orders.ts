import { z } from "zod";
import { config } from "@/lib/config";
import { api, ApiError, sessionStorageKey } from "@/lib/api/client";
import type { CodOrderInput, CodAttempt, ConfirmedCodOrder } from "@/domain/cod";
import { hasOnlineAttempt } from "@/services/online-payments";
const inputSchema = z
  .object({
    areaId: z.string().uuid(),
    addressId: z.string().uuid(),
    addressVersion: z.number().int().nonnegative(),
    paymentMethod: z.literal("cod"),
    expectedTotal: z.number().finite().nonnegative().max(1e12),
    items: z
      .array(
        z
          .object({
            productId: z.string().uuid(),
            variantId: z.string().uuid().optional(),
            qty: z.number().int().min(1).max(999),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    fulfilments: z
      .array(
        z
          .object({
            shopId: z.string().uuid(),
            method: z.enum(["pickup", "seller_delivery", "platform_delivery"]),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
const attemptSchema = z
  .object({
    key: z.string().uuid(),
    input: inputSchema,
    state: z.enum(["pending", "confirmed", "rejected"]),
    orderId: z.string().uuid().optional(),
    errorCode: z.string().optional(),
  })
  .strict();
export const codAttemptEvent = "jpi:cod-attempt-changed";
const storageKey = (userId: string) => `jpi.cod-attempt:${config.apiUrl}:${userId}`;
export function readCodAttempt(userId: string): CodAttempt | null {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(storageKey(userId));
  if (!value) return null;
  const result = attemptSchema.safeParse(JSON.parse(value));
  if (!result.success || (result.data.state === "confirmed" && !result.data.orderId))
    throw new Error(
      "Order recovery data could not be read. Do not submit a new order; check your order history.",
    );
  return result.data;
}
function persist(userId: string, attempt: CodAttempt) {
  const value = JSON.stringify(attempt);
  localStorage.setItem(storageKey(userId), value);
  if (localStorage.getItem(storageKey(userId)) !== value)
    throw new Error("Order recovery could not be saved. Ordering is paused.");
  window.dispatchEvent(new Event(codAttemptEvent));
}
async function locked<T>(userId: string, work: () => Promise<T>): Promise<T> {
  if (!config.apiUrl || !navigator.locks?.request)
    throw new Error(
      "Safe order recovery requires a browser with Web Locks and local storage enabled.",
    );
  return navigator.locks.request(storageKey(userId), { ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error("Another tab is processing this order. Wait for it to finish.");
    const session = JSON.parse(localStorage.getItem(sessionStorageKey) ?? "null");
    if (session?.userId !== userId || session?.isDemo || session?.role !== "buyer")
      throw new Error("Your account changed. Sign in again before ordering.");
    return work();
  });
}
export function canonicalCodInput(input: CodOrderInput): CodOrderInput {
  return inputSchema.parse({
    areaId: input.areaId,
    addressId: input.addressId,
    addressVersion: input.addressVersion,
    paymentMethod: "cod",
    expectedTotal: input.expectedTotal,
    items: input.items
      .map(({ productId, variantId, qty }) => ({ productId, variantId, qty }))
      .sort((a, b) =>
        `${a.productId}:${a.variantId ?? ""}`.localeCompare(`${b.productId}:${b.variantId ?? ""}`),
      ),
    fulfilments: input.fulfilments
      .map(({ shopId, method }) => ({ shopId, method }))
      .sort((a, b) => a.shopId.localeCompare(b.shopId)),
  });
}
const rollbackCodes = new Set([
  // On POST /orders these originate after the existing-order lookup, inside its transaction.
  "NOT_FOUND",
  "INVALID_CATEGORY",
  "INVALID_SUBCATEGORY",
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
export async function submitCodAttempt(userId: string, input: CodOrderInput | null) {
  if (hasOnlineAttempt(userId))
    throw new Error("Recover your online order attempt before creating a COD order.");
  return locked(userId, async () => {
    let attempt = readCodAttempt(userId);
    if (attempt && attempt.state !== "pending")
      throw new Error("Review the previous order attempt before starting a new one.");
    if (!attempt) {
      if (!input) throw new Error("No pending order attempt to recover.");
      attempt = { key: crypto.randomUUID(), input: canonicalCodInput(input), state: "pending" };
      persist(userId, attempt);
    } else if (input && JSON.stringify(attempt.input) !== JSON.stringify(canonicalCodInput(input)))
      throw new Error(
        "An earlier order attempt is unresolved. Recover it from your account before placing another order.",
      );
    const submitted = attempt;
    try {
      const result = await api<ConfirmedCodOrder>("/orders", {
        method: "POST",
        headers: { "Idempotency-Key": submitted.key },
        body: JSON.stringify(submitted.input),
        signal: AbortSignal.timeout(30_000),
      });
      if (
        !result ||
        !z.string().uuid().safeParse(result.id).success ||
        result.isDemo ||
        result.paymentMethod !== "cod" ||
        !["unpaid", "partially_cash_recorded", "cash_recorded"].includes(result.paymentStatus) ||
        result.total !== submitted.input.expectedTotal ||
        !Array.isArray(result.subOrders) ||
        !result.subOrders.length
      )
        throw new Error(
          "The order response could not be verified. Recover this attempt before ordering again.",
        );
      persist(userId, { ...submitted, state: "confirmed", orderId: result.id });
      return { order: result, input: submitted.input };
    } catch (error) {
      if (error instanceof ApiError && error.code && rollbackCodes.has(error.code))
        persist(userId, { ...submitted, state: "rejected", errorCode: error.code });
      throw error;
    }
  });
}
export async function resetCodAttempt(userId: string) {
  return locked(userId, async () => {
    const current = readCodAttempt(userId);
    if (current?.state === "pending")
      throw new Error("Recover the pending attempt before starting another order.");
    localStorage.removeItem(storageKey(userId));
    if (localStorage.getItem(storageKey(userId)))
      throw new Error("Order recovery state could not be cleared.");
    window.dispatchEvent(new Event(codAttemptEvent));
  });
}
