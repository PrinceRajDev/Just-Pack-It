import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ConnectedWishlist } from "@/components/store/ConnectedWishlist";
const state = vi.hoisted(() => ({ wishlist: [] as string[], remove: vi.fn(), load: vi.fn() }));
vi.mock("@/stores/cart", () => ({
  useCart: () => ({ wishlist: state.wishlist, toggleWish: state.remove }),
}));
vi.mock("@/services/catalog", () => ({
  productQuery: (id: string) => ({ queryKey: ["product", id], queryFn: () => state.load(id) }),
}));
vi.mock("@/components/store/ProductCard", () => ({
  ProductCard: ({ product }: { product: { name: string } }) => <article>{product.name}</article>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  state.wishlist = [];
});
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ConnectedWishlist />
    </QueryClientProvider>,
  );
}
it("shows honest empty and browser-only persistence states", () => {
  mount();
  expect(screen.getByText(/No saved products yet/)).toBeInTheDocument();
  expect(screen.getByText(/not synced to other devices/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Explore categories" })).toHaveAttribute(
    "href",
    "/categories",
  );
  expect(state.load).not.toHaveBeenCalled();
});
it("renders independent saved listings and permits explicit unavailable removal", async () => {
  state.wishlist = ["a", "b", "gone"];
  state.load.mockImplementation(async (id: string) =>
    id === "gone" ? null : { id, name: id === "a" ? "Rice from Shop A" : "Rice from Shop B" },
  );
  mount();
  expect(await screen.findByText("Rice from Shop A")).toBeInTheDocument();
  expect(await screen.findByText("Rice from Shop B")).toBeInTheDocument();
  expect(await screen.findByText("Product unavailable")).toBeInTheDocument();
  expect(state.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Remove unavailable item" }));
  expect(state.remove).toHaveBeenCalledWith("gone");
});
it("keeps network failures distinct from missing products and allows retry", async () => {
  state.wishlist = ["a"];
  state.load
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ id: "a", name: "Restored product" });
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("It has not been removed");
  expect(state.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry saved product" }));
  expect(await screen.findByText("Restored product")).toBeInTheDocument();
});
it("loads saved items in bounded batches", async () => {
  state.wishlist = Array.from({ length: 13 }, (_, i) => String(i));
  state.load.mockResolvedValue(null);
  mount();
  await waitFor(() => expect(state.load).toHaveBeenCalledTimes(12));
  fireEvent.click(screen.getByRole("button", { name: "Load more saved products" }));
  await waitFor(() => expect(state.load).toHaveBeenCalledTimes(13));
});
