import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ShopAvailability } from "@/components/portal/ShopAvailability";
import type { ManagedShop } from "@/domain/management";
import { management } from "@/services/management";
import { ApiError } from "@/lib/api/client";
vi.mock("@/services/management", () => ({ management: { availability: vi.fn() } }));
const shop = {
  id: "qa",
  slug: "qa",
  name: "QA Shop",
  tagline: "",
  locality: "QA",
  categories: [],
  isOpen: true,
  hours: "QA hours",
  fulfilment: ["pickup"],
  since: 2026,
  initials: "QA",
  version: 0,
  status: "approved",
  active: true,
  categoryIds: [],
  subcategoryIds: [],
  serviceAreaIds: [],
  timezone: "Asia/Kolkata",
  openingHours: [{ day: 1, opens: "09:00", closes: "18:00" }],
  deliveryFee: 0,
} as ManagedShop;
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <ShopAvailability shop={shop} />
    </QueryClientProvider>,
  );
}
it("saves own version with pause and fulfilment without approval/owner fields", async () => {
  vi.mocked(management.availability).mockResolvedValue(shop);
  mount();
  fireEvent.click(screen.getByRole("checkbox", { name: "Temporarily close for new orders" }));
  fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
  await waitFor(() => expect(management.availability).toHaveBeenCalledOnce());
  const [record, input] = vi.mocked(management.availability).mock.calls[0];
  expect(record.version).toBe(0);
  expect(input.temporarilyClosed).toBe(true);
  expect(input.deliveryFee).toBe(0);
  expect(input.fulfilment).toEqual(["pickup"]);
  expect(input).not.toHaveProperty("status");
  expect(input).not.toHaveProperty("ownerId");
});
it("requires a fulfilment option", () => {
  mount();
  fireEvent.click(screen.getByRole("checkbox", { name: "Store pickup" }));
  expect(screen.getByRole("button", { name: "Save availability" })).toBeDisabled();
});
it("retains draft and blocks retry against a stale version", async () => {
  vi.mocked(management.availability).mockRejectedValue(
    new ApiError("Changed elsewhere", 409, "VERSION_CONFLICT"),
  );
  mount();
  fireEvent.click(screen.getByRole("checkbox", { name: "Temporarily close for new orders" }));
  fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
  await screen.findByText("Changed elsewhere");
  expect(screen.getByRole("checkbox", { name: "Temporarily close for new orders" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Save availability" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Reload latest settings" })).toBeEnabled();
});
