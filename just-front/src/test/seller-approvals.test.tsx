import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SellerApprovalsPage } from "@/components/portal/SellerApprovalsPage";
import { management } from "@/services/management";
import type { ManagedShop } from "@/domain/management";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/services/management", () => ({
  management: {
    shops: vi.fn(),
    sellers: vi.fn(),
    adminCategories: vi.fn(),
    adminAreas: vi.fn(),
    approve: vi.fn(),
  },
}));
vi.mock("@/components/portal/DeliveryPartners", () => ({
  DeliveryPartners: () => <p>Existing delivery tools</p>,
}));
const shop: ManagedShop = {
  id: "shop",
  ownerId: "seller",
  slug: "test",
  name: "Alpha Counter",
  address: "Test lane",
  locality: "Local",
  tagline: "",
  categories: [],
  categoryIds: ["c"],
  subcategoryIds: [],
  serviceAreaIds: ["a"],
  isOpen: false,
  hours: "",
  openingHours: [],
  timezone: "Asia/Kolkata",
  fulfilment: ["pickup"],
  since: 2020,
  initials: "AC",
  status: "pending",
  active: true,
  version: 0,
};
const clients: QueryClient[] = [];
function mount() {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(c);
  render(
    <QueryClientProvider client={c}>
      <SellerApprovalsPage />
    </QueryClientProvider>,
  );
  return c;
}
beforeEach(() => {
  vi.mocked(management.shops).mockResolvedValue([
    shop,
    { ...shop, id: "shop2", ownerId: "seller2", name: "Zulu Shop", status: "approved" },
  ]);
  vi.mocked(management.sellers).mockResolvedValue([
    { id: "seller", name: "Owner One", phone: "+919000000001", role: "seller", active: true },
  ]);
  vi.mocked(management.adminCategories).mockResolvedValue([
    {
      id: "c",
      slug: "grocery",
      name: "Grocery",
      blurb: "",
      image: "",
      version: 0,
      subcategories: [],
    },
  ]);
  vi.mocked(management.adminAreas).mockResolvedValue([
    {
      id: "a",
      name: "Test area",
      city: "Test town",
      pincodes: ["999999"],
      active: true,
      version: 0,
    },
  ]);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.resetAllMocks();
});
it("uses independent seller and shop counts and supports owner/address search and status filters", async () => {
  mount();
  await screen.findByRole("tab", { name: "All (2)" });
  expect(screen.getByRole("button", { name: /Total sellers/ })).toHaveTextContent("1");
  expect(screen.getByRole("tab", { name: "Pending (1)", hidden: true })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search applications" }), {
    target: { value: "Owner One" },
  });
  expect(screen.getAllByText("Alpha Counter").length).toBeGreaterThan(0);
  expect(screen.queryByText("Zulu Shop")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search applications" }), {
    target: { value: "no match" },
  });
  await screen.findByText("No matching applications");
  fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
  await screen.findByText(/2 matching/);
  expect(screen.getByLabelText("Sort by")).toHaveValue("az");
});
it("requires explicit confirmation before approving and refreshes server data on success", async () => {
  vi.mocked(management.approve).mockResolvedValue({ ...shop, status: "approved", version: 1 });
  mount();
  await screen.findByRole("tab", { name: "All (2)" });
  fireEvent.click(screen.getAllByRole("button", { name: /^Approve$/ })[0]);
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Review and save decision" }));
  await screen.findByRole("alertdialog");
  expect(management.approve).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm decision" }));
  await waitFor(() => expect(management.approve).toHaveBeenCalledWith(shop, "approved", undefined));
  await waitFor(() => expect(management.shops).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
it("retains reason and dialog on failed review without updating local approval counts", async () => {
  vi.mocked(management.approve).mockRejectedValue(new Error("Version changed; reload"));
  mount();
  await screen.findByRole("tab", { name: "All (2)" });
  fireEvent.click(screen.getAllByRole("button", { name: "Reject" })[0]);
  await screen.findByRole("dialog");
  fireEvent.change(screen.getByLabelText(/Reason for seller/), {
    target: { value: "Address details need correction" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review and save decision" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirm decision" }));
  await screen.findAllByText("Version changed; reload");
  expect(screen.getByLabelText(/Reason for seller/)).toHaveValue("Address details need correction");
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Pending (1)", hidden: true })).toBeInTheDocument();
});
it("uses an honest empty state and refetch action without fabricated applications", async () => {
  vi.mocked(management.shops).mockResolvedValue([]);
  mount();
  await screen.findByText("No shop submissions yet");
  expect(screen.getByRole("tab", { name: "All (0)" })).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Refresh data" })[0]);
  await waitFor(() => expect(management.shops).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
it("keeps errors separate from empty results and does not show zero counts on failed load", async () => {
  vi.mocked(management.shops).mockRejectedValue(new Error("Offline"));
  vi.mocked(management.sellers).mockRejectedValue(new Error("Offline"));
  mount();
  await screen.findByText("Shop submissions could not be refreshed.");
  expect(screen.queryByText("No shop submissions yet")).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "All (—)" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry applications" })).toBeEnabled();
});
it("blocks repeated confirmation requests while server review is pending", async () => {
  vi.mocked(management.approve).mockImplementation(() => new Promise(() => {}));
  mount();
  await screen.findByRole("tab", { name: "All (2)" });
  fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0]);
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Review and save decision" }));
  const confirm = await screen.findByRole("button", { name: "Confirm decision" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await waitFor(() => expect(management.approve).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "Keep editing" })).toBeDisabled();
});
