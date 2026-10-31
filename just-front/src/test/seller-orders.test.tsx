import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LiveSellerOrders } from "@/components/portal/LiveSellerOrders";
import { sellerOrders } from "@/services/seller-orders";
import type { SellerSuborder } from "@/domain/seller-orders";
import type { ManagedShop } from "@/domain/management";
vi.mock("@/services/seller-orders", () => ({
  sellerOrders: { list: vi.fn(), transition: vi.fn() },
}));
vi.mock("@/components/portal/PortalShell", () => ({
  PortalHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
const sub: SellerSuborder = {
  orderId: "order-id",
  id: "sub",
  createdAt: "2026-10-30T00:00:00Z",
  shopId: "shop",
  shopName: "Own counter",
  status: "placed",
  version: 0,
  fulfilment: "pickup",
  lines: [{ productId: "p", name: "Owned listing", unit: "pack", qty: 2, price: 12.5 }],
  itemsSubtotal: 25,
  deliveryFee: 0,
  total: 25,
  amountDue: 25,
  paymentMethod: "cod",
  paymentStatus: "unpaid",
};
const shop = { id: "shop", status: "approved", active: true } as ManagedShop;
function mount(value = shop) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LiveSellerOrders shop={value} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(sellerOrders.list).mockResolvedValue([sub]);
});
afterEach(cleanup);
it("accepts using saved suborder version and keeps success feedback after refresh", async () => {
  vi.mocked(sellerOrders.transition).mockResolvedValue({ ...sub, status: "accepted", version: 1 });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Accept order" }));
  await screen.findByText("Order status saved: accepted.");
  expect(sellerOrders.transition).toHaveBeenCalledWith(sub, "accepted", "");
});
it("requires a buyer-visible reason before rejecting", async () => {
  vi.mocked(sellerOrders.transition).mockResolvedValue({
    ...sub,
    status: "cancelled",
    version: 1,
    amountDue: 0,
  });
  mount();
  const reject = await screen.findByRole("button", { name: "Reject this suborder" });
  expect(reject).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason for buyer (required to reject/cancel)"), {
    target: { value: "Stock damaged" },
  });
  fireEvent.click(reject);
  await waitFor(() =>
    expect(sellerOrders.transition).toHaveBeenCalledWith(sub, "cancelled", "Stock damaged"),
  );
});
it("blocks further actions after failure until an explicit successful reload", async () => {
  vi.mocked(sellerOrders.transition).mockRejectedValue(new Error("Version changed"));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Accept order" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Accept order" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Refresh orders" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Accept order" })).toBeEnabled());
});
it("does not offer cancellation after preparation or fake delivery/payment completion", async () => {
  vi.mocked(sellerOrders.list).mockResolvedValue([{ ...sub, status: "preparing", version: 2 }]);
  mount();
  await screen.findByRole("button", { name: "Mark ready" });
  expect(screen.queryByRole("button", { name: /Cancel|Reject|Delivered|Collect/ })).toBeNull();
});
it("offers dispatch for ready seller delivery and never for pickup", async () => {
  vi.mocked(sellerOrders.list).mockResolvedValue([
    { ...sub, status: "ready", version: 3, fulfilment: "seller_delivery" },
  ]);
  vi.mocked(sellerOrders.transition).mockResolvedValue({
    ...sub,
    status: "out_for_delivery",
    version: 4,
    fulfilment: "seller_delivery",
  });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Mark out for delivery" }));
  await waitFor(() =>
    expect(sellerOrders.transition).toHaveBeenCalledWith(
      expect.objectContaining({ version: 3, fulfilment: "seller_delivery" }),
      "out_for_delivery",
      "",
    ),
  );
  cleanup();
  vi.mocked(sellerOrders.list).mockResolvedValue([
    { ...sub, status: "ready", version: 3, fulfilment: "pickup" },
  ]);
  mount();
  await screen.findByText(/Ready for handoff/);
  expect(screen.queryByRole("button", { name: "Mark out for delivery" })).toBeNull();
});
it("keeps processing disabled for suspended shops but allows pre-preparation rejection", async () => {
  mount({ ...shop, status: "suspended", active: false });
  expect(await screen.findByRole("button", { name: "Accept order" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason for buyer (required to reject/cancel)"), {
    target: { value: "Shop unavailable" },
  });
  expect(screen.getByRole("button", { name: "Reject this suborder" })).toBeEnabled();
});
it("shows loading failures and empty filtered lists without demo data", async () => {
  vi.mocked(sellerOrders.list).mockRejectedValueOnce(new Error("Network")).mockResolvedValue([]);
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Retry shop orders" }));
  await screen.findByText("No orders in this view.");
});
