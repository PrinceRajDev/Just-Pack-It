import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LiveSeller } from "@/components/portal/LiveSeller";
import { LiveAdmin } from "@/components/portal/LiveAdmin";
import { LiveProducts } from "@/components/portal/LiveProducts";
import { SellerAccounts } from "@/components/portal/SellerAccounts";
import { ApiError } from "@/lib/api/client";
import { management } from "@/services/management";
vi.mock("@/services/product-images", () => ({
  productImages: {
    capability: async () => ({ enabled: false, maxBytes: 5242880, types: ["image/png"] }),
  },
}));
const state = vi.hoisted(() => ({ path: "/seller/settings", navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useRouterState: () => state.path,
  useBlocker: () => ({ status: "idle" }),
  useNavigate: () => state.navigate,
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/services/management", () => ({
  management: {
    shop: vi.fn(),
    categories: vi.fn(),
    areas: vi.fn(),
    saveShop: vi.fn(),
    adminCategories: vi.fn(),
    adminAreas: vi.fn(),
    shops: vi.fn(),
    approve: vi.fn(),
    products: vi.fn(),
    product: vi.fn(),
    saveProduct: vi.fn(),
    variant: vi.fn(),
    sellers: vi.fn(),
    createSeller: vi.fn(),
  },
}));
const category = {
  id: "c",
  slug: "grocery",
  name: "Grocery",
  blurb: "",
  image: "",
  version: 0,
  subcategories: [],
};
const area = {
  id: "a",
  name: "Test locality",
  city: "Test town",
  pincodes: ["000000"],
  active: true,
  version: 0,
};
const shop = {
  id: "s",
  slug: "test-shop",
  name: "Test shop",
  locality: "Test lane",
  tagline: "",
  description: "",
  categoryIds: ["c"],
  subcategoryIds: [],
  serviceAreaIds: ["a"],
  categories: ["grocery"],
  fulfilment: ["pickup" as const],
  since: 2020,
  initials: "TS",
  timezone: "Asia/Kolkata",
  openingHours: [],
  temporarilyClosed: true,
  hours: "",
  status: "pending" as const,
  version: 3,
  active: true,
  isOpen: false,
};
function mount(view: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={client}>{view}</QueryClientProvider>);
  return client;
}
beforeEach(() => {
  vi.mocked(management.sellers).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function setupSeller() {
  vi.mocked(management.shop).mockResolvedValue(shop);
  vi.mocked(management.categories).mockResolvedValue([category]);
  vi.mocked(management.areas).mockResolvedValue([area]);
}
it("routes Stock to its own workspace without loading catalogue taxonomy", async () => {
  state.path = "/seller/inventory";
  setupSeller();
  vi.mocked(management.products).mockResolvedValue([]);
  mount(<LiveSeller />);
  await screen.findByRole("heading", { name: "Stock room" });
  await screen.findByText("No stock to manage yet");
  expect(screen.queryByRole("heading", { name: "Your catalogue" })).not.toBeInTheDocument();
  expect(management.categories).not.toHaveBeenCalled();
  expect(management.areas).not.toHaveBeenCalled();
});
describe("Live onboarding UI", () => {
  it("requires a rejection reason and sends it with the reviewed shop version", async () => {
    state.path = "/admin/partners";
    vi.mocked(management.shops).mockResolvedValue([shop]);
    vi.mocked(management.adminCategories).mockResolvedValue([category]);
    vi.mocked(management.adminAreas).mockResolvedValue([area]);
    vi.mocked(management.approve).mockResolvedValue({ ...shop, status: "rejected", version: 4 });
    mount(<LiveAdmin />);
    await screen.findAllByText("Test shop");
    fireEvent.click(screen.getAllByRole("button", { name: "View details" })[0]);
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Approval decision"), { target: { value: "rejected" } });
    const reason = screen.getByLabelText("Reason for seller (required)");
    expect(reason).toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: "Review and save decision" }));
    expect(management.approve).not.toHaveBeenCalled();
    fireEvent.change(reason, { target: { value: "  Correct the shop address  " } });
    fireEvent.click(screen.getByRole("button", { name: "Review and save decision" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm decision" }));
    await waitFor(() =>
      expect(management.approve).toHaveBeenCalledWith(shop, "rejected", "Correct the shop address"),
    );
  });
  it("filters the approval queue by status and shop address without inventing matches", async () => {
    state.path = "/admin/partners";
    vi.mocked(management.shops).mockResolvedValue([
      shop,
      { ...shop, id: "other", name: "Other shop", status: "rejected", address: "Different lane" },
    ]);
    vi.mocked(management.adminCategories).mockResolvedValue([category]);
    vi.mocked(management.adminAreas).mockResolvedValue([area]);
    mount(<LiveAdmin />);
    await screen.findAllByText("Test shop");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Pending (1)" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.queryByText("Other shop")).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Rejected (1)" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getAllByText("Other shop").length).toBeGreaterThan(0);
    expect(screen.queryByText("Test shop")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search applications"), {
      target: { value: "missing address" },
    });
    expect(screen.getByText("No matching applications")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search applications"), {
      target: { value: "different lane" },
    });
    expect(screen.getAllByText("Other shop").length).toBeGreaterThan(0);
  });
  it("creates a seller from the admin form, normalizes the phone and clears the password", async () => {
    const account = {
      id: "seller-one",
      name: "Test seller",
      phone: "+919876543210",
      role: "seller" as const,
      active: true,
    };
    vi.mocked(management.createSeller).mockResolvedValue(account);
    mount(<SellerAccounts />);
    fireEvent.change(screen.getByLabelText("Seller name"), { target: { value: "Test seller" } });
    fireEvent.change(screen.getByLabelText("Seller mobile number"), {
      target: { value: "9876543210" },
    });
    fireEvent.change(screen.getByLabelText("Seller password"), {
      target: { value: "Test-only-seller-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create seller account" }));
    await waitFor(() =>
      expect(management.createSeller).toHaveBeenCalledWith(
        { name: "Test seller", phone: "+919876543210", password: "Test-only-seller-password" },
        expect.anything(),
      ),
    );
    await waitFor(() => expect(screen.getByLabelText("Seller password")).toHaveValue(""));
    expect(await screen.findByText(/seller account is ready/)).toHaveTextContent(
      "no SMS has been sent",
    );
  });
  it("shows duplicate account errors without claiming success or clearing retry details", async () => {
    vi.mocked(management.createSeller).mockRejectedValue(
      new ApiError("An account already uses this phone number", 409, "DUPLICATE"),
    );
    mount(<SellerAccounts />);
    fireEvent.change(screen.getByLabelText("Seller name"), { target: { value: "Test seller" } });
    fireEvent.change(screen.getByLabelText("Seller mobile number"), {
      target: { value: "9876543210" },
    });
    fireEvent.change(screen.getByLabelText("Seller password"), {
      target: { value: "Test-only-seller-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create seller account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already uses this phone");
    expect(screen.getByLabelText("Seller mobile number")).toHaveValue("9876543210");
    expect(screen.queryByText(/seller account is ready/)).not.toBeInTheDocument();
  });
  it("creates a base listing without fabricated variant IDs and opens its edit route", async () => {
    const product = {
      id: "p",
      shopId: "s",
      name: "Actual item",
      unit: "piece",
      description: "",
      categoryId: "c",
      categorySlug: "grocery",
      price: 40,
      stock: 5,
      version: 0,
      active: true,
      attributes: [],
    };
    vi.mocked(management.products).mockResolvedValue([]);
    vi.mocked(management.saveProduct).mockResolvedValue(product);
    mount(<LiveProducts path="/seller/products/new" shop={shop} categories={[category]} />);
    fireEvent.change(await screen.findByLabelText("Product name"), {
      target: { value: "Actual item" },
    });
    fireEvent.change(screen.getByLabelText("Unit / pack (e.g. 500 g, piece, portion)"), {
      target: { value: "piece" },
    });
    fireEvent.change(screen.getByLabelText("Shop category"), { target: { value: "c" } });
    fireEvent.change(screen.getByLabelText("Base price ₹"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Stock (whole sale units)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add product" }));
    await waitFor(() =>
      expect(management.saveProduct).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Actual item", price: 40, stock: 5, categoryId: "c" }),
        undefined,
      ),
    );
    await waitFor(() =>
      expect(state.navigate).toHaveBeenCalledWith({
        to: "/seller/products/$id/edit",
        params: { id: "p" },
      }),
    );
  });
  it("edits option stock using the parent product version and keeps the existing variant ID", async () => {
    const product = {
      id: "p",
      shopId: "s",
      name: "Actual item",
      unit: "pack",
      description: "",
      categoryId: "c",
      categorySlug: "grocery",
      price: 40,
      stock: 90,
      version: 7,
      active: true,
      attributes: [],
      variants: [{ id: "v", label: "500 g", price: 50, stock: 2 }],
    };
    vi.mocked(management.products).mockResolvedValue([product]);
    vi.mocked(management.product).mockResolvedValue(product);
    vi.mocked(management.variant).mockResolvedValue({ ...product.variants[0], version: 8 });
    mount(<LiveProducts path="/seller/products/p/edit" shop={shop} categories={[category]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit 500 g" }));
    expect(screen.queryByLabelText("Stock (whole sale units)")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Price ₹"), { target: { value: "75" } });
    fireEvent.change(screen.getByLabelText("Available stock"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Save listing" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save option" }));
    await waitFor(() =>
      expect(management.variant).toHaveBeenCalledWith(
        product,
        { label: "500 g", price: 75, stock: 0, attributes: [] },
        "v",
      ),
    );
  });
  it("keeps a temporarily closed shop closed and submits the current version", async () => {
    state.path = "/seller/settings";
    setupSeller();
    vi.mocked(management.saveShop).mockResolvedValue(shop);
    mount(<LiveSeller />);
    expect(await screen.findByLabelText("Temporarily closed")).toBeChecked();
    fireEvent.change(screen.getByLabelText("Shop name"), {
      target: { value: "Updated test shop" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and submit for approval" }));
    await waitFor(() => expect(management.saveShop).toHaveBeenCalledOnce());
    expect(vi.mocked(management.saveShop).mock.calls[0]).toEqual([
      expect.objectContaining({
        name: "Updated test shop",
        temporarilyClosed: true,
        categoryIds: ["c"],
        serviceAreaIds: ["a"],
        fulfilment: ["pickup"],
      }),
      3,
    ]);
  });
  it("offers onboarding only when the API says the seller has no shop", async () => {
    state.path = "/seller/settings";
    setupSeller();
    vi.mocked(management.shop).mockResolvedValue(null);
    mount(<LiveSeller />);
    expect(await screen.findByText("Bring your shop online")).toBeInTheDocument();
    expect(screen.getByLabelText("Shop URL slug (lowercase-with-hyphens)")).toBeRequired();
  });
  it("shows real approval details and saves an explicit admin decision", async () => {
    state.path = "/admin/partners";
    vi.mocked(management.shops).mockResolvedValue([shop]);
    vi.mocked(management.adminCategories).mockResolvedValue([category]);
    vi.mocked(management.adminAreas).mockResolvedValue([area]);
    vi.mocked(management.approve).mockResolvedValue({ ...shop, status: "approved", version: 4 });
    mount(<LiveAdmin />);
    expect((await screen.findAllByText("Test shop")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Create seller account" })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Test locality/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "View details" })[0]);
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Approval decision"), { target: { value: "approved" } });
    fireEvent.click(screen.getByRole("button", { name: "Review and save decision" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm decision" }));
    await waitFor(() =>
      expect(management.approve).toHaveBeenCalledWith(shop, "approved", undefined),
    );
  });
});
