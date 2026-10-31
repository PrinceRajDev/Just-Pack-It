import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LiveCart } from "@/components/store/LiveCart";
import { reviewCart } from "@/services/cart-review";
import type { CartReview } from "@/domain/cart-review";
vi.mock("@/components/store/AddressDeliveryReview", () => ({ AddressDeliveryReview: () => null }));
const state = vi.hoisted(() => ({
  area: { id: "a", name: "Test area" } as { id: string; name: string } | null,
  cart: {
    lines: { "p::v": { productId: "p", variantId: "v", qty: 3, acceptedPrice: 12 } },
    remove: vi.fn(),
    setQty: vi.fn(),
    acceptPrice: vi.fn(),
  },
}));
vi.mock("@/stores/cart", () => ({
  useCart: () => state.cart,
  cartLineKey: (p: string, v?: string) => (v ? `${p}::${v}` : p),
}));
vi.mock("@/stores/location", () => ({
  useLocationArea: () => ({ area: state.area, ready: true }),
}));
vi.mock("@/services/cart-review", () => ({ reviewCart: vi.fn() }));
vi.mock("@/components/store/StoreLayout", () => ({
  StoreLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PageTitle: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));
vi.mock("@/components/store/AreaNotice", () => ({ AreaNotice: () => null }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
const product = {
  id: "p",
  shopId: "s",
  name: "Shop-owned listing",
  unit: "pack",
  description: "",
  price: 10.5,
  stock: 2,
  categorySlug: "grocery",
  variants: [{ id: "v", label: "500 g", price: 10.5, stock: 2 }],
};
const quote: CartReview = {
  checkedAt: "2026-10-29T10:00:00.000Z",
  areaId: "a",
  currency: "INR",
  reserved: false,
  checkoutAvailable: false,
  lines: [
    {
      productId: "p",
      variantId: "v",
      qty: 3,
      shopId: "s",
      product,
      unitPrice: 10.5,
      lineTotal: 31.5,
      availableStock: 2,
      issues: [{ code: "INSUFFICIENT_STOCK", message: "Only 2 available; reduce the quantity." }],
    },
  ],
  shops: [
    {
      shop: {
        id: "s",
        slug: "shop",
        name: "Independent shop",
        tagline: "",
        locality: "Test locality",
        categories: ["grocery"],
        isOpen: false,
        hours: "",
        fulfilment: ["pickup"],
        since: 2020,
        initials: "IS",
      },
      itemsSubtotal: 31.5,
      issues: [{ code: "SHOP_CLOSED", message: "This shop is currently closed." }],
    },
  ],
  itemsSubtotal: 31.5,
  deliveryTotal: null,
  grandTotal: null,
};
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LiveCart />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  state.area = { id: "a", name: "Test area" };
  vi.mocked(reviewCart).mockResolvedValue(quote);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe("Live server-checked bag", () => {
  it("shows server prices with paise and closed/stock issues while keeping checkout disabled", async () => {
    mount();
    expect(await screen.findByText("Independent shop")).toBeInTheDocument();
    expect(screen.getByText("This shop is currently closed.")).toBeInTheDocument();
    expect(screen.getByText("Only 2 available; reduce the quantity.")).toBeInTheDocument();
    expect(screen.getByText("Current item subtotal: ₹31.5")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Place COD order/ })).toBeNull();
    expect(screen.getByText("Review address and methods")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reduce to 2" }));
    expect(state.cart.setQty).toHaveBeenCalledWith("p", 2, "v");
  });
  it("asks for area selection before requesting a review", () => {
    state.area = null;
    mount();
    expect(screen.getByText(/Choose your area to check/)).toBeInTheDocument();
    expect(reviewCart).not.toHaveBeenCalled();
  });
  it("retains local items and allows removal when server review fails", async () => {
    vi.mocked(reviewCart).mockRejectedValue(new Error("Offline"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("contents have been kept");
    fireEvent.click(screen.getByRole("button", { name: "Remove saved item" }));
    expect(state.cart.remove).toHaveBeenCalledWith("p", "v");
  });
  it("lets the buyer acknowledge a server price change without sending a price to checkout", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Accept current price" }));
    expect(state.cart.acceptPrice).toHaveBeenCalledWith("p", "v");
    await waitFor(() => expect(reviewCart).toHaveBeenCalled());
  });
});
