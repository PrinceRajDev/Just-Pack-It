import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order, SubOrder } from "@/domain/types";
import { GpsAddressConfirmation } from "@/components/store/GpsAddressConfirmation";
import { BuyerCancellation } from "@/components/store/BuyerCancellation";
import { PasswordRecovery } from "@/components/auth/PasswordRecovery";
import { OperationsDashboard } from "@/components/portal/OperationsDashboard";
import { savedAddresses } from "@/services/addresses";
import { orders } from "@/services/orders";
import { authentication } from "@/services/auth";
import { operationsSummary } from "@/services/operations";
import { adminWorkspace } from "@/services/admin-workspace";
import { overviewHealth } from "@/services/overview-health";
vi.mock("@/stores/auth", () => ({
  useAuth: () => ({ session: { userId: "buyer", role: "buyer" } }),
}));
vi.mock("@/services/addresses", () => ({ savedAddresses: { create: vi.fn() } }));
vi.mock("@/services/orders", () => ({ orders: { cancel: vi.fn() } }));
vi.mock("@/services/auth", () => ({
  authentication: { requestPasswordReset: vi.fn(), resetPassword: vi.fn() },
}));
vi.mock("@/services/operations", () => ({ operationsSummary: vi.fn() }));
vi.mock("@/services/admin-workspace", () => ({ adminWorkspace: { audit: vi.fn() } }));
vi.mock("@/services/overview-health", () => ({
  overviewHealth: { api: vi.fn(), database: vi.fn() },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: ReactNode;
    "aria-label"?: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(adminWorkspace.audit).mockResolvedValue({ items: [] });
  vi.mocked(overviewHealth.api).mockResolvedValue({ status: "ok" });
  vi.mocked(overviewHealth.database).mockResolvedValue({ status: "ready" });
});
function mount(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return client;
}
const sub = {
  id: "sub",
  shopId: "shop",
  shopName: "Test shop",
  status: "accepted",
  version: 1,
  fulfilment: "pickup",
  deliveryFee: 0,
  lines: [],
} as SubOrder;
const order = {
  id: "order",
  paymentMethod: "cod",
  paymentStatus: "unpaid",
  subOrders: [sub],
} as Order;
it("requires explicit address confirmation and never silently saves GPS as an address", async () => {
  vi.mocked(savedAddresses.create).mockResolvedValue({
    id: "address",
    version: 0,
    label: "Home",
    line1: "Lane by school",
    locality: "Test",
    city: "Test city",
    pincode: "999999",
  });
  const client = mount(
    <GpsAddressConfirmation
      area={{ id: "area", name: "Test", city: "Test city", pincodes: ["999999"], active: true }}
    />,
  );
  expect(savedAddresses.create).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Confirm and save address" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Address label"), { target: { value: "Home" } });
  fireEvent.change(screen.getByLabelText("House, street and landmark"), {
    target: { value: "Lane by school" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Confirm and save address" }));
  await waitFor(() => expect(savedAddresses.create).toHaveBeenCalledTimes(1));
  expect(vi.mocked(savedAddresses.create).mock.calls[0][0]).toEqual({
    label: "Home",
    line1: "Lane by school",
    locality: "Test",
    city: "Test city",
    pincode: "999999",
  });
  client.clear();
});
it("keeps an already-prompted GPS address sheet closed when browsing to another route", () => {
  const client = mount(
    <GpsAddressConfirmation
      autoOpen={false}
      area={{ id: "area", name: "Test", city: "Test city", pincodes: ["999999"], active: true }}
    />,
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Confirm delivery address" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  client.clear();
});
it("cancels only the selected shop with version/reason and explicit consent", async () => {
  vi.mocked(orders.cancel).mockResolvedValue();
  const client = mount(<BuyerCancellation order={order} sub={sub} />);
  fireEvent.click(screen.getByRole("button", { name: "Cancel this shop’s items" }));
  expect(screen.getByRole("button", { name: "Confirm shop cancellation" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Cancellation reason"), {
    target: { value: "Changed plans" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Confirm shop cancellation" }));
  await waitFor(() =>
    expect(orders.cancel).toHaveBeenCalledWith("order", "sub", 1, "Changed plans"),
  );
  client.clear();
});
it("does not offer self-service cancellation after preparation or before online capture", () => {
  const client = mount(<BuyerCancellation order={order} sub={{ ...sub, status: "preparing" }} />);
  expect(
    screen.queryByRole("button", { name: "Cancel this shop’s items" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/closes when preparation starts/)).toBeInTheDocument();
  client.clear();
});
it("does not claim a refund is bank-credited when cancelling prepaid items", () => {
  const client = mount(
    <BuyerCancellation
      order={{ ...order, paymentMethod: "razorpay", paymentStatus: "paid" }}
      sub={sub}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel this shop’s items" }));
  expect(screen.getByText(/does not confirm money returned/)).toBeInTheDocument();
  client.clear();
});
it("keeps recovery unavailable when the email provider is not configured", async () => {
  vi.mocked(authentication.requestPasswordReset).mockRejectedValue(
    new Error("Email verification is not configured yet"),
  );
  const client = mount(<PasswordRecovery onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("Verified email address"), {
    target: { value: "buyer@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Request recovery code" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("not configured");
  expect(screen.queryByLabelText("Six-digit recovery code")).not.toBeInTheDocument();
  client.clear();
});
it("resets only with a recovery code and matching new passwords", async () => {
  vi.mocked(authentication.requestPasswordReset).mockResolvedValue({
    challengeId: "challenge",
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    resendAfterSeconds: 60,
  });
  vi.mocked(authentication.resetPassword).mockResolvedValue();
  const client = mount(<PasswordRecovery onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("Verified email address"), {
    target: { value: "buyer@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Request recovery code" }));
  fireEvent.change(await screen.findByLabelText("Six-digit recovery code"), {
    target: { value: "123456" },
  });
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: "New-test-password-2026" },
  });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: "Wrong-password" },
  });
  expect(
    screen.getByRole("button", { name: "Reset password and sign out devices" }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: "New-test-password-2026" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Reset password and sign out devices" }));
  expect(await screen.findByText(/Password reset complete/)).toBeInTheDocument();
  expect(authentication.resetPassword).toHaveBeenCalledWith({
    email: "buyer@example.test",
    emailChallengeId: "challenge",
    emailOtp: "123456",
    newPassword: "New-test-password-2026",
  });
  client.clear();
});
it("shows database-backed admin queues with honest empty states and review links", async () => {
  vi.mocked(operationsSummary).mockResolvedValue({
    asOf: new Date().toISOString(),
    thresholds: { orderStaleMinutes: 60, paymentPendingMinutes: 30, refundPendingHours: 24 },
    support: {
      count: 1,
      items: [
        {
          id: "ticket",
          orderId: "order",
          shopName: "Support shop",
          status: "open",
          createdAt: new Date().toISOString(),
        },
      ],
    },
    pendingShops: { count: 1, items: [{ id: "shop", name: "Test shop" }] },
    staleSuborders: { count: 0, items: [] },
    payments: { count: 0, items: [] },
    refunds: { count: 0, items: [] },
  });
  const client = mount(<OperationsDashboard />);
  expect(await screen.findByRole("heading", { name: "Needs attention" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Test shop → Review" })).toHaveAttribute(
    "href",
    "/admin/partners",
  );
  expect(screen.getAllByText("No items currently flagged.")).toHaveLength(3);
  expect(
    screen.getByRole("link", { name: "Support shop · open · Order order → Review" }),
  ).toHaveAttribute("href", "/admin/support");
  client.clear();
});

it("does not invent a zero support count when an older backend omits the queue", async () => {
  vi.mocked(operationsSummary).mockResolvedValue({
    asOf: new Date().toISOString(),
    thresholds: { orderStaleMinutes: 60, paymentPendingMinutes: 30, refundPendingHours: 24 },
    pendingShops: { count: 0, items: [] },
    staleSuborders: { count: 0, items: [] },
    payments: { count: 0, items: [] },
    refunds: { count: 0, items: [] },
  });
  const client = mount(<OperationsDashboard />);
  expect(await screen.findByText(/Support queue counts are unavailable/)).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Support attention: Unavailable. Open workspace" }),
  ).toBeInTheDocument();
  client.clear();
});
