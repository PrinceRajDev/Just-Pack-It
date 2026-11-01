import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ManagedProduct } from "@/domain/management";
import { LiveInventory } from "@/components/portal/LiveInventory";
import { management } from "@/services/management";
vi.mock("@/services/management", () => ({ management: { products: vi.fn(), inventory: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/portal/useDraftGuard", () => ({
  useDraftGuard: () => ({ dialog: null, mark: vi.fn(), reset: vi.fn() }),
}));
const product = {
  id: "p",
  name: "Rice",
  unit: "1 kg",
  stock: 7,
  version: 3,
  active: true,
  variants: [],
} as unknown as ManagedProduct;
const clients: QueryClient[] = [];
function mount() {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(c);
  render(
    <QueryClientProvider client={c}>
      <LiveInventory />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.resetAllMocks();
});
it("keeps low-stock search, no-results and manual refresh working", async () => {
  vi.mocked(management.products).mockResolvedValue([
    product,
    {
      ...product,
      id: "low",
      name: "Milk",
      stock: 2,
      active: false,
      moderation: { blocked: true, reason: "Review" },
    },
  ]);
  mount();
  await screen.findByText("Milk");
  fireEvent.change(screen.getByLabelText("Stock status"), { target: { value: "low" } });
  expect(screen.queryByText("Rice")).not.toBeInTheDocument();
  expect(screen.getByText(/Blocked by admin/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search stock"), { target: { value: "missing" } });
  expect(screen.getByText("No stock matches these filters")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search stock"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Stock status"), { target: { value: "all" } });
  expect(screen.getByText("Rice")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh stock" }));
  await waitFor(() => expect(management.products).toHaveBeenCalledTimes(2));
});
it("saves only the versioned stock of a simple listing", async () => {
  vi.mocked(management.products).mockResolvedValue([product]);
  vi.mocked(management.inventory).mockResolvedValue({ ...product, stock: 4, version: 4 });
  mount();
  fireEvent.change(await screen.findByLabelText("Stock for Rice"), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "Save stock" }));
  await waitFor(() => expect(management.inventory).toHaveBeenCalledWith(product, 4));
  expect(screen.queryByText("Your catalogue")).not.toBeInTheDocument();
});
it("shows independent variant quantities and filters out-of-stock options without a base stock input", async () => {
  vi.mocked(management.products).mockResolvedValue([
    product,
    {
      ...product,
      id: "v",
      name: "Shirt",
      stock: 99,
      variants: [
        { id: "s", label: "Small", stock: 0, price: 100, attributes: [] },
        { id: "m", label: "Medium", stock: 8, price: 150, attributes: [] },
      ],
    },
  ]);
  mount();
  await screen.findByText("Shirt");
  fireEvent.change(screen.getByLabelText("Stock status"), { target: { value: "out" } });
  expect(screen.queryByText("Rice")).not.toBeInTheDocument();
  expect(screen.getByText("Small")).toBeInTheDocument();
  expect(screen.getByText("8 available")).toBeInTheDocument();
  expect(screen.queryByLabelText("Stock for Shirt")).not.toBeInTheDocument();
  expect(management.inventory).not.toHaveBeenCalled();
});
it("preserves the entered quantity and displays a failed save", async () => {
  vi.mocked(management.products).mockResolvedValue([product]);
  vi.mocked(management.inventory).mockRejectedValue(new Error("Stock changed; refresh first"));
  mount();
  fireEvent.change(await screen.findByLabelText("Stock for Rice"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Save stock" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Stock changed");
  expect(screen.getByLabelText("Stock for Rice")).toHaveValue(2);
});
