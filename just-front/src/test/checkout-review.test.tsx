import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CheckoutReviewPanel } from "@/components/store/CheckoutReviewPanel";
import { reviewCheckout, type CheckoutReview } from "@/services/checkout-review";
vi.mock("@/services/checkout-review", () => ({ reviewCheckout: vi.fn() }));
const response: CheckoutReview = {
  checkedAt: "now",
  areaId: "area",
  addressId: "address",
  addressVersion: 2,
  currency: "INR",
  reserved: false,
  checkoutAvailable: false,
  lines: [],
  shops: [],
  itemsSubtotal: 10.5,
  deliveryTotal: null,
  grandTotal: null,
  issues: [{ code: "FINAL_QUOTE_PENDING", message: "Final charges are not quoted." }],
  fulfilments: [],
};
vi.mock("@/components/store/CodOrderAction", () => ({
  CodOrderAction: () => <button>Place reviewed order</button>,
}));
function mount(compact = false) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CheckoutReviewPanel
        compact={compact}
        userId="buyer"
        areaId="area"
        addressId="address"
        addressVersion={2}
        lines={[{ productId: "p", qty: 1 }]}
        fulfilments={[{ shopId: "s", method: "pickup" }]}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
it("shows server prices and blockers without offering order submission", async () => {
  vi.mocked(reviewCheckout).mockResolvedValue(response);
  mount();
  await screen.findByText("Items: ₹10.5");
  expect(screen.getByText("Final charges are not quoted.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ordering is not available yet" })).toBeDisabled();
  expect(reviewCheckout).toHaveBeenCalledWith(
    "area",
    "address",
    2,
    [{ productId: "p", qty: 1 }],
    [{ shopId: "s", method: "pickup" }],
    expect.any(AbortSignal),
  );
});
it("hides obsolete reviews after an address version change", async () => {
  vi.mocked(reviewCheckout).mockResolvedValue({ ...response, addressVersion: 3 });
  mount();
  await screen.findByRole("alert");
  expect(screen.queryByText(/Current item subtotal/)).toBeNull();
});
it("retries failed review requests", async () => {
  vi.mocked(reviewCheckout).mockRejectedValueOnce(new Error("Network")).mockResolvedValue(response);
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Retry bill" }));
  await screen.findByText("Items: ₹10.5");
});

it("opens checkout controls only after an eligible server bill and explicit proceed", async () => {
  vi.mocked(reviewCheckout).mockResolvedValue({
    ...response,
    issues: [],
    checkoutAvailable: true,
    deliveryTotal: 0,
    grandTotal: 10.5,
    paymentMethods: ["cod"],
    pricingPolicy: "tax_inclusive_listed_delivery_no_extras_v1",
  });
  mount(true);
  const proceed = await screen.findByRole("button", { name: "Confirm & continue" });
  expect(screen.queryByRole("button", { name: "Place reviewed order" })).toBeNull();
  fireEvent.click(proceed);
  expect(screen.getByRole("button", { name: "Place reviewed order" })).toBeInTheDocument();
});
