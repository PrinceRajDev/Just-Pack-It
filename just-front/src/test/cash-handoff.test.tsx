import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BuyerReceiptCode } from "@/components/store/BuyerReceiptCode";
import { SellerCashHandoff } from "@/components/portal/SellerCashHandoff";
import { receipts } from "@/services/receipts";
import { ApiError } from "@/lib/api/client";
import type { SellerSuborder } from "@/domain/seller-orders";
vi.mock("@/services/receipts", () => ({ receipts: { issue: vi.fn(), complete: vi.fn() } }));
const proof = () => ({
  code: "123456",
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 5000).toISOString(),
  amount: 25,
});
const sub = {
  id: "sub",
  orderId: "order",
  version: 3,
  status: "ready",
  amountDue: 25,
} as SellerSuborder;
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function buyer() {
  render(<BuyerReceiptCode orderId="order" subId="sub" version={3} amount={25} />);
}
function seller() {
  const saved = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SellerCashHandoff sub={sub} onSaved={saved} />
    </QueryClientProvider>,
  );
  return saved;
}
function acknowledge() {
  for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
}
it("prepaid receipt requires goods acknowledgement without asking for a second cash payment", async () => {
  vi.mocked(receipts.issue).mockResolvedValue(proof());
  render(<BuyerReceiptCode orderId="order" subId="sub" version={3} amount={0} prepaid />);
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  expect(screen.getByText(/do not pay cash again/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Generate receipt code" }));
  await screen.findByLabelText("One-time receipt code");
  expect(receipts.issue).toHaveBeenCalledWith("order", "sub", 3, true);
});
it("requires both buyer acknowledgements and only displays a server-issued in-memory code", async () => {
  vi.mocked(receipts.issue).mockResolvedValue(proof());
  buyer();
  const button = screen.getByRole("button", { name: "Generate receipt code" });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getAllByRole("checkbox")[0]);
  expect(button).toBeDisabled();
  fireEvent.click(screen.getAllByRole("checkbox")[1]);
  fireEvent.click(button);
  await screen.findByLabelText("One-time receipt code");
  expect(receipts.issue).toHaveBeenCalledWith("order", "sub", 3, false);
  expect(localStorage.length).toBe(0);
  expect(screen.getByText(/Seller confirmation is pending/)).toBeInTheDocument();
});
it("hides an old code when a replacement request fails", async () => {
  vi.mocked(receipts.issue)
    .mockResolvedValueOnce(proof())
    .mockRejectedValueOnce(new Error("Wait 60 seconds"));
  buyer();
  acknowledge();
  fireEvent.click(screen.getByRole("button", { name: "Generate receipt code" }));
  await screen.findByLabelText("One-time receipt code");
  fireEvent.click(screen.getByRole("button", { name: "Generate replacement code" }));
  await screen.findByRole("alert");
  expect(screen.queryByLabelText("One-time receipt code")).toBeNull();
});
it("clears the displayed secret when its expiry is reached", async () => {
  vi.useFakeTimers();
  vi.mocked(receipts.issue).mockResolvedValue(proof());
  buyer();
  acknowledge();
  fireEvent.click(screen.getByRole("button", { name: "Generate receipt code" }));
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByLabelText("One-time receipt code")).toHaveTextContent("123456");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5001);
  });
  expect(screen.queryByLabelText("One-time receipt code")).toBeNull();
  expect(screen.getByText(/The code expired/)).toBeInTheDocument();
});
it("requires a six-digit code and actual cash acknowledgement before completion", async () => {
  vi.mocked(receipts.complete).mockResolvedValue({ ...sub, status: "delivered", version: 4 });
  const saved = seller();
  const button = screen.getByRole("button", { name: "Confirm handoff & record cash" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Buyer's six-digit receipt code"), {
    target: { value: "123456" },
  });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(button);
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(receipts.complete).toHaveBeenCalledWith(sub, "123456");
});
it("allows correcting a wrong code but locks uncertain responses until refresh", async () => {
  vi.mocked(receipts.complete)
    .mockRejectedValueOnce(new ApiError("Wrong code", 400, "INVALID_RECEIPT_CODE"))
    .mockRejectedValueOnce(new Error("Unknown outcome"));
  seller();
  fireEvent.change(screen.getByLabelText("Buyer's six-digit receipt code"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Confirm handoff & record cash" }));
  await screen.findByRole("alert");
  fireEvent.change(screen.getByLabelText("Buyer's six-digit receipt code"), {
    target: { value: "654321" },
  });
  expect(screen.getByRole("button", { name: "Confirm handoff & record cash" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm handoff & record cash" }));
  await screen.findByText(/Unknown outcome/);
  expect(screen.getByLabelText("Buyer's six-digit receipt code")).toBeDisabled();
});
