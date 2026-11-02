import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeliveryPartners } from "@/components/portal/DeliveryPartners";
import { delivery } from "@/services/delivery";
vi.mock("@/components/portal/DeliveryExceptions", () => ({ DeliveryExceptions: () => null }));
vi.mock("@/services/delivery", () => ({ delivery: { partners: vi.fn(), savePartner: vi.fn() } }));
vi.mock("@/services/management", () => ({
  management: { adminAreas: async () => [{ id: "area", name: "Test area", active: true }] },
}));
const partner = {
  id: "rider",
  name: "Test rider",
  active: true,
  approved: false,
  areaIds: [],
  version: 0,
  activeTask: false,
};
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DeliveryPartners />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("shows confirmed success even while the post-save list refresh is pending", async () => {
  vi.mocked(delivery.partners)
    .mockResolvedValueOnce([partner])
    .mockImplementation(() => new Promise(() => {}));
  vi.mocked(delivery.savePartner).mockResolvedValue({ version: 1 });
  mount();
  fireEvent.click(await screen.findByLabelText("Approved delivery partner"));
  fireEvent.click(screen.getByLabelText("Test area"));
  fireEvent.click(screen.getByRole("button", { name: "Save partner approval" }));
  await screen.findByText(/Test rider approved. Service areas saved/);
  expect(delivery.savePartner).toHaveBeenCalledWith(partner, true, ["area"]);
  expect(screen.getByLabelText("Approved delivery partner")).toBeChecked();
  expect(screen.getByRole("button", { name: "Save partner approval" })).toBeEnabled();
});
it("shows a failed save and unlocks the form without claiming approval", async () => {
  vi.mocked(delivery.partners).mockResolvedValue([partner]);
  vi.mocked(delivery.savePartner).mockRejectedValue(new Error("Approval was not saved"));
  mount();
  fireEvent.click(await screen.findByLabelText("Test area"));
  fireEvent.click(screen.getByRole("button", { name: "Save partner approval" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Approval was not saved");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save partner approval" })).toBeEnabled(),
  );
  expect(screen.queryByText(/Test rider approved/)).toBeNull();
});
