import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { DeliveryException } from "@/domain/live-delivery";
import type { SellerSuborder } from "@/domain/seller-orders";
import { DeliveryExceptions } from "@/components/portal/DeliveryExceptions";
import { SellerReturnedGoods } from "@/components/portal/SellerReturnedGoods";
import { delivery } from "@/services/delivery";
vi.mock("@/services/delivery", () => ({
  delivery: { exceptions: vi.fn(), resolve: vi.fn(), returned: vi.fn() },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
const task: DeliveryException = {
  id: "task",
  orderId: "order",
  shopName: "TEST SHOP",
  version: 3,
  status: "ready",
  deliveryState: "claimed",
  partnerId: "partner",
  reason: "TEST partner has not arrived",
  financialReviewRequired: false,
  history: [],
};
function mount(child: ReactNode) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {child}
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("release requires reason and explicit goods-at-shop confirmation", async () => {
  vi.mocked(delivery.exceptions).mockResolvedValue({ items: [task] });
  vi.mocked(delivery.resolve).mockRejectedValue(new Error("Task changed; refresh"));
  mount(<DeliveryExceptions />);
  await screen.findByText("TEST SHOP · claimed");
  fireEvent.change(screen.getByLabelText("Resolution action"), { target: { value: "release" } });
  fireEvent.change(screen.getByLabelText("Resolution reason"), {
    target: { value: "TEST shop confirmed goods are still here" },
  });
  const button = screen.getByRole("button", { name: "Save delivery resolution" });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(button);
  await screen.findByRole("alert");
  expect(delivery.resolve).toHaveBeenCalledWith("task", {
    version: 3,
    action: "release",
    reason: "TEST shop confirmed goods are still here",
    confirmGoodsAtShop: true,
  });
  expect(screen.getByLabelText("Resolution reason")).toHaveValue(
    "TEST shop confirmed goods are still here",
  );
});
it("financial evidence blocks automated actions and returning tasks wait for seller", async () => {
  vi.mocked(delivery.exceptions).mockResolvedValue({
    items: [{ ...task, financialReviewRequired: true }],
  });
  mount(<DeliveryExceptions />);
  await screen.findByText(/Buyer receipt or cash acknowledgement exists/);
  expect(screen.queryByRole("button", { name: "Save delivery resolution" })).toBeNull();
  cleanup();
  vi.mocked(delivery.exceptions).mockResolvedValue({
    items: [{ ...task, deliveryState: "returning" }],
  });
  mount(<DeliveryExceptions />);
  await screen.findByText(/Waiting for the owning shop/);
  expect(screen.queryByRole("button", { name: "Save delivery resolution" })).toBeNull();
});
it("seller must acknowledge actual return and choose stock disposition", async () => {
  vi.mocked(delivery.returned).mockResolvedValue({ saved: true });
  const sub = {
    id: "task",
    orderId: "order",
    version: 5,
    delivery: { partnerId: "partner", state: "returning" },
  } as SellerSuborder;
  mount(<SellerReturnedGoods sub={sub} />);
  fireEvent.change(screen.getByLabelText("Return receipt note"), {
    target: { value: "TEST returned goods are not sellable" },
  });
  const button = screen.getByRole("button", {
    name: "Confirm returned goods and cancel this part",
  });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Sellable stock decision"), { target: { value: "no" } });
  fireEvent.click(button);
  await waitFor(() =>
    expect(delivery.returned).toHaveBeenCalledWith("order", "task", {
      version: 5,
      partnerId: "partner",
      confirmGoodsReceived: true,
      restock: false,
      reason: "TEST returned goods are not sellable",
    }),
  );
});
it("post-pickup tasks offer return, never pre-pickup release or cancellation", async () => {
  vi.mocked(delivery.exceptions).mockResolvedValue({
    items: [{ ...task, status: "out_for_delivery", deliveryState: "out_for_delivery" }],
  });
  mount(<DeliveryExceptions />);
  await screen.findByLabelText("Resolution action");
  expect(screen.queryByRole("option", { name: /Release for another partner/ })).toBeNull();
  expect(screen.queryByRole("option", { name: "Cancel before pickup" })).toBeNull();
  expect(screen.getByRole("option", { name: "Request return to shop" })).toBeInTheDocument();
});
