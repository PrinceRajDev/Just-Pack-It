import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { OperationsDashboard } from "@/components/portal/OperationsDashboard";
import { operationsSummary } from "@/services/operations";
import { adminWorkspace } from "@/services/admin-workspace";
import { overviewHealth } from "@/services/overview-health";
vi.mock("@/stores/auth", () => ({
  useAuth: () => ({ session: { name: "Test Administrator", role: "admin", userId: "admin" } }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, hash, children, ...props }: { to: string; hash?: string; children: ReactNode }) => (
    <a href={to + (hash ? "#" + hash : "")} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/services/operations", () => ({ operationsSummary: vi.fn() }));
vi.mock("@/services/admin-workspace", () => ({ adminWorkspace: { audit: vi.fn() } }));
vi.mock("@/services/overview-health", () => ({
  overviewHealth: { api: vi.fn(), database: vi.fn() },
}));
const summary = {
  asOf: "2026-10-31T07:00:00Z",
  thresholds: { orderStaleMinutes: 60, paymentPendingMinutes: 30, refundPendingHours: 24 },
  pendingShops: { count: 2, items: [] },
  support: { count: 1, items: [] },
  staleSuborders: { count: 3, items: [] },
  payments: { count: 4, items: [] },
  refunds: { count: 5, items: [] },
};
const clients: QueryClient[] = [];
function mount() {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(c);
  render(
    <QueryClientProvider client={c}>
      <OperationsDashboard />
    </QueryClientProvider>,
  );
  return c;
}
beforeEach(() => {
  vi.mocked(operationsSummary).mockResolvedValue(summary);
  vi.mocked(adminWorkspace.audit).mockResolvedValue({
    items: [
      {
        id: "action1",
        actorId: "admin",
        role: "admin",
        action: "product.block",
        targetId: "product-id",
        createdAt: summary.asOf,
      },
      {
        id: "action2",
        actorId: "admin",
        role: "admin",
        action: "support.reply",
        targetId: "ticket-id",
        createdAt: summary.asOf,
      },
    ],
  });
  vi.mocked(overviewHealth.api).mockResolvedValue({ status: "ok" });
  vi.mocked(overviewHealth.database).mockResolvedValue({ status: "ready" });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.resetAllMocks();
});
it("preserves server attention counts and marks unsupported performance reporting unavailable", async () => {
  mount();
  await screen.findByRole("link", { name: "Shop approvals: 2. Open workspace" });
  expect(screen.getByRole("link", { name: "Orders to check: 3. Open workspace" })).toHaveAttribute(
    "href",
    "/admin/orders",
  );
  expect(
    screen.getByRole("link", { name: "Payment attention: 4. Open workspace" }),
  ).toHaveAttribute("href", "/admin/finance");
  expect(screen.getByText("5 refund records also need review.")).toBeInTheDocument();
  expect(screen.getAllByText("Reporting unavailable")).toHaveLength(5);
  expect(screen.queryByText("₹0")).not.toBeInTheDocument();
  expect(screen.getByText(/Welcome back, Test Administrator/)).toBeInTheDocument();
});
it("filters only actual audit records and shows honest empty tabs", async () => {
  mount();
  await screen.findByText("product block");
  expect(screen.getByText("support reply")).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Catalogue" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(screen.getByText("product block")).toBeInTheDocument();
  expect(screen.queryByText("support reply")).not.toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Payments" }), { button: 0, ctrlKey: false });
  expect(screen.getByText(/No payments actions in the latest audit page/)).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /View audit log/ })[0]).toHaveAttribute(
    "href",
    "/admin/settings#admin-audit-log",
  );
});
it("keeps overall health incomplete when external services are not checked and refreshes real queries", async () => {
  mount();
  await screen.findByText("Connected");
  expect(screen.getByText("Responding")).toBeInTheDocument();
  expect(screen.getByText("Checks incomplete")).toBeInTheDocument();
  expect(screen.queryByText("All systems operational")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh data" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
  await waitFor(() => expect(operationsSummary).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(adminWorkspace.audit).toHaveBeenCalledTimes(2));
  expect(overviewHealth.api).toHaveBeenCalledTimes(2);
  expect(overviewHealth.database).toHaveBeenCalledTimes(2);
});
it("provides retry without fabricating zero queues when operations fails", async () => {
  vi.mocked(operationsSummary).mockRejectedValue(new Error("Offline"));
  vi.mocked(overviewHealth.database).mockRejectedValue(new Error("Not ready"));
  mount();
  await screen.findByText("Could not load operations queues.");
  expect(
    screen.getByRole("link", { name: "Shop approvals: Unavailable. Open workspace" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Check unavailable")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry operations" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Retry health checks" })).toBeEnabled();
});
it("keeps demo totals explicitly labelled and never fetches live metrics or health", () => {
  const c = new QueryClient();
  clients.push(c);
  render(
    <QueryClientProvider client={c}>
      <OperationsDashboard preview={{ shops: 7, products: 19, summary }} />
    </QueryClientProvider>,
  );
  expect(screen.getByText("Demo preview · no live timestamp")).toBeInTheDocument();
  expect(screen.getAllByText("From demo records")).toHaveLength(2);
  expect(screen.getAllByText("Reporting unavailable")).toHaveLength(3);
  expect(
    screen.getByRole("link", { name: "Payment attention: Unavailable. Open workspace" }),
  ).toBeInTheDocument();
  expect(operationsSummary).not.toHaveBeenCalled();
  expect(adminWorkspace.audit).not.toHaveBeenCalled();
  expect(overviewHealth.api).not.toHaveBeenCalled();
  expect(overviewHealth.database).not.toHaveBeenCalled();
});
