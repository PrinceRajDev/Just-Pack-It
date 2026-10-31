import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SellerOnboarding } from "@/components/portal/SellerOnboarding";
import { management } from "@/services/management";
import type { ManagedShop, ManagedProduct } from "@/domain/management";
vi.mock("@/services/management", () => ({ management: { products: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
const shop: ManagedShop = {
  id: "s",
  slug: "test-shop",
  name: "Test shop",
  address: "Test address",
  locality: "Test locality",
  tagline: "",
  categories: ["grocery"],
  categoryIds: ["c"],
  subcategoryIds: [],
  serviceAreaIds: ["a"],
  isOpen: false,
  hours: "",
  openingHours: [],
  timezone: "Asia/Kolkata",
  fulfilment: ["pickup"],
  since: 2020,
  initials: "TS",
  status: "pending",
  active: true,
  version: 0,
};
const product: ManagedProduct = {
  id: "p",
  shopId: "s",
  name: "Test listing",
  unit: "pack",
  description: "",
  categoryId: "c",
  categorySlug: "grocery",
  stock: 999,
  price: 100,
  active: true,
  version: 0,
  variants: [{ id: "v", label: "500 g", stock: 0, price: 50 }],
};
function mount(patch: Partial<ManagedShop> = {}) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SellerOnboarding
        shop={{ ...shop, ...patch }}
        categories={[
          {
            id: "c",
            slug: "grocery",
            name: "Grocery",
            blurb: "",
            image: "",
            subcategories: [],
            version: 0,
          },
        ]}
        areas={[
          {
            id: "a",
            name: "Test locality",
            city: "Test town",
            pincodes: ["000000"],
            active: true,
            version: 0,
          },
        ]}
      />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe("Seller setup readiness", () => {
  it("shows the previous rejection reason after resubmission without exposing reviewer IDs", async () => {
    vi.mocked(management.products).mockResolvedValue([]);
    mount({
      status: "pending",
      review: {
        status: "rejected",
        reason: "Please correct your shop address",
        reviewedAt: "2026-10-29T09:00:00.000Z",
        reviewedBy: "private-reviewer-id",
      },
    });
    expect(screen.getByLabelText("Latest shop review")).toHaveTextContent(
      "Previous admin review: rejected",
    );
    expect(screen.getByText("Please correct your shop address")).toBeInTheDocument();
    expect(screen.queryByText("private-reviewer-id")).not.toBeInTheDocument();
    await screen.findByText(/Add an actual product/);
  });
  it("shows missing hours/catalogue and keeps pending shops hidden", async () => {
    vi.mocked(management.products).mockResolvedValue([]);
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("awaiting admin approval");
    expect(screen.getByText(/No operating intervals/)).toBeInTheDocument();
    expect(await screen.findByText(/Add an actual product/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View your shop" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage products" })).toHaveAttribute(
      "href",
      "/seller/products/new",
    );
  });
  it("does not count parent stock when the product has sold-out variants", async () => {
    vi.mocked(management.products).mockResolvedValue([product]);
    mount();
    expect(await screen.findByText(/restock an existing listing/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage products" })).toHaveAttribute(
      "href",
      "/seller/products",
    );
    expect(screen.queryByText(/active listing has available stock/)).not.toBeInTheDocument();
  });
  it("keeps listed/closed status separate from missing product readiness", async () => {
    vi.mocked(management.products).mockResolvedValue([]);
    mount({ status: "approved" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "available for browsing, but currently closed",
    );
    expect(screen.getByRole("link", { name: "View your shop" })).toBeInTheDocument();
    expect(await screen.findByText(/Add an actual product/)).toBeInTheDocument();
  });
  it("explains suspension without offering a public shop link", async () => {
    vi.mocked(management.products).mockResolvedValue([]);
    mount({ status: "suspended" });
    expect(screen.getByRole("status")).toHaveTextContent("Contact the platform admin");
    expect(screen.queryByRole("link", { name: "View your shop" })).not.toBeInTheDocument();
    await screen.findByText(/Add an actual product/);
  });
  it("shows an unchecked catalogue on failure and recovers after retry", async () => {
    vi.mocked(management.products)
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValue([product]);
    mount();
    expect(await screen.findByText("Not checked")).toBeInTheDocument();
    expect(screen.queryByText(/Add an actual product/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByText("Not checked")).not.toBeInTheDocument());
    expect(screen.getByText(/restock an existing listing/)).toBeInTheDocument();
  });
});
