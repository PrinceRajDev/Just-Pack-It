import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnlinePaymentPanel } from "@/components/store/OnlinePaymentPanel";
import { onlinePayments, openOnlineCheckout } from "@/services/online-payments";
vi.mock("@/services/online-payments", () => ({
  onlinePayments: { get: vi.fn(), reconcile: vi.fn() },
  openOnlineCheckout: vi.fn(),
}));
const row = {
  orderId: "11111111-1111-4111-8111-111111111111",
  keyId: "rzp_test_isolated",
  providerOrderId: "order_isolated",
  amount: 2500,
  currency: "INR" as const,
  state: "ready" as const,
  testMode: true,
  reconciliationRequired: false,
  enabled: true,
};
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <OnlinePaymentPanel id={row.orderId} />
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.resetAllMocks();
});
it("blocks repeated checkout opens and permits another open after dismissal", async () => {
  vi.mocked(onlinePayments.get).mockResolvedValue(row);
  const c = mount();
  await screen.findByRole("button", { name: "Pay securely with Razorpay" });
  const pay = screen.getByRole("button", { name: "Pay securely with Razorpay" });
  fireEvent.click(pay);
  fireEvent.click(pay);
  expect(openOnlineCheckout).toHaveBeenCalledTimes(1);
  const close = vi.mocked(openOnlineCheckout).mock.calls[0][3];
  await act(async () => close());
  await waitFor(() => expect(pay).toBeEnabled());
  fireEvent.click(pay);
  expect(openOnlineCheckout).toHaveBeenCalledTimes(2);
  c.clear();
});
it("refreshes a missed browser callback from saved captured state without opening checkout", async () => {
  vi.mocked(onlinePayments.get).mockResolvedValue(row);
  const c = mount();
  await screen.findByRole("button", { name: "Pay securely with Razorpay" });
  vi.mocked(onlinePayments.get).mockResolvedValue({ ...row, state: "paid" });
  await act(async () => {
    await c.invalidateQueries({ queryKey: ["online-payment", row.orderId] });
  });
  await screen.findByText("Captured online. Seller settlement is separate.");
  expect(
    screen.queryByRole("button", { name: "Pay securely with Razorpay" }),
  ).not.toBeInTheDocument();
  expect(openOnlineCheckout).not.toHaveBeenCalled();
});
it("does not offer checkout for disabled or uncertain orders", async () => {
  vi.mocked(onlinePayments.get).mockResolvedValue({ ...row, enabled: false });
  const c = mount();
  await screen.findByText(/Online checkout is unavailable/);
  expect(
    screen.queryByRole("button", { name: "Pay securely with Razorpay" }),
  ).not.toBeInTheDocument();
  vi.mocked(onlinePayments.get).mockResolvedValue({
    ...row,
    state: "uncertain",
    reconciliationRequired: true,
  });
  await act(async () => {
    await c.invalidateQueries({ queryKey: ["online-payment", row.orderId] });
  });
  await screen.findByText(/Provider creation is uncertain/);
  expect(openOnlineCheckout).not.toHaveBeenCalled();
});
