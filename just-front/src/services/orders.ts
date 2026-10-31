// Owned order reads use the implemented API. Live placement belongs to cod-orders.ts;
// place() below preserves the existing explicitly labelled demo flow only.
import { queryOptions } from "@tanstack/react-query";
import { api, apiAll, ApiError, delay } from "@/lib/api/client";
import { isDemoMode } from "@/lib/config";
import * as mock from "@/mocks/data";
import type { CartLine, Order, PaymentMethod } from "@/domain/types";
import { buildSubOrders } from "@/lib/pricing";

const DEMO_KEY = "jpi.demoOrders";

function readDemo(): Order[] {
  if (typeof window === "undefined") return mock.demoOrders;
  try {
    return [...(JSON.parse(localStorage.getItem(DEMO_KEY) ?? "[]") as Order[]), ...mock.demoOrders];
  } catch {
    return mock.demoOrders;
  }
}

export interface PlaceOrderInput {
  addressId: string;
  paymentMethod: PaymentMethod;
  items: CartLine[];
}

export const orders = {
  cancel: (orderId: string, subId: string, version: number, reason: string) =>
    api<void>(
      `/orders/${encodeURIComponent(orderId)}/suborders/${encodeURIComponent(subId)}/cancel`,
      { method: "POST", body: JSON.stringify({ version, reason }) },
    ),
  async list(): Promise<Order[]> {
    if (isDemoMode) return (await delay(), readDemo());
    return apiAll("/orders");
  },
  async get(id: string): Promise<Order | null> {
    if (isDemoMode) return (await delay(200), readDemo().find((o) => o.id === id) ?? null);
    try {
      return await api(`/orders/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
  async place(input: PlaceOrderInput): Promise<Order> {
    if (!isDemoMode)
      throw new ApiError(
        "Use the reviewed COD confirmation flow to place a live order.",
        409,
        "REVIEW_REQUIRED",
      );
    await delay(700);
    if (input.paymentMethod !== "cod") {
      throw new ApiError(
        "Online payments need the payment gateway, which isn't connected yet. Choose Cash on Delivery to place a demo order.",
        501,
        "PAYMENT_UNAVAILABLE",
      );
    }
    // Demo only: stored in this browser, never sent to any shop.
    const subOrders = buildSubOrders(input.items);
    const order: Order = {
      id: `DEMO-${Math.floor(Math.random() * 90000 + 10000)}`,
      createdAt: new Date().toISOString(),
      addressId: input.addressId,
      paymentMethod: input.paymentMethod,
      subOrders,
      total: subOrders.reduce(
        (s, so) => s + so.deliveryFee + so.lines.reduce((a, l) => a + l.qty * l.price, 0),
        0,
      ),
      isDemo: true,
    };
    const existing = JSON.parse(localStorage.getItem(DEMO_KEY) ?? "[]");
    localStorage.setItem(DEMO_KEY, JSON.stringify([order, ...existing]));
    return order;
  },
};

export const ordersQuery = () => queryOptions({ queryKey: ["orders"], queryFn: orders.list });
export const orderQuery = (id: string) =>
  queryOptions({ queryKey: ["order", id], queryFn: () => orders.get(id) });
