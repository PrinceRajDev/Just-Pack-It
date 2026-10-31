import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminRefunds } from "@/components/portal/AdminRefunds";
import { RefundNotice } from "@/components/store/RefundNotice";
import { adminRefunds } from "@/services/refunds";
import type { AdminRefund } from "@/domain/refunds";
vi.mock("@/services/refunds", () => ({
  adminRefunds: { list: vi.fn(), submit: vi.fn(), reconcile: vi.fn() },
}));
const refund: AdminRefund = {
  id: "sub",
  orderId: "order",
  shopId: "shop",
  shopName: "Test counter",
  amount: 25,
  state: "requested",
  testMode: true,
  reason: "Cannot supply",
  providerRefundId: null,
  createdAt: "2026-10-30T00:00:00Z",
  updatedAt: "2026-10-30T00:00:00Z",
  canSubmit: true,
  canReconcile: true,
};
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdminRefunds orderId="order" />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(adminRefunds.list).mockResolvedValue([refund]);
});
afterEach(cleanup);
it("requires explicit confirmation before submitting the server-priced refund", async () => {
  vi.mocked(adminRefunds.submit).mockResolvedValue({
    ...refund,
    state: "pending",
    providerRefundId: "rfnd_test",
  });
  mount();
  const button = await screen.findByRole("button", { name: "Submit confirmed refund" });
  expect(button).toBeDisabled();
  expect(adminRefunds.submit).not.toHaveBeenCalled();
  expect(screen.getByText(/no real money returned/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(button);
  await waitFor(() => expect(adminRefunds.submit).toHaveBeenCalledWith("sub"));
  await screen.findByText(/not confirmation of bank credit/);
});
it("blocks submission while refunds are disabled", async () => {
  vi.mocked(adminRefunds.list).mockResolvedValue([{ ...refund, canSubmit: false }]);
  mount();
  expect(await screen.findByRole("button", { name: "Submit confirmed refund" })).toBeDisabled();
  expect(screen.getByRole("checkbox")).toBeDisabled();
});
it("checks a pending provider refund without offering another submission", async () => {
  vi.mocked(adminRefunds.list).mockResolvedValue([
    { ...refund, state: "pending", providerRefundId: "rfnd_test" },
  ]);
  vi.mocked(adminRefunds.reconcile).mockResolvedValue({
    ...refund,
    state: "processed",
    providerRefundId: "rfnd_test",
  });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Check provider refund status" }));
  await waitFor(() => expect(adminRefunds.reconcile).toHaveBeenCalledWith("sub"));
  expect(adminRefunds.submit).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Submit confirmed refund" })).not.toBeInTheDocument();
});
it("keeps requested and processed refund messages distinct", () => {
  const { rerender } = render(<RefundNotice refund={refund} />);
  expect(screen.getByText(/not yet issued/)).toBeInTheDocument();
  rerender(<RefundNotice refund={{ ...refund, state: "processed" }} />);
  expect(screen.getByText(/processed by provider/)).toBeInTheDocument();
  expect(screen.getByText(/Bank credit timing depends/)).toBeInTheDocument();
});
