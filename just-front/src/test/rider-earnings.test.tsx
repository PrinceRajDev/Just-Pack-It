import { it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RiderEarnings } from "@/components/portal/RiderEarnings";
import { riderEarnings } from "@/services/rider-earnings";
const auth = vi.hoisted(() => ({ role: "delivery" }));
vi.mock("@/stores/auth", () => ({
  useAuth: () => ({ session: { userId: "QA", role: auth.role } }),
}));
vi.mock("@/services/rider-earnings", () => ({
  riderEarnings: { list: vi.fn(), prepare: vi.fn(), record: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("shows real earnings without rider payout controls", async () => {
  vi.mocked(riderEarnings.list).mockResolvedValue({
    items: [{ id: "QA", shopName: "QA shop", amount: 30, holdReason: null, payout: null }],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RiderEarnings />
    </QueryClientProvider>,
  );
  expect(await screen.findByText(/QA shop/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Prepare ₹30 rider payment" }),
  ).not.toBeInTheDocument();
});
it("blocks admin payments while cash receipt is on hold", async () => {
  auth.role = "admin";
  vi.mocked(riderEarnings.list).mockResolvedValue({
    items: [
      {
        id: "QA",
        shopName: "QA shop",
        amount: 30,
        holdReason: "Cash receipt required",
        payout: null,
      },
    ],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RiderEarnings />
    </QueryClientProvider>,
  );
  expect(await screen.findByText(/On hold: Cash receipt required/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Prepare ₹30 rider payment" }),
  ).not.toBeInTheDocument();
});
