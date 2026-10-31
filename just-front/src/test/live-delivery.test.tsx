import { it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LiveDelivery } from "@/components/portal/LiveDelivery";
import { delivery } from "@/services/delivery";
import type { LiveDeliveryTask } from "@/domain/live-delivery";
import type { ReactNode } from "react";
vi.mock("@/stores/auth", () => ({
  useAuth: () => ({ session: { userId: "partner", name: "TEST PARTNER" }, signOut: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useRouterState: () => "/delivery",
}));
vi.mock("@/services/delivery", () => ({
  delivery: {
    profile: vi.fn(),
    availability: vi.fn(),
    active: vi.fn(),
    available: vi.fn(),
    claim: vi.fn(),
    dispatch: vi.fn(),
    complete: vi.fn(),
    contact: vi.fn(),
    report: vi.fn(),
  },
}));
const task: LiveDeliveryTask = {
  id: "task",
  orderId: "order",
  version: 3,
  shopName: "TEST SHOP",
  status: "out_for_delivery",
  itemCount: 1,
  paymentMethod: "cod",
  amountToCollect: 12,
  pickup: "TEST PICKUP",
  drop: { label: "TEST", line1: "TEST DROP", locality: "TEST", city: "TEST", pincode: "999999" },
};
function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LiveDelivery />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.mocked(delivery.available).mockResolvedValue({ items: [], next: null });
  vi.mocked(delivery.availability).mockResolvedValue({ online: true });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("requires approval without showing fake tasks or payouts", async () => {
  vi.mocked(delivery.profile).mockResolvedValue(null);
  vi.mocked(delivery.active).mockResolvedValue(null);
  mount();
  await screen.findByText(/Admin must approve/);
  expect(delivery.available).not.toHaveBeenCalled();
  expect(screen.queryByText("Approved")).toBeNull();
});
it("claims only on explicit action and keeps private addresses out of available cards", async () => {
  vi.mocked(delivery.profile).mockResolvedValue({
    approved: true,
    online: true,
    areaIds: ["area"],
    version: 1,
  });
  vi.mocked(delivery.active).mockResolvedValue(null);
  vi.mocked(delivery.available).mockResolvedValue({
    items: [{ ...task, status: "available", pickup: undefined, drop: undefined }],
    next: null,
  });
  vi.mocked(delivery.claim).mockRejectedValue(new Error("Task already claimed"));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Claim task" }));
  await screen.findByText("Task already claimed");
  expect(delivery.claim).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/TEST DROP/)).toBeNull();
});
it("requires buyer code and exact cash acknowledgement before completion", async () => {
  vi.mocked(delivery.profile).mockResolvedValue({
    approved: true,
    online: true,
    areaIds: ["area"],
    version: 1,
  });
  vi.mocked(delivery.active).mockResolvedValue(task);
  vi.mocked(delivery.complete).mockResolvedValue({ saved: true });
  mount();
  const button = await screen.findByRole("button", { name: "Verify code and complete" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Buyer receipt code"), { target: { value: "123456" } });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(button);
  await waitFor(() => expect(delivery.complete).toHaveBeenCalledWith(task, "123456"));
  expect(screen.getByText(/Cash acknowledgement is not bank settlement/)).toBeInTheDocument();
});
it("claimed task waits for seller pickup, contact requires explicit request", async () => {
  vi.mocked(delivery.profile).mockResolvedValue({
    approved: true,
    online: true,
    areaIds: ["area"],
    version: 1,
  });
  vi.mocked(delivery.active).mockResolvedValue({ ...task, status: "claimed" });
  vi.mocked(delivery.contact).mockResolvedValue({ buyer: "+919876543210", shop: null });
  mount();
  await screen.findByText(/Ask the shop to verify/);
  expect(screen.queryByRole("button", { name: "Start delivery" })).toBeNull();
  expect(delivery.contact).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Show contact numbers" }));
  expect(await screen.findByRole("link", { name: "Call buyer" })).toHaveAttribute(
    "href",
    "tel:+919876543210",
  );
});
