import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminPayments } from "@/components/portal/AdminPayments";
import { adminPayments } from "@/services/admin-payments";
import type { AdminPaymentDetail } from "@/domain/admin-payments";
import type { Order } from "@/domain/types";
vi.mock("@/services/admin-payments", () => ({
  adminPayments: { list: vi.fn(), get: vi.fn(), reconcile: vi.fn() },
}));
vi.mock("@/components/portal/AdminRefunds", () => ({ AdminRefunds: () => null }));
vi.mock("@/components/portal/PortalShell", () => ({
  PortalHeader: ({ title, sub }: { title: string; sub: string }) => (
    <>
      <h1>{title}</h1>
      <p>{sub}</p>
    </>
  ),
}));
const payment: AdminPaymentDetail = {
  orderId: "11111111-1111-4111-8111-111111111111",
  state: "uncertain",
  amount: 2500,
  currency: "INR",
  testMode: true,
  providerOrderId: null,
  providerPaymentId: null,
  createdAt: "2026-10-30T00:00:00Z",
  paidAt: null,
  accountMatches: true,
  onlineEnabled: true,
  audit: [],
};
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdminPayments />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(adminPayments.list).mockResolvedValue({ payments: [payment], next: undefined });
  vi.mocked(adminPayments.get).mockResolvedValue(payment);
});
afterEach(cleanup);
it("requires a verified-ID acknowledgement and reason before uncertain mapping reconciliation", async () => {
  vi.mocked(adminPayments.reconcile).mockResolvedValue({ paymentStatus: "unpaid" } as Order);
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect payment" }));
  const button = await screen.findByRole("button", { name: "Verify mapping & recheck capture" });
  expect(button).toBeDisabled();
  expect(adminPayments.reconcile).not.toHaveBeenCalled();
  expect(screen.getByText(/TEST order/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Existing Razorpay order ID"), {
    target: { value: "order_existing" },
  });
  fireEvent.change(screen.getByLabelText("Operator reason"), {
    target: { value: "Matched existing receipt in dashboard" },
  });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(button);
  await waitFor(() =>
    expect(adminPayments.reconcile).toHaveBeenCalledWith(payment.orderId, {
      providerOrderId: "order_existing",
      reason: "Matched existing receipt in dashboard",
      confirmProviderOrder: true,
    }),
  );
  await screen.findByText(/payment is not captured/);
  expect(
    screen.queryByRole("button", { name: /refund|mark paid|release stock/i }),
  ).not.toBeInTheDocument();
});
it("keeps records visible but disables provider actions for unconfigured or different accounts", async () => {
  vi.mocked(adminPayments.get).mockResolvedValue({
    ...payment,
    providerOrderId: "order_existing",
    onlineEnabled: false,
    accountMatches: false,
  });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect payment" }));
  expect(await screen.findByRole("button", { name: "Recheck provider capture" })).toBeDisabled();
  expect(screen.getByText(/different or unconfigured Razorpay account/)).toBeInTheDocument();
});
it("resets cursor pagination when payment mode changes", async () => {
  vi.mocked(adminPayments.list).mockResolvedValue({ payments: [], next: "page-two" });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Next payment page" }));
  await waitFor(() => expect(adminPayments.list).toHaveBeenCalledWith("all", "all", "page-two"));
  fireEvent.change(screen.getByRole("combobox", { name: "Payment mode" }), {
    target: { value: "test" },
  });
  await waitFor(() => expect(adminPayments.list).toHaveBeenCalledWith("all", "test", undefined));
  expect(screen.getByRole("button", { name: "Previous payment page" })).toBeDisabled();
});
it("shows list failures and retries without inventing payment records", async () => {
  vi.mocked(adminPayments.list)
    .mockRejectedValueOnce(new Error("Server unavailable"))
    .mockResolvedValue({ payments: [], next: undefined });
  mount();
  await screen.findByText("Server unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("No matching online payments");
  expect(adminPayments.reconcile).not.toHaveBeenCalled();
});

it("a detail drawer recheck locks duplicate clicks and preserves provider verification semantics", async () => {
  vi.mocked(adminPayments.get).mockResolvedValue({ ...payment, providerOrderId: "order_existing" });
  let resolveCheck!: (value: Order) => void;
  vi.mocked(adminPayments.reconcile).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveCheck = resolve;
      }),
  );
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect payment" }));
  const action = await screen.findByRole("button", { name: "Recheck provider capture" });
  fireEvent.click(action);
  fireEvent.click(action);
  expect(adminPayments.reconcile).toHaveBeenCalledTimes(1);
  resolveCheck({ paymentStatus: "unpaid" } as Order);
  await screen.findByText(/payment is not captured/);
});
