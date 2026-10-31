import { it, expect, vi } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import { AdminFinance } from "@/components/portal/AdminFinance";
vi.mock("@/components/portal/SettlementLedger", () => ({
  SettlementLedger: () => <p>Existing ledger</p>,
}));
vi.mock("@/components/portal/AdminPayments", () => ({
  AdminPayments: () => <p>Existing payments</p>,
}));
vi.mock("@/components/portal/AdminWorkspace", () => ({
  Reconciliation: () => <p>Existing allocations</p>,
}));
it("does not fabricate financial totals from paginated or absent data", () => {
  render(<AdminFinance />);
  const cards = screen.getByRole("region", { name: "Financial overview" });
  expect(within(cards).getAllByText("Global reporting unavailable")).toHaveLength(4);
  expect(within(cards).queryByText("₹0")).toBeNull();
  expect(screen.getByText("Existing ledger")).toBeInTheDocument();
  expect(screen.getByText("Existing payments")).toBeInTheDocument();
  expect(screen.getByText("Existing allocations")).toBeInTheDocument();
  cleanup();
});
