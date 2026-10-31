import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SavedAddresses } from "@/components/auth/SavedAddresses";
import { savedAddresses } from "@/services/addresses";
import { ApiError } from "@/lib/api/client";
vi.mock("@/services/addresses", () => ({
  savedAddresses: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));
vi.mock("@/components/portal/useDraftGuard", () => ({
  useDraftGuard: () => ({ mark: vi.fn(), reset: vi.fn(), dialog: null }),
}));
const address = {
  id: "owned-address",
  label: "Home",
  line1: "Street one",
  locality: "Test locality",
  city: "Test locality",
  pincode: "999999",
  version: 2,
};
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <SavedAddresses userId="buyer" />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(savedAddresses.list).mockResolvedValue([address]);
});
afterEach(cleanup);
describe("saved address management", () => {
  it("edits with the current version and shows server-confirmed success", async () => {
    vi.mocked(savedAddresses.update).mockResolvedValue({ ...address, label: "Work", version: 3 });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Home" }));
    fireEvent.change(screen.getByLabelText("Address label"), { target: { value: "Work" } });
    fireEvent.click(screen.getByRole("button", { name: "Save address" }));
    await screen.findByText("Address saved.");
    expect(savedAddresses.update).toHaveBeenCalledWith(address.id, 2, {
      label: "Work",
      line1: address.line1,
      locality: address.locality,
      city: address.city,
      pincode: address.pincode,
    });
  });
  it("keeps the draft on a conflict and allows cancellation", async () => {
    vi.mocked(savedAddresses.update).mockRejectedValue(new ApiError("Conflict", 409));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Home" }));
    fireEvent.change(screen.getByLabelText("Address label"), { target: { value: "Draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save address" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Address label")).toHaveValue("Draft");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Address label")).toBeNull();
  });
  it("requires explicit removal confirmation", async () => {
    vi.mocked(savedAddresses.remove).mockResolvedValue(undefined);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Remove Home" }));
    expect(savedAddresses.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    await screen.findByText("Address removed.");
    expect(savedAddresses.remove).toHaveBeenCalledWith(address.id, 2);
  });
  it("retries load failures and creates an address from an empty account", async () => {
    vi.mocked(savedAddresses.list)
      .mockRejectedValueOnce(new Error("Network"))
      .mockResolvedValue([]);
    vi.mocked(savedAddresses.create).mockResolvedValue(address);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Retry addresses" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add address" }));
    for (const [label, value] of [
      ["Address label", "Home"],
      ["House, street and landmark", "Street one"],
      ["Locality / village", "Test locality"],
      ["City / town", "Test locality"],
      ["Pincode", "999999"],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save address" }));
    await waitFor(() =>
      expect(savedAddresses.create).toHaveBeenCalledWith({
        label: "Home",
        line1: "Street one",
        locality: "Test locality",
        city: "Test locality",
        pincode: "999999",
      }),
    );
    await screen.findByText("Address saved.");
  });
});
