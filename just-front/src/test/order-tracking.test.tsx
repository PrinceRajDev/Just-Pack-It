vi.mock("@/components/store/OrderReceipt", () => ({ OrderReceipt: () => null }));
vi.mock("@/components/store/BuyAgain", () => ({ BuyAgain: () => null }));
import { it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Order, SubOrder } from "@/domain/types";
import type { ReactNode } from "react";
import { ShopOrderTimeline } from "@/components/store/ShopOrderTimeline";
import { LiveOrderPage } from "@/components/store/LiveOrders";
import { trackingInterval } from "@/lib/order-tracking";
import { orders } from "@/services/orders";
vi.mock("@/stores/auth", () => ({
  useAuth: () => ({ ready: true, session: { userId: "buyer", role: "buyer" } }),
}));
vi.mock("@/services/orders", () => ({ orders: { get: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/store/StoreLayout", () => ({
  StoreLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PageTitle: () => null,
}));
vi.mock("@/components/store/OrderSupport", () => ({ OrderSupport: () => null }));
vi.mock("@/components/store/BuyerCancellation", () => ({ BuyerCancellation: () => null }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const sub = {
  id: "s",
  shopId: "shop",
  shopName: "Test shop",
  status: "preparing",
  fulfilment: "pickup",
  lines: [],
  deliveryFee: 0,
} as SubOrder;
const order = {
  id: "o",
  createdAt: new Date().toISOString(),
  addressId: "a",
  paymentMethod: "cod",
  paymentStatus: "unpaid",
  total: 10,
  subOrders: [sub],
} as Order;
it("renders pickup-specific current step without claiming ETA or delivery", () => {
  render(<ShopOrderTimeline sub={sub} />);
  expect(screen.getByText("Preparing").closest("li")).toHaveAttribute("aria-current", "step");
  expect(screen.getByText("Ready for collection")).toBeInTheDocument();
  expect(screen.queryByText("Out for delivery")).toBeNull();
  expect(screen.getByText(/arrival estimates are not supplied/)).toBeInTheDocument();
});
it("uses seller delivery steps and only actual provided updatedAt", () => {
  render(
    <ShopOrderTimeline
      sub={{
        ...sub,
        fulfilment: "seller_delivery",
        status: "out_for_delivery",
        updatedAt: "2026-10-30T10:00:00.000Z",
      }}
    />,
  );
  expect(screen.getByText("Out for delivery").closest("li")).toHaveAttribute(
    "aria-current",
    "step",
  );
  expect(screen.getByText(/Shop status updated/)).toBeInTheDocument();
});
it("keeps cancellation and pending payment separate from successful progress", () => {
  const { rerender } = render(<ShopOrderTimeline sub={{ ...sub, status: "cancelled" }} />);
  expect(screen.getByRole("status")).toHaveTextContent("cancelled");
  expect(screen.queryByRole("list")).toBeNull();
  rerender(<ShopOrderTimeline sub={{ ...sub, status: "placed" }} paymentPending />);
  expect(screen.getByRole("status")).toHaveTextContent("Awaiting verified online payment");
  expect(screen.queryByRole("list")).toBeNull();
});
it("polls active orders and pending money states, stops completed COD", () => {
  expect(trackingInterval(order)).toBe(15000);
  const done = { ...order, subOrders: [{ ...sub, status: "delivered" as const }] };
  expect(trackingInterval(done)).toBe(false);
  expect(trackingInterval({ ...done, paymentMethod: "razorpay", paymentStatus: "unpaid" })).toBe(
    15000,
  );
  expect(trackingInterval(null)).toBe(false);
});
it("retains the last successful order on refresh failure", async () => {
  vi.mocked(orders.get).mockResolvedValueOnce(order).mockRejectedValue(new Error("offline"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LiveOrderPage id="o" />
    </QueryClientProvider>,
  );
  await screen.findByText("Order o");
  await client.invalidateQueries({ queryKey: ["order", "buyer", "o"] });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Showing the last successfully loaded order",
  );
  expect(screen.getByText("Order o")).toBeInTheDocument();
  expect(screen.getByText("Preparing")).toBeInTheDocument();
  await waitFor(() => expect(orders.get).toHaveBeenCalledTimes(2));
  client.clear();
});

it("automatically refreshes an active order and displays its new shop status", async () => {
  vi.useFakeTimers();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    vi.mocked(orders.get)
      .mockResolvedValueOnce(order)
      .mockResolvedValue({ ...order, subOrders: [{ ...sub, status: "ready" }] });
    await act(async () => {
      render(
        <QueryClientProvider client={client}>
          <LiveOrderPage id="o" />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByText("Preparing").closest("li")).toHaveAttribute("aria-current", "step");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15050);
    });
    expect(orders.get).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Ready for collection").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
  } finally {
    client.clear();
    vi.useRealTimers();
  }
});
