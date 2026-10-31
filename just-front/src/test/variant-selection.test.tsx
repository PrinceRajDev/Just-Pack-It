import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VariantPicker } from "@/components/store/VariantPicker";
import { AddToBag } from "@/components/store/QtyStepper";
import { CartProvider, useCart } from "@/stores/cart";
import type { Product } from "@/domain/types";

const { product } = vi.hoisted(() => ({
  product: {
    id: "test-shirt",
    name: "Test shirt",
    unit: "1 item",
    shopId: "test-shop",
    categorySlug: "fashion",
    price: 100,
    stock: 50,
    description: "Test fixture only",
    variants: [
      {
        id: "small",
        label: "Small / Blue",
        price: 100,
        stock: 2,
        attributes: [
          { label: "Size", value: "S" },
          { label: "Colour", value: "Blue" },
        ],
      },
      {
        id: "large",
        label: "Large / Red",
        price: 150,
        stock: 1,
        attributes: [
          { label: "Size", value: "L" },
          { label: "Colour", value: "Red" },
        ],
      },
      { id: "sold-out", label: "Medium / Blue", price: 120, stock: 0 },
    ],
  },
}));
vi.mock("@/services/catalog", () => ({
  productById: (id: string) => (id === product.id ? product : undefined),
}));

function Harness() {
  const [selected, setSelected] = useState<string>();
  const variant = product.variants.find((v) => v.id === selected);
  const { lines, setQty } = useCart();
  return (
    <>
      <VariantPicker variants={product.variants} selectedId={selected} onSelect={setSelected} />
      <output aria-label="Selected price">{variant?.price ?? product.price}</output>
      <AddToBag product={product as Product} variantId={selected} />
      <button onClick={() => setQty(product.id, 1, "invalid")}>Invalid selection</button>
      <output aria-label="Cart lines">{JSON.stringify(Object.values(lines))}</output>
    </>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("variant selection and cart quantities", () => {
  it("keeps option prices, independent cart quantities and stock limits aligned", async () => {
    render(
      <CartProvider>
        <Harness />
      </CartProvider>,
    );
    await waitFor(() => expect(localStorage.getItem("jpi.cart")).not.toBeNull());
    expect(screen.getByRole("button", { name: "Select an option" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Medium \/ Blue/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Small \/ Blue/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Large \/ Red/ }));
    expect(screen.getByLabelText("Selected price")).toHaveTextContent("150");
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    expect(JSON.parse(screen.getByLabelText("Cart lines").textContent!)).toEqual([
      { productId: product.id, variantId: "small", qty: 2, acceptedPrice: 100 },
      { productId: product.id, variantId: "large", qty: 1, acceptedPrice: 150 },
    ]);
    fireEvent.click(screen.getByRole("radio", { name: /Small \/ Blue/ }));
    expect(screen.getByLabelText("Selected price")).toHaveTextContent("100");
    expect(screen.getByRole("group", { name: /Quantity of Test shirt, Small/ })).toHaveTextContent(
      "2",
    );
  });

  it("blocks unknown variant identifiers instead of using parent stock", async () => {
    render(
      <CartProvider>
        <Harness />
      </CartProvider>,
    );
    await waitFor(() => expect(localStorage.getItem("jpi.cart")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Invalid selection" }));
    expect(screen.getByLabelText("Cart lines")).toHaveTextContent("[]");
  });
});
