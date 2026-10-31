import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminCatalogue } from "@/components/portal/AdminCatalogue";
import { management } from "@/services/management";
import { adminWorkspace } from "@/services/admin-workspace";
vi.mock("@/services/management", () => ({
  management: { adminCategories: vi.fn(), category: vi.fn() },
}));
vi.mock("@/services/admin-workspace", () => ({
  adminWorkspace: { products: vi.fn(), moderate: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function mount() {
  vi.mocked(management.adminCategories).mockResolvedValue([
    {
      id: "c",
      name: "Tools",
      slug: "tools",
      image: "",
      blurb: "",
      version: 1,
      active: true,
      subcategories: [],
    },
    {
      id: "x",
      name: "Old",
      slug: "old",
      image: "",
      blurb: "",
      version: 1,
      active: false,
      subcategories: [],
    },
  ]);
  vi.mocked(adminWorkspace.products).mockResolvedValue({ items: [] });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdminCatalogue />
    </QueryClientProvider>,
  );
}
it("uses full taxonomy data for active category count and never fabricates product totals", async () => {
  mount();
  await screen.findByText("Tools");
  const stats = screen.getByRole("region", { name: "Catalogue statistics" });
  expect(within(stats).getAllByText("Global reporting unavailable")).toHaveLength(3);
  expect(within(stats).getByText("1", { exact: true })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /bulk/i })).toBeNull();
});
it("preserves product search on failure and sends existing server filters", async () => {
  mount();
  await screen.findByText("No matching products");
  vi.mocked(adminWorkspace.products).mockRejectedValue(new Error("Offline QA"));
  fireEvent.change(screen.getByLabelText("Product name", { exact: true }), {
    target: { value: "Rice" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search products" }));
  await screen.findByText(/Could not load or refresh listings/);
  expect(screen.getByLabelText("Product name", { exact: true })).toHaveValue("Rice");
  expect(adminWorkspace.products).toHaveBeenLastCalledWith({ q: "Rice", state: "all" }, undefined);
  fireEvent.change(screen.getByLabelText("Listing status", { exact: true }), {
    target: { value: "inactive" },
  });
  await waitFor(() =>
    expect(adminWorkspace.products).toHaveBeenLastCalledWith(
      { q: "Rice", state: "inactive" },
      undefined,
    ),
  );
});
it("generates new slugs until manually edited and retains draft after failed save", async () => {
  mount();
  await screen.findByText("Tools");
  fireEvent.click(screen.getByRole("button", { name: "Add category" }));
  const d = screen.getByRole("dialog");
  fireEvent.change(within(d).getByLabelText("Category name", { exact: true }), {
    target: { value: "Home Tools" },
  });
  expect(within(d).getByLabelText("URL slug", { exact: true })).toHaveValue("home-tools");
  fireEvent.change(within(d).getByLabelText("URL slug", { exact: true }), {
    target: { value: "my-tools" },
  });
  fireEvent.change(within(d).getByLabelText("Category name", { exact: true }), {
    target: { value: "Home Tools Updated" },
  });
  expect(within(d).getByLabelText("URL slug", { exact: true })).toHaveValue("my-tools");
  vi.mocked(management.category).mockRejectedValue(new Error("Duplicate slug"));
  fireEvent.click(within(d).getByRole("button", { name: "Save category" }));
  await within(d).findByRole("alert");
  expect(within(d).getByLabelText("Category name", { exact: true })).toHaveValue(
    "Home Tools Updated",
  );
  expect(management.category).toHaveBeenCalledWith(
    { name: "Home Tools Updated", slug: "my-tools", blurb: "" },
    undefined,
  );
});
