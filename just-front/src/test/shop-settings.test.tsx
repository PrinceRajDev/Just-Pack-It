import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ShopForm } from "@/components/portal/LiveSeller";
import { management } from "@/services/management";
import type { ManagedShop, ManagedCategory, ManagedArea } from "@/domain/management";
vi.mock("@/components/portal/useDraftGuard", () => ({
  useDraftGuard: () => ({ dialog: null, mark: vi.fn(), reset: vi.fn() }),
}));
vi.mock("@/components/portal/ShopReviewNotice", () => ({
  ShopReviewNotice: () => <p>Actual review notice</p>,
}));
vi.mock("@/components/portal/ShopGpsPin", () => ({
  ShopGpsPin: () => (
    <div>
      <input name="latitude" defaultValue="" />
      <input name="longitude" defaultValue="" />
    </div>
  ),
}));
vi.mock("@/components/portal/ShopAvailability", () => ({
  ShopAvailability: ({ disabled }: { disabled: boolean }) => (
    <button disabled={disabled}>Save availability</button>
  ),
}));
vi.mock("@/components/portal/ShopPhotoUpload", () => ({
  ShopPhotoUpload: ({ disabled }: { disabled: boolean }) => (
    <button disabled={disabled}>Save shop photo</button>
  ),
}));
vi.mock("@/services/management", () => ({ management: { saveShop: vi.fn() } }));
const shop = {
  id: "s",
  version: 2,
  name: "Real shop",
  categoryIds: ["c"],
  subcategoryIds: ["sub"],
  serviceAreaIds: ["a"],
  fulfilment: ["pickup"],
  initials: "RS",
  since: 2020,
  locality: "Market road",
  address: "Street",
  timezone: "Asia/Kolkata",
  openingHours: [{ day: 1, opens: "09:00", closes: "18:00" }],
  active: true,
  status: "approved",
  isOpen: true,
} as ManagedShop;
function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ShopForm
        shop={shop}
        categories={[
          {
            id: "c",
            name: "Food",
            subcategories: [{ id: "sub", name: "Snacks" }],
          } as ManagedCategory,
        ]}
        areas={[{ id: "a", name: "Market", pincodes: ["999999"] } as ManagedArea]}
      />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("keeps an unsaved profile when switching sections and blocks conflicting saves", () => {
  mount();
  fireEvent.change(screen.getByLabelText("Shop name"), { target: { value: "Updated shop" } });
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Hours & delivery" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(screen.getByRole("button", { name: "Save availability" })).toBeDisabled();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Shop details" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(screen.getByLabelText("Shop name")).toHaveValue("Updated shop");
  expect(management.saveShop).not.toHaveBeenCalled();
});
it("submits preserved categories, areas, hours and methods through the existing versioned API", async () => {
  vi.mocked(management.saveShop).mockResolvedValue(shop);
  mount();
  fireEvent.change(screen.getByLabelText("Shop name"), { target: { value: "Updated shop" } });
  fireEvent.submit(screen.getByLabelText("Shop name").closest("form")!);
  await waitFor(() =>
    expect(management.saveShop).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Updated shop",
        categoryIds: ["c"],
        subcategoryIds: ["sub"],
        serviceAreaIds: ["a"],
        fulfilment: ["pickup"],
        openingHours: shop.openingHours,
        timezone: "Asia/Kolkata",
        initials: "RS",
        since: 2020,
      }),
      2,
    ),
  );
});
