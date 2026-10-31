import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminOrders } from "@/components/portal/AdminOrders";
import { listAdminOrders } from "@/services/admin-orders";
vi.mock("@/services/admin-orders", () => ({ listAdminOrders: vi.fn() }));
vi.mock("@/components/portal/PortalShell", () => ({
  PortalHeader: ({ title, sub }: { title: string; sub: string }) => (
    <>
      <h1>{title}</h1>
      <p>{sub}</p>
    </>
  ),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdminOrders />
    </QueryClientProvider>,
  );
}
it("keeps cash reports read-only and resets the cursor when changing filters", async () => {
  vi.mocked(listAdminOrders).mockResolvedValue({ orders: [], next: "page-two" });
  mount();
  await screen.findByText("No matching orders");
  expect(screen.getByText(/neither implies seller settlement/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await waitFor(() => expect(listAdminOrders).toHaveBeenCalledWith("all", "page-two", undefined));
  fireEvent.change(screen.getByRole("combobox", { name: "Cash filter" }), {
    target: { value: "outstanding" },
  });
  await waitFor(() =>
    expect(listAdminOrders).toHaveBeenCalledWith("outstanding", undefined, undefined),
  );
  expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: /paid|settle/i })).not.toBeInTheDocument();
});
it("shows load errors and allows retry", async () => {
  vi.mocked(listAdminOrders)
    .mockRejectedValueOnce(new Error("Server unavailable"))
    .mockResolvedValue({ orders: [], next: undefined });
  mount();
  await screen.findByText("Server unavailable");
  fireEvent.click(screen.getByRole("button", { name: /try again/i }));
  await screen.findByText("No matching orders");
});

it("validates exact IDs, resets pagination and cash filters, and clears lookup", async () => {
  vi.mocked(listAdminOrders).mockResolvedValue({ orders: [], next: "next" });
  mount();
  await screen.findByText("No matching orders");
  fireEvent.change(screen.getByLabelText("Find an order by ID"), { target: { value: "bad" } });
  fireEvent.click(screen.getByRole("button", { name: "Find order" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Enter the full Order ID");
  expect(listAdminOrders).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole("combobox", { name: "Cash filter" }), {
    target: { value: "recorded" },
  });
  await waitFor(() =>
    expect(listAdminOrders).toHaveBeenCalledWith("recorded", undefined, undefined),
  );
  const id = "12345678-1234-4234-8234-123456789abc";
  fireEvent.change(screen.getByLabelText("Find an order by ID"), {
    target: { value: ` ${id.toUpperCase()} ` },
  });
  fireEvent.click(screen.getByRole("button", { name: "Find order" }));
  await waitFor(() => expect(listAdminOrders).toHaveBeenCalledWith("all", undefined, id));
  expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
  expect(screen.getByText(/No order matches this ID/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear lookup" }));
  expect(screen.getByLabelText("Find an order by ID")).toHaveValue("");
  expect(screen.queryByText(/Looking up order/)).toBeNull();
});

it("loads the exact order from navigation and reports cleared lookup to its URL owner", async () => {
  vi.mocked(listAdminOrders).mockResolvedValue({ orders: [], next: undefined });
  const id = "12345678-1234-4234-8234-123456789abc",
    onLookup = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdminOrders initialOrderId={id} onLookup={onLookup} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(listAdminOrders).toHaveBeenCalledWith("all", undefined, id));
  expect(screen.getByLabelText("Find an order by ID")).toHaveValue(id);
  fireEvent.click(screen.getByRole("button", { name: "Clear lookup" }));
  expect(onLookup).toHaveBeenCalledWith(undefined);
});

it("keeps unsupported metrics unavailable and shows platform delivery details without a cash-success claim", async () => {
  vi.mocked(listAdminOrders).mockResolvedValue({
    orders: [
      {
        id: "12345678-1234-4234-8234-123456789abc",
        createdAt: "2026-10-31T07:00:00Z",
        paymentMethod: "cod",
        paymentStatus: "unpaid",
        total: 25,
        amountDue: 25,
        cashRecordedAmount: 0,
        cancelledAmount: 0,
        subOrders: [
          {
            id: "sub",
            shopId: "s",
            shopName: "Actual shop",
            status: "ready",
            fulfilment: "platform_delivery",
            amountDue: 25,
          },
        ],
      },
    ],
    next: undefined,
  });
  mount();
  await screen.findAllByText("Actual shop");
  expect(screen.getAllByText("Reporting unavailable")).toHaveLength(4);
  fireEvent.click(screen.getAllByRole("button", { name: "View details" })[0]);
  await screen.findByRole("dialog");
  expect(screen.getByText(/platform delivery/)).toBeInTheDocument();
  expect(screen.getByText(/Customer identity\/address/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Mark paid|Settle|Cancel order/ }),
  ).not.toBeInTheDocument();
});
