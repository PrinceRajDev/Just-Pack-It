vi.mock("@/services/catalog", () => ({ shopById: () => undefined }));
import { it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { reorderItems, reorderPlan } from "@/lib/reorder";
import { BuyAgain } from "@/components/store/BuyAgain";
import { OrderReceipt } from "@/components/store/OrderReceipt";
import { reviewReorder } from "@/services/reorder";
import type { Order, Product, Shop, CartLine } from "@/domain/types";
import type { CartReview } from "@/domain/cart-review";
import type { ReactNode } from "react";
const state = vi.hoisted(() => ({
  area: { id: "area" } as { id: string } | null,
  lines: {} as Record<string, CartLine>,
  add: vi.fn(),
}));
vi.mock("@/stores/cart", () => ({
  useCart: () => ({ ready: true, lines: state.lines, addReviewed: state.add }),
}));
vi.mock("@/stores/location", () => ({ useLocationArea: () => ({ area: state.area, gps: null }) }));
vi.mock("@/services/reorder", () => ({ reviewReorder: vi.fn() }));
vi.mock("@/lib/config", () => ({ isDemoMode: false }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
const order: Order = {
  id: "order",
  createdAt: "2026-10-31T10:00:00Z",
  addressId: "address",
  paymentMethod: "cod",
  paymentStatus: "unpaid",
  total: 60,
  subOrders: [
    {
      id: "sub",
      shopId: "shop-a",
      shopName: "Actual seller",
      shopAddress: "Recorded shop address",
      status: "delivered",
      fulfilment: "pickup",
      deliveryFee: 0,
      lines: [
        {
          productId: "p",
          variantId: "v",
          variantLabel: "500 g",
          name: "Rice",
          unit: "bag",
          price: 20,
          qty: 3,
        },
      ],
    },
  ],
};
function quote(): CartReview {
  return {
    checkedAt: "now",
    areaId: "area",
    currency: "INR",
    reserved: false,
    checkoutAvailable: false,
    itemsSubtotal: 90,
    deliveryTotal: null,
    grandTotal: null,
    shops: [
      {
        shop: { id: "shop-a", name: "Actual seller", isOpen: true } as Shop,
        itemsSubtotal: 90,
        issues: [],
      },
    ],
    lines: [
      {
        productId: "p",
        variantId: "v",
        qty: 3,
        shopId: "shop-a",
        product: { id: "p", shopId: "shop-a" } as Product,
        unitPrice: 30,
        availableStock: 4,
        issues: [],
      },
    ],
  };
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.area = { id: "area" };
  state.lines = {};
});
it("retains exact variant and shop, caps additions after existing bag stock and shows changed price", () => {
  const plan = reorderPlan(order, quote(), [{ productId: "p", variantId: "v", qty: 2 }]);
  expect(plan[0]).toMatchObject({
    productId: "p",
    variantId: "v",
    qty: 2,
    price: 30,
    oldPrice: 20,
  });
  expect(reorderItems(order)).toEqual([{ productId: "p", variantId: "v", qty: 3 }]);
});
it("never substitutes a different seller or unavailable option, and excludes closed shops", () => {
  const changed = quote();
  changed.lines[0].shopId = "shop-b";
  expect(reorderPlan(order, changed, [])[0].qty).toBe(0);
  const missing = quote();
  missing.lines[0].issues = [{ code: "VARIANT_UNAVAILABLE", message: "Unavailable" }];
  expect(reorderPlan(order, missing, [])[0].qty).toBe(0);
  const closed = quote();
  closed.shops[0].shop.isOpen = false;
  expect(reorderPlan(order, closed, [])[0].note).toBe("Shop is closed");
});
it("requires area and explicit review then rechecks before adding once", async () => {
  vi.mocked(reviewReorder).mockResolvedValue(reorderPlan(order, quote(), []));
  const { rerender } = render(<BuyAgain order={order} />);
  fireEvent.click(screen.getByRole("button", { name: "Check items to buy again" }));
  await screen.findByText(/Current unit price/);
  expect(state.add).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Add available items to bag" }));
  await waitFor(() => expect(state.add).toHaveBeenCalledTimes(1));
  expect(state.add).toHaveBeenCalledWith([{ productId: "p", variantId: "v", qty: 3 }]);
  expect(reviewReorder).toHaveBeenCalledTimes(2);
  state.area = null;
  rerender(<BuyAgain order={order} />);
  expect(screen.getByRole("button", { name: "Check items to buy again" })).toBeDisabled();
});
it("does not add after a failed recheck or changed price", async () => {
  const plan = reorderPlan(order, quote(), []);
  vi.mocked(reviewReorder)
    .mockResolvedValueOnce(plan)
    .mockResolvedValueOnce([{ ...plan[0], price: 40 }])
    .mockRejectedValueOnce(new Error("offline"));
  render(<BuyAgain order={order} />);
  fireEvent.click(screen.getByRole("button", { name: "Check items to buy again" }));
  await screen.findByText(/Current unit price/);
  fireEvent.click(screen.getByRole("button", { name: "Add available items to bag" }));
  await screen.findByText(/Availability or prices changed/);
  expect(state.add).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Add available items to bag" }));
  await screen.findByText(/Nothing was added/);
  expect(state.add).not.toHaveBeenCalled();
});
it("receipt prints recorded seller, original option/prices and honest unpaid/test states", () => {
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  render(<OrderReceipt order={{ ...order, testMode: true }} />);
  expect(screen.getByText("Recorded shop address")).toBeInTheDocument();
  expect(screen.getByText(/Rice · 500 g/)).toBeInTheDocument();
  expect(screen.getByText(/Unpaid/)).toBeInTheDocument();
  expect(screen.getByText(/TEST ORDER/)).toBeInTheDocument();
  expect(screen.getByText(/not a tax invoice/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Print order receipt" }));
  expect(print).toHaveBeenCalledTimes(1);
  print.mockRestore();
});
