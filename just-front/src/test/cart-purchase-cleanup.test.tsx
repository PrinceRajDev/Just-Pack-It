import { it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CartProvider, useCart } from "@/stores/cart";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
function Probe() {
  const cart = useCart();
  return (
    <>
      <output>{JSON.stringify(cart.lines)}</output>
      <button
        onClick={() =>
          cart.removePurchased([
            { productId: "unchanged", qty: 2 },
            { productId: "changed", qty: 3 },
          ])
        }
      >
        Confirm purchase
      </button>
    </>
  );
}
it("clears only unchanged purchased quantities and keeps edited/new bag lines", async () => {
  localStorage.setItem(
    "jpi.cart",
    JSON.stringify({
      unchanged: { productId: "unchanged", qty: 2 },
      changed: { productId: "changed", qty: 5 },
      new: { productId: "new", qty: 1 },
    }),
  );
  render(
    <CartProvider>
      <Probe />
    </CartProvider>,
  );
  await screen.findByText(/"unchanged"/);
  fireEvent.click(screen.getByRole("button", { name: "Confirm purchase" }));
  const data = JSON.parse(screen.getByRole("status").textContent!);
  expect(data.unchanged).toBeUndefined();
  expect(data.changed.qty).toBe(5);
  expect(data.new.qty).toBe(1);
});
