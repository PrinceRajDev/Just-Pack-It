import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LiveSellerDashboard } from "@/components/portal/LiveSellerDashboard";
import { sellerDashboard } from "@/services/seller-dashboard";
import type { SellerDashboard } from "@/domain/seller-dashboard";
import type { ManagedShop } from "@/domain/management";
import type { ReactNode } from "react";
vi.mock("@/services/seller-dashboard", () => ({ sellerDashboard: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/portal/LiveSellerOrders", () => ({
  SellerOrderCard: () => <p>Versioned order controls</p>,
}));
const shop = {
  id: "shop",
  name: "Test counter",
  isOpen: true,
  status: "approved",
  active: true,
  hours: "9–5",
  version: 0,
  timezone: "Asia/Kolkata",
  openingHours: [{ day: 1, opens: "09:00", closes: "17:00" }],
  fulfilment: ["pickup"],
} as ManagedShop;
const data: SellerDashboard = {
  checkedAt: "2026-10-31T10:00:00Z",
  date: "2026-10-31",
  timezone: "Asia/Kolkata",
  todayOrders: 4,
  pendingPayment: 2,
  counts: { placed: 1, accepted: 2, preparing: 3, ready: 1 },
  urgent: [{ id: "sub", version: 1 } as SellerDashboard["urgent"][number]],
  lowStock: {
    threshold: 5,
    count: 2,
    outOfStock: 1,
    items: [{ productId: "p", name: "Rice", variantId: "v", label: "500 g", stock: 0 }],
  },
};
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LiveSellerDashboard shop={shop} />
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("shows real daily/urgent and variant-stock summaries without claiming revenue", async () => {
  vi.mocked(sellerDashboard).mockResolvedValue(data);
  mount();
  await screen.findByText("Orders received today");
  expect(screen.getByText("Versioned order controls")).toBeInTheDocument();
  expect(screen.getByText("Rice · 500 g")).toBeInTheDocument();
  expect(screen.getByText(/2 online shop order/)).toBeInTheDocument();
  expect(screen.getByText(/not earnings or payout totals/)).toBeInTheDocument();
  expect(screen.queryByText("Sales today")).toBeNull();
});
it("retains previous figures on refresh error with explicit stale notice", async () => {
  vi.mocked(sellerDashboard).mockResolvedValueOnce(data).mockRejectedValue(new Error("offline"));
  mount();
  await screen.findByText("Orders received today");
  fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Showing last loaded figures");
  expect(screen.getByText("Rice · 500 g")).toBeInTheDocument();
});
it("initial errors do not become invented zero statistics; retry recovers", async () => {
  vi.mocked(sellerDashboard).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(data);
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("No zero counts are assumed");
  expect(screen.queryByText("Orders received today")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));
  await waitFor(() => expect(screen.getByText("Orders received today")).toBeInTheDocument());
});
