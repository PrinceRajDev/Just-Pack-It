import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { AccountCartProvider } from "@/stores/AccountCartProvider";
import { useCart } from "@/stores/cart";
import { shoppingKeys, mergeShopping, parseLines, parseWishes } from "@/lib/shopping-storage";
const state = vi.hoisted(() => ({
  session: null as { userId: string; role: string } | null,
  ready: true,
}));
vi.mock("@/stores/auth", () => ({ useAuth: () => state }));
vi.mock("@/lib/config", () => ({ isDemoMode: false, config: { apiUrl: "http://api.test" } }));
vi.mock("@/services/catalog", () => ({
  productById: (id: string) => ({ id, stock: 999, price: 10 }),
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  state.session = null;
  state.ready = true;
});
function Probe() {
  const cart = useCart();
  return (
    <>
      <output data-testid="lines">{JSON.stringify(cart.lines)}</output>
      <output data-testid="wishes">{JSON.stringify(cart.wishlist)}</output>
      <button onClick={() => cart.add("new")}>Add new</button>
    </>
  );
}
function app() {
  return (
    <AccountCartProvider>
      <Probe />
    </AccountCartProvider>
  );
}
const keys = (id: string) => shoppingKeys("http://api.test", id);
it("isolates account switches, guests and unresolved auth without overwriting stored data", async () => {
  localStorage.setItem(keys("user:a").cart, JSON.stringify({ a: { productId: "a", qty: 2 } }));
  localStorage.setItem(keys("user:b").cart, JSON.stringify({ b: { productId: "b", qty: 3 } }));
  state.session = { userId: "a", role: "buyer" };
  const { rerender } = render(app());
  await waitFor(() => expect(screen.getByTestId("lines")).toHaveTextContent('"a"'));
  state.session = { userId: "b", role: "buyer" };
  rerender(app());
  await waitFor(() => expect(screen.getByTestId("lines")).toHaveTextContent('"b"'));
  expect(screen.getByTestId("lines")).not.toHaveTextContent('"a"');
  state.session = null;
  rerender(app());
  await waitFor(() => expect(screen.getByTestId("lines")).toHaveTextContent("{}"));
  expect(JSON.parse(localStorage.getItem(keys("user:a").cart)!).a.qty).toBe(2);
  state.ready = false;
  rerender(app());
  expect(screen.getByTestId("lines")).toHaveTextContent("{}");
});
it("imports guest items explicitly, keeps duplicate account quantity and removes imported accepted prices", async () => {
  state.session = { userId: "a", role: "buyer" };
  localStorage.setItem(
    keys("user:a").cart,
    JSON.stringify({ same: { productId: "same", qty: 2, acceptedPrice: 10 } }),
  );
  localStorage.setItem(
    keys("guest").cart,
    JSON.stringify({
      same: { productId: "same", qty: 5 },
      guest: { productId: "guest", qty: 1, acceptedPrice: 99 },
    }),
  );
  localStorage.setItem(keys("guest").wish, JSON.stringify(["wish"]));
  render(app());
  await waitFor(() => expect(screen.getByTestId("lines")).toHaveTextContent('"same"'));
  expect(screen.getByTestId("lines")).not.toHaveTextContent('"guest"');
  fireEvent.click(screen.getByRole("button", { name: "Import guest items" }));
  await waitFor(() => expect(screen.getByTestId("lines")).toHaveTextContent('"guest"'));
  const lines = JSON.parse(screen.getByTestId("lines").textContent!);
  expect(lines.same.qty).toBe(2);
  expect(lines.guest.acceptedPrice).toBeUndefined();
  expect(screen.getByTestId("wishes")).toHaveTextContent("wish");
  expect(localStorage.getItem(keys("guest").cart)).toBeNull();
});
it("does not silently assign legacy browser data and keep separate preserves source", () => {
  state.session = { userId: "a", role: "buyer" };
  localStorage.setItem("jpi.api.cart", JSON.stringify({ legacy: { productId: "legacy", qty: 1 } }));
  render(app());
  expect(screen.getByTestId("lines")).toHaveTextContent("{}");
  fireEvent.click(screen.getByRole("button", { name: "Keep separate" }));
  expect(localStorage.getItem("jpi.api.cart")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Import earlier browser items" })).toBeNull();
});
it("sanitizes corrupt data and caps merges without joining different listing IDs", () => {
  expect(parseLines("bad")).toEqual({});
  expect(parseWishes('["a","a",1]')).toEqual(["a"]);
  const current = Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [String(i), { productId: String(i), qty: 1 }]),
  );
  expect(Object.keys(mergeShopping(current, { next: { productId: "next", qty: 1 } }))).toHaveLength(
    100,
  );
});
