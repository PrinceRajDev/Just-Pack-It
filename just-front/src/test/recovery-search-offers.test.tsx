import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CartProvider, useCart } from "@/stores/cart";
import { CartRecovery } from "@/components/store/CartRecovery";
import { bagReadiness } from "@/lib/bag-readiness";
import { productById, shopById } from "@/services/catalog";
import { validOffer } from "@/lib/offers";
import { searchMatches, rememberSearch, recentSearches, clearSearches } from "@/lib/search";
import { ShopOffer } from "@/components/store/ShopOffer";

function RecoveryHarness() {
  const { lines } = useCart();
  return (
    <>
      <CartRecovery />
      <output aria-label="Readiness">
        {bagReadiness(Object.values(lines), productById, shopById)
          .map((i) => i.message)
          .join(" ") || "Ready"}
      </output>
    </>
  );
}
afterEach(() => {
  cleanup();
  localStorage.clear();
});
describe("cart recovery", () => {
  it("requires explicit price acceptance and lets the buyer reduce excess stock", async () => {
    localStorage.setItem(
      "jpi.cart",
      JSON.stringify({ p1: { productId: "p1", qty: 45, acceptedPrice: 10 } }),
    );
    render(
      <CartProvider>
        <RecoveryHarness />
      </CartProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Readiness")).toHaveTextContent("price changed"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept current price" }));
    expect(screen.getByLabelText("Readiness")).not.toHaveTextContent("price changed");
    expect(screen.getByLabelText("Readiness")).toHaveTextContent("only 40 available");
    fireEvent.click(screen.getByRole("button", { name: "Reduce to 40" }));
    expect(screen.getByLabelText("Readiness")).toHaveTextContent("Ready");
  });
});
describe("search", () => {
  it("matches a conservative one-letter typo while preserving all query tokens", () => {
    expect(searchMatches("Desi Tomatoes", "tomatos")).toBe(true);
    expect(searchMatches("Desi Tomatoes", "milk")).toBe(false);
    expect(searchMatches("Desi Tomatoes", "tomatos milk")).toBe(false);
    expect(searchMatches("Atta", "ab")).toBe(false);
  });
  it("deduplicates and caps optional local recent history, and clears it", () => {
    ["milk", "atta", "tea", "bread", "eggs", "Milk"].forEach(rememberSearch);
    expect(recentSearches()).toEqual(["Milk", "eggs", "bread", "tea", "atta"]);
    clearSearches();
    expect(recentSearches()).toEqual([]);
  });
});
describe("shop offers", () => {
  it("rejects expired, future and malformed offers", () => {
    const now = Date.parse("2026-10-29T12:00:00Z");
    expect(validOffer({ label: "Offer", validUntil: "2026-10-29T11:59:00Z" }, now)).toBe(false);
    expect(validOffer({ label: "Offer", validUntil: "invalid" }, now)).toBe(false);
    expect(
      validOffer({ label: "Offer", validUntil: "2026-11-01", validFrom: "2026-10-30" }, now),
    ).toBe(false);
  });
  it("shows actual conditions and shop scope without inventing a minimum", () => {
    render(
      <ShopOffer
        shop={{
          ...shopById("s1")!,
          offer: {
            label: "Test offer",
            validUntil: "2099-01-01",
            conditions: "Selected items only",
          },
        }}
      />,
    );
    expect(screen.getByText(/Sharma General Store only/)).toBeInTheDocument();
    expect(screen.getByText("Minimum spend not provided")).toBeInTheDocument();
    expect(screen.getByText("Selected items only")).toBeInTheDocument();
  });
});
