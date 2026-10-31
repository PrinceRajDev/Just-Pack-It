vi.mock("@/components/store/BuyAgain", () => ({ BuyAgain: () => null }));
vi.mock("@/components/store/OrderReceipt", () => ({ OrderReceipt: () => null }));
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LiveOrderPage, LiveOrdersPage } from "@/components/store/LiveOrders";
import { orders } from "@/services/orders";
const state = vi.hoisted(() => ({
  session: { userId: "buyer", role: "buyer" } as { userId: string; role: string } | null,
}));
vi.mock("@/stores/auth", () => ({ useAuth: () => ({ session: state.session, ready: true }) }));
vi.mock("@/services/orders", () => ({ orders: { list: vi.fn(), get: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/store/StoreLayout", () => ({
  StoreLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PageTitle: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
beforeEach(() => {
  vi.resetAllMocks();
  state.session = { userId: "buyer", role: "buyer" };
});
afterEach(cleanup);
function mount(node: ReactNode) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}
it("requires a buyer session before requesting private history", () => {
  state.session = null;
  mount(<LiveOrdersPage />);
  expect(screen.getByText("Sign in to view your orders")).toBeInTheDocument();
  expect(orders.list).not.toHaveBeenCalled();
});
it("handles empty and failed owned history without demo fallback", async () => {
  vi.mocked(orders.list).mockResolvedValue([]);
  mount(<LiveOrdersPage />);
  await screen.findByText(/No orders yet/);
  cleanup();
  vi.mocked(orders.list).mockRejectedValue(new Error("Network"));
  mount(<LiveOrdersPage />);
  await screen.findByRole("alert");
});
it("uses immutable order/address snapshots and keeps COD unpaid", async () => {
  vi.mocked(orders.get).mockResolvedValue({
    id: "order",
    createdAt: "2026-10-30T00:00:00Z",
    addressId: "a",
    paymentMethod: "cod",
    paymentStatus: "unpaid",
    total: 25,
    address: {
      label: "Home",
      line1: "Original lane",
      locality: "Test locality",
      city: "Test locality",
      pincode: "999999",
    },
    subOrders: [
      {
        id: "sub",
        shopId: "missing-catalogue-shop",
        shopName: "Original shop",
        status: "placed",
        fulfilment: "pickup",
        deliveryFee: 0,
        lines: [
          {
            productId: "deleted-listing",
            name: "Original listing",
            variantLabel: "Large",
            unit: "pack",
            qty: 2,
            price: 12.5,
          },
        ],
      },
    ],
  });
  mount(<LiveOrderPage id="order" />);
  await screen.findByText("Original shop");
  expect(screen.getByText(/Original lane/)).toBeInTheDocument();
  expect(screen.getByText(/Original listing · Large/)).toBeInTheDocument();
  expect(screen.getByText(/COD · Unpaid/)).toBeInTheDocument();
  expect(screen.queryByText(/Payment successful/)).toBeNull();
});
it("shows cancellation reason and current COD due separately from original totals", async () => {
  vi.mocked(orders.get).mockResolvedValue({
    id: "order",
    createdAt: "2026-10-30T00:00:00Z",
    addressId: "a",
    paymentMethod: "cod",
    paymentStatus: "unpaid",
    total: 25,
    amountDue: 0,
    cancelledAmount: 25,
    subOrders: [
      {
        id: "sub",
        shopId: "s",
        shopName: "Own shop",
        status: "cancelled",
        version: 1,
        cancelReason: "Stock damaged",
        amountDue: 0,
        fulfilment: "pickup",
        deliveryFee: 0,
        lines: [{ productId: "p", name: "Listing", unit: "pack", qty: 2, price: 12.5 }],
      },
    ],
  });
  mount(<LiveOrderPage id="order" />);
  await screen.findByText("Current COD amount due: ₹0");
  expect(screen.getByText("Cancellation reason: Stock damaged")).toBeInTheDocument();
  expect(screen.getByText(/Cancelled portion: ₹25/)).toBeInTheDocument();
});
it("labels recorded cash accurately and does not expose new receipt controls for a completed order", async () => {
  vi.mocked(orders.get).mockResolvedValue({
    id: "order",
    createdAt: "2026-10-30T00:00:00Z",
    addressId: "a",
    paymentMethod: "cod",
    paymentStatus: "cash_recorded",
    total: 25,
    amountDue: 0,
    cashRecordedAmount: 25,
    cancelledAmount: 0,
    subOrders: [
      {
        id: "sub",
        shopId: "s",
        shopName: "Own shop",
        status: "delivered",
        version: 4,
        amountDue: 0,
        fulfilment: "pickup",
        deliveryFee: 0,
        cashCollection: {
          method: "cash",
          amount: 25,
          recordedAt: "2026-10-30T00:01:00Z",
          buyerConfirmedAt: "2026-10-30T00:00:00Z",
        },
        lines: [{ productId: "p", name: "Listing", unit: "pack", qty: 2, price: 12.5 }],
      },
    ],
  });
  mount(<LiveOrderPage id="order" />);
  await screen.findByText(/COD · Cash recorded/);
  expect(screen.getByText(/not gateway verification or settlement/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Generate receipt code" })).toBeNull();
});
