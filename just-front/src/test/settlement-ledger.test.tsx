import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettlementLedger } from "@/components/portal/SettlementLedger";
import { settlements } from "@/services/settlements";
import type { SettlementRow } from "@/domain/settlements";
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/stores/auth", () => ({
  useAuth: () => ({ session: { userId: "test", role: auth.role } }),
}));
vi.mock("@/services/settlements", () => ({
  settlements: {
    list: vi.fn(),
    post: vi.fn(),
    submitCash: vi.fn(),
    receiveCash: vi.fn(),
    prepare: vi.fn(),
    record: vi.fn(),
    journals: vi.fn(),
  },
}));
const row: SettlementRow = {
  id: "source",
  orderId: "order",
  shopId: "shop",
  shopName: "TEST SHOP",
  orderVersion: 4,
  policy: "zero_commission_v1",
  proofValid: true,
  posted: true,
  grossAmount: 12,
  sellerEntitlement: 10,
  platformDeliveryFee: 2,
  sellerRetained: 0,
  payoutAmount: 10,
  partnerCollection: 12,
  holdReason: "Full partner cash handover has not been acknowledged by admin.",
  remittance: null,
  payout: null,
};
function mount(value: SettlementRow, adminLayout = false) {
  vi.mocked(settlements.list).mockResolvedValue({ items: [value] });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SettlementLedger adminLayout={adminLayout} />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  auth.role = "admin";
});
it("seller empty statement keeps lookup validation, refresh and failure feedback", async () => {
  auth.role = "seller";
  vi.mocked(settlements.list).mockResolvedValue({ items: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SettlementLedger />
    </QueryClientProvider>,
  );
  expect(
    screen.getByRole("status", { name: "Loading delivered order settlements" }),
  ).toBeInTheDocument();
  await screen.findByRole("heading", { name: "No settlement records found" });
  expect(
    screen.getByRole("heading", { name: "Your seller settlement statement", level: 1 }),
  ).toBeInTheDocument();
  const input = screen.getByLabelText("Shop-order part ID (optional)");
  fireEvent.change(input, { target: { value: "not-a-uuid" } });
  expect(screen.getByRole("button", { name: "Find settlement record" })).toBeDisabled();
  const id = "00000000-0000-4000-8000-000000000001";
  fireEvent.change(input, { target: { value: id } });
  fireEvent.click(screen.getByRole("button", { name: "Find settlement record" }));
  await waitFor(() => expect(settlements.list).toHaveBeenCalledWith({ suborderId: id }, undefined));
  await screen.findByRole("heading", { name: "No settlement records found" });
  vi.mocked(settlements.list).mockRejectedValue(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh settlement ledger" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not refresh the ledger");
  expect(
    screen.queryByRole("button", { name: "Prepare manual payout intent" }),
  ).not.toBeInTheDocument();
  client.clear();
});
it("partner must acknowledge actual full cash handover, not earnings", async () => {
  auth.role = "delivery";
  vi.mocked(settlements.submitCash).mockResolvedValue({});
  mount(row);
  const button = await screen.findByRole("button", {
    name: "Submit cash handover acknowledgement",
  });
  expect(button).toBeDisabled();
  expect(screen.getByText(/not your earnings/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(button);
  await waitFor(() => expect(settlements.submitCash).toHaveBeenCalledWith(row));
  expect(settlements.prepare).not.toHaveBeenCalled();
});
it("admin receipt requires a reference and actual cash receipt confirmation", async () => {
  vi.mocked(settlements.receiveCash).mockResolvedValue({});
  const value = {
    ...row,
    remittance: { state: "submitted" as const, version: 0, submittedAt: "2026-10-31T10:00:00Z" },
  };
  mount(value);
  const button = await screen.findByRole("button", { name: "Record actual cash receipt" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Unique cash receipt reference"), {
    target: { value: "TEST-RECEIPT-001" },
  });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(button);
  await waitFor(() =>
    expect(settlements.receiveCash).toHaveBeenCalledWith(value, "TEST-RECEIPT-001"),
  );
  expect(screen.queryByRole("button", { name: "Prepare manual payout intent" })).toBeNull();
});
it("a pending payout is recovered, never replaced after an uncertain record response", async () => {
  const value = {
    ...row,
    partnerCollection: 0,
    holdReason: null,
    payout: { state: "prepared" as const, version: 0, preparedAt: "2026-10-31T10:00:00Z" },
  };
  vi.mocked(settlements.record).mockRejectedValue(new Error("Confirmation uncertain"));
  mount(value);
  const button = await screen.findByRole("button", { name: "Record completed manual payout" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Unique bank/UPI transaction reference"), {
    target: { value: "TEST-UTR-001" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(button);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Do not hand over cash or transfer money twice",
  );
  expect(screen.getByLabelText("Unique bank/UPI transaction reference")).toHaveValue(
    "TEST-UTR-001",
  );
  expect(settlements.prepare).not.toHaveBeenCalled();
});
it("seller-retained cash never offers a second payout or admin write action", async () => {
  auth.role = "seller";
  mount({
    ...row,
    partnerCollection: 0,
    sellerEntitlement: 12,
    sellerRetained: 12,
    payoutAmount: 0,
    holdReason: "Seller already retained this COD; no second payout is due.",
  });
  await screen.findByText(/Seller already retained/);
  expect(
    screen.queryByRole("button", { name: /Prepare manual payout|Record actual|Review proofs/ }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "View journal entries" })).toBeNull();
});
it("admin journal view displays balanced integer-paise entries", async () => {
  vi.mocked(settlements.journals).mockResolvedValue([
    {
      id: "journal",
      kind: "collection",
      createdAt: "2026-10-31T10:00:00Z",
      entries: [
        { account: "cash:partner:test", deltaCents: 1200 },
        { account: "payable:seller:test", deltaCents: -1000 },
        { account: "revenue:platform_delivery", deltaCents: -200 },
      ],
    },
  ]);
  mount(row);
  fireEvent.click(await screen.findByRole("button", { name: "View journal entries" }));
  expect(await screen.findByText("Balanced sum: 0 paise")).toBeInTheDocument();
});

it("admin layout keeps cash receipt and manual payout separate and opens supported detail actions", async () => {
  mount({ ...row, grossAmount: null, sellerEntitlement: null, payoutAmount: null }, true);
  await screen.findByRole("button", { name: "View settlement details" });
  expect(screen.getByText("Proof incomplete")).toBeInTheDocument();
  expect(screen.getByText("No transfer recorded")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View settlement details" }));
  await screen.findByRole("dialog");
  expect(
    screen.getByText("Financial proof is incomplete; amounts are not assumed."),
  ).toBeInTheDocument();
  expect(settlements.post).not.toHaveBeenCalled();
  expect(settlements.record).not.toHaveBeenCalled();
});
it("admin ledger normalizes an exact UUID and clears the lookup through the existing API", async () => {
  mount(row, true);
  await screen.findByRole("button", { name: "View settlement details" });
  fireEvent.change(screen.getByLabelText("Shop-order part ID (optional)"), {
    target: { value: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Find settlement record" }));
  await waitFor(() =>
    expect(settlements.list).toHaveBeenLastCalledWith(
      { suborderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      undefined,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear ledger lookup" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Shop-order part ID (optional)")).toHaveValue(""),
  );
});
