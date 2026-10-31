vi.mock("@/components/portal/AdminWorkspace", () => ({
  ProductModeration: () => null,
  AuditExplorer: () => null,
  Reconciliation: () => null,
}));
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LiveAdmin } from "@/components/portal/LiveAdmin";
import { management } from "@/services/management";
const state = vi.hoisted(() => ({ path: "/admin/support/" }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: ({
    select,
  }: {
    select: (s: { location: { pathname: string; search: object } }) => string;
  }) => select({ location: { pathname: state.path, search: {} } }),
  Link: () => null,
}));
vi.mock("@/services/management", () => ({
  management: { adminCategories: vi.fn(), removeCategory: vi.fn(), category: vi.fn() },
}));
vi.mock("@/components/portal/LiveSupport", () => ({
  LiveSupport: () => <h1>Support workspace</h1>,
}));
afterEach(cleanup);
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LiveAdmin />
    </QueryClientProvider>,
  );
}
it("resolves connected child routes with a trailing slash", () => {
  state.path = "/admin/support/";
  mount();
  expect(screen.getByText("Support workspace")).toBeInTheDocument();
});
it("does not offer writes under inactive taxonomy entries", async () => {
  state.path = "/admin/catalog";
  vi.mocked(management.adminCategories).mockResolvedValue([
    {
      id: "c",
      name: "Inactive category",
      image: "",
      blurb: "",
      slug: "inactive",
      version: 1,
      active: false,
      subcategories: [{ id: "s", name: "Inactive sub", slug: "sub", active: false }],
    },
  ]);
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Manage" }));
  expect(await screen.findByDisplayValue("Inactive category")).toBeDisabled();
  expect(screen.getByDisplayValue("Inactive sub")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Add subcategory" })).toBeDisabled();
});

const categories = [
  {
    id: "c1",
    name: "Fresh produce",
    image: "",
    blurb: "",
    slug: "produce",
    version: 1,
    active: true,
    subcategories: [{ id: "s1", name: "Leafy greens", slug: "leafy", active: true }],
  },
  {
    id: "c2",
    name: "Old lane",
    image: "",
    blurb: "",
    slug: "old",
    version: 2,
    active: false,
    subcategories: [],
  },
];
it("finds parent categories through subcategory search and combines status filters", async () => {
  state.path = "/admin/catalog";
  vi.mocked(management.adminCategories).mockResolvedValue(categories);
  mount();
  await screen.findByText("Fresh produce");
  fireEvent.change(screen.getByLabelText("Search categories and subcategories"), {
    target: { value: "leafy" },
  });
  expect(screen.getByText("Fresh produce")).toBeInTheDocument();
  expect(screen.queryByText("Old lane")).toBeNull();
  fireEvent.change(screen.getByLabelText("Category status"), { target: { value: "inactive" } });
  expect(screen.getByText(/No categories match these filters/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByText("Old lane")).toBeInTheDocument();
});
it("requires confirmation before category deactivation and preserves server failures", async () => {
  state.path = "/admin/catalog";
  vi.mocked(management.adminCategories).mockResolvedValue([categories[0]]);
  vi.mocked(management.removeCategory).mockRejectedValue(
    new Error("Category still has shop references"),
  );
  mount();
  await screen.findByText("Fresh produce");
  fireEvent.click(screen.getByRole("button", { name: "Manage" }));
  fireEvent.click(screen.getByRole("button", { name: "Deactivate category" }));
  expect(management.removeCategory).not.toHaveBeenCalled();
  const dialog = screen.getByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Keep it" }));
  expect(management.removeCategory).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Deactivate category" }));
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Deactivate category",
    }),
  );
  await waitFor(() => expect(management.removeCategory).toHaveBeenCalledWith(categories[0]));
  expect(await screen.findByRole("alert")).toHaveTextContent("Category still has shop references");
});
it("clears new category fields only after successful server save", async () => {
  state.path = "/admin/catalog";
  vi.mocked(management.adminCategories).mockResolvedValue([]);
  vi.mocked(management.category).mockResolvedValue(categories[0]);
  mount();
  await screen.findByText("No categories found");
  fireEvent.click(screen.getByRole("button", { name: "Add category" }));
  fireEvent.change(screen.getByLabelText("Category name", { exact: true }), {
    target: { value: "New category" },
  });
  fireEvent.change(screen.getByLabelText("URL slug", { exact: true }), {
    target: { value: "new-category" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save category" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(management.category).toHaveBeenCalledWith(
    { name: "New category", slug: "new-category", blurb: "" },
    undefined,
  );
});
