import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminReports } from "@/components/portal/AdminReports";
import { adminReports } from "@/services/admin-reports";
import type { AdminReport } from "@/domain/admin-reports";
vi.mock("@/services/admin-reports", () => ({ adminReports: { get: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const data: AdminReport = {
  checkedAt: "2026-10-31T00:00:00Z",
  from: "2020-01-01",
  to: "2020-01-03",
  timezone: "Asia/Kolkata",
  currency: "INR",
  amountUnit: "paise",
  orders: { count: 3, amountCents: 14000 },
  captures: { count: 1, amountCents: 5000 },
  cash: { count: 2, amountCents: 12000 },
  daily: [
    { date: "2020-01-01", count: 2, amountCents: 11000 },
    { date: "2020-01-02", count: 1, amountCents: 3000 },
    { date: "2020-01-03", count: 0, amountCents: 0 },
  ],
  statuses: [{ status: "cancelled", count: 1 }],
  shops: [{ shopId: "s", shopName: "QA Shop", count: 3, cancelled: 1, amountCents: 14000 }],
  refunds: [{ state: "processed", count: 1, amountCents: 500 }],
};
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdminReports />
    </QueryClientProvider>,
  );
}
it("formats integer paise and keeps booked value, cash, captures and refund cohort distinct", async () => {
  vi.mocked(adminReports.get).mockResolvedValue(data);
  mount();
  await screen.findByText("₹50");
  expect(screen.getByText("₹120")).toBeInTheDocument();
  expect(screen.getByText("₹5")).toBeInTheDocument();
  expect(screen.getByText(/not realised revenue/)).toBeInTheDocument();
  expect(screen.getByText(/not a processed-date report/)).toBeInTheDocument();
  expect(screen.getByText("QA Shop")).toBeInTheDocument();
});
it("submits date ranges and retains them on failed requests without stale metric claims", async () => {
  vi.mocked(adminReports.get).mockRejectedValue(new Error("Invalid report range"));
  mount();
  await screen.findByRole("alert");
  fireEvent.change(screen.getByLabelText("From date (IST)"), { target: { value: "2020-01-01" } });
  fireEvent.change(screen.getByLabelText("To date (IST)"), { target: { value: "2020-01-03" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply dates" }));
  await waitFor(() =>
    expect(adminReports.get).toHaveBeenCalledWith({ from: "2020-01-01", to: "2020-01-03" }),
  );
  expect(screen.getByLabelText("From date (IST)")).toHaveValue("2020-01-01");
  expect(screen.queryByRole("region", { name: "Report metrics" })).toBeNull();
});
it("shows real empty-report state and daily accessible data without invented activity", async () => {
  vi.mocked(adminReports.get).mockResolvedValue({
    ...data,
    orders: { count: 0, amountCents: 0 },
    shops: [],
    statuses: [],
    refunds: [],
    daily: [{ date: "2020-01-01", count: 0, amountCents: 0 }],
  });
  mount();
  await screen.findByText("No live orders were created in this range.");
  expect(screen.getByText("View daily data table")).toBeInTheDocument();
  expect(screen.getByText("No matching shop activity.")).toBeInTheDocument();
});
