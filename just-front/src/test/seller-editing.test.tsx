import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SellerProductForm } from "@/components/portal/SellerProductForm";
import { SellerProvider, useSeller } from "@/stores/seller";
import { ProductImage } from "@/components/store/ProductImage";
import { variantDraftSchema } from "@/lib/seller-product";
vi.mock("@tanstack/react-router", () => ({
  useBlocker: () => ({ status: "idle" }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
function EditHarness() {
  const { products } = useSeller();
  const product = products.find((p) => p.id === "p10")!;
  return (
    <>
      <SellerProductForm product={product} />
      <output aria-label="Saved listing">{JSON.stringify(product)}</output>
    </>
  );
}
afterEach(cleanup);
describe("seller editing", () => {
  it("prefills existing fields and saves name/stock changes without changing identity", async () => {
    render(
      <SellerProvider>
        <EditHarness />
      </SellerProvider>,
    );
    expect(screen.getByLabelText("Product name")).toHaveValue("Aged Basmati Rice");
    fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Updated Rice" } });
    fireEvent.change(screen.getByLabelText("In stock"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Saved listing")).toHaveTextContent('"name":"Updated Rice"'),
    );
    const saved = JSON.parse(screen.getByLabelText("Saved listing").textContent!);
    expect(saved).toMatchObject({ id: "p10", shopId: "s1", stock: 7 });
  });
  it("rejects incomplete variants instead of silently replacing their price", async () => {
    render(
      <SellerProvider>
        <EditHarness />
      </SellerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add variant/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Enter a variant name"),
    );
    expect(
      JSON.parse(screen.getByLabelText("Saved listing").textContent!).variants,
    ).toBeUndefined();
  });
  it("preserves variant identity/attributes and rejects fractional or negative stock", () => {
    const variant = {
      id: "existing",
      label: "Blue",
      price: "20",
      stock: "0",
      attributes: [{ label: "Colour", value: "Blue" }],
    };
    expect(variantDraftSchema.parse([variant])[0]).toEqual(variant);
    expect(variantDraftSchema.safeParse([{ ...variant, stock: "1.5" }]).success).toBe(false);
    expect(variantDraftSchema.safeParse([{ ...variant, stock: "-1" }]).success).toBe(false);
    expect(variantDraftSchema.safeParse([{ ...variant, price: "" }]).success).toBe(false);
  });
});
describe("image states", () => {
  it("shows a loading placeholder, fallback on failure and recovers for a new source", () => {
    const { rerender } = render(<ProductImage src="/one.jpg" alt="Rice" />);
    const first = screen.getByRole("img", { name: "Rice" });
    expect(first.parentElement).toHaveAttribute("aria-busy", "true");
    fireEvent.error(first);
    expect(screen.getByRole("img", { name: "Rice: image unavailable" })).toBeInTheDocument();
    rerender(<ProductImage src="/two.jpg" alt="Rice" />);
    const second = screen.getByRole("img", { name: "Rice" });
    fireEvent.load(second);
    expect(second.parentElement).toHaveAttribute("aria-busy", "false");
  });
});
