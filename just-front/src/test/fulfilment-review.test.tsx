import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AddressDeliveryReview } from "@/components/store/AddressDeliveryReview";
import { savedAddresses } from "@/services/addresses";
import { reviewFulfilment } from "@/services/fulfilment";
import type { Shop } from "@/domain/types";
const state = vi.hoisted(() => ({ session: { userId: "buyer" } as { userId: string } | null }));
vi.mock("@/stores/auth", () => ({ useAuth: () => ({ ready: true, session: state.session }) }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/services/addresses", () => ({ savedAddresses: { list: vi.fn() } }));
vi.mock("@/services/fulfilment", () => ({ reviewFulfilment: vi.fn() }));
vi.mock("@/components/store/CheckoutReviewPanel", () => ({
  CheckoutReviewPanel: () => <p>Full selection review mounted</p>,
}));
const address = {
  id: "a",
  version: 2,
  label: "Home",
  line1: "Street",
  locality: "Test locality",
  city: "Test locality",
  pincode: "999999",
};
const shops = [{ id: "s", name: "Own shop" }] as Shop[];
function mount(selectable = false) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AddressDeliveryReview
        shops={shops}
        lines={selectable ? [{ productId: "p", qty: 1 }] : []}
        areaId={selectable ? "area" : undefined}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  state.session = { userId: "buyer" };
  vi.mocked(savedAddresses.list).mockResolvedValue([address]);
});
afterEach(cleanup);
it("opens full review only after an explicit eligible method selection", async () => {
  vi.mocked(reviewFulfilment).mockResolvedValue({
    checkedAt: "now",
    addressId: "a",
    addressVersion: 2,
    checkoutAvailable: false,
    reserved: false,
    shops: [
      {
        shopId: "s",
        issues: [],
        options: [
          { method: "pickup", status: "eligible", listedFee: 0, message: "Collect" },
          {
            method: "platform_delivery",
            status: "unverified",
            listedFee: null,
            message: "No capacity verification",
          },
        ],
      },
    ],
  });
  mount(true);
  fireEvent.click(await screen.findByRole("radio"));
  const pickup = await screen.findByRole("radio", { name: /Choose Store pickup/ });
  expect(screen.queryByText("Full selection review mounted")).toBeNull();
  expect(screen.getByRole("radio", { name: /Choose Just Pack It rider/ })).toBeDisabled();
  fireEvent.click(pickup);
  expect(await screen.findByText("Full selection review mounted")).toBeInTheDocument();
});
it("prompts sign-in without reading private addresses", () => {
  state.session = null;
  mount();
  expect(screen.getByText("Sign in to check your address")).toBeInTheDocument();
  expect(savedAddresses.list).not.toHaveBeenCalled();
});
it("checks only after explicit address selection and distinguishes unknown delivery from pickup", async () => {
  vi.mocked(reviewFulfilment).mockResolvedValue({
    checkedAt: "now",
    addressId: "a",
    addressVersion: 2,
    checkoutAvailable: false,
    reserved: false,
    shops: [
      {
        shopId: "s",
        issues: [],
        options: [
          { method: "pickup", status: "eligible", listedFee: 0, message: "Collect at shop" },
          {
            method: "platform_delivery",
            status: "unverified",
            listedFee: null,
            message: "Rider not verified",
          },
        ],
      },
    ],
  });
  mount();
  const choice = await screen.findByRole("radio");
  expect(reviewFulfilment).not.toHaveBeenCalled();
  fireEvent.click(choice);
  await screen.findByText("Rider not verified");
  expect(screen.getByText("Pickup delivery charge: ₹0")).toBeInTheDocument();
  expect(reviewFulfilment).toHaveBeenCalledWith("a", ["s"], expect.any(AbortSignal));
});
it("hides results when the saved address version has changed", async () => {
  vi.mocked(reviewFulfilment).mockResolvedValue({
    checkedAt: "now",
    addressId: "a",
    addressVersion: 3,
    checkoutAvailable: false,
    reserved: false,
    shops: [],
  });
  mount();
  fireEvent.click(await screen.findByRole("radio"));
  expect(await screen.findByText(/Your address changed elsewhere/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Refresh delivery check" })).toBeNull();
});
it("shows retry when delivery verification fails without claiming availability", async () => {
  vi.mocked(reviewFulfilment).mockRejectedValue(new Error("Network"));
  mount();
  fireEvent.click(await screen.findByRole("radio"));
  expect(await screen.findByRole("button", { name: "Retry delivery check" })).toBeInTheDocument();
  expect(screen.queryByText(/Configured checks passed/)).toBeNull();
});
