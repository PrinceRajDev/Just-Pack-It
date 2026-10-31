import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GpsAddressConfirmation } from "@/components/store/GpsAddressConfirmation";
import { savedAddresses } from "@/services/addresses";
vi.mock("@/stores/auth", () => ({
  useAuth: () => ({ session: { userId: "buyer", role: "buyer" } }),
}));
vi.mock("@/services/addresses", () => ({ savedAddresses: { create: vi.fn() } }));
const clients: QueryClient[] = [];
function mount() {
  const c = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  clients.push(c);
  render(
    <QueryClientProvider client={c}>
      <GpsAddressConfirmation
        area={{ id: "a", name: "QA local", city: "QA city", pincodes: ["999999"], active: true }}
        autoOpen={false}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm delivery address" }));
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.resetAllMocks();
});
beforeEach(() =>
  vi.mocked(savedAddresses.create).mockResolvedValue({
    id: "address",
    version: 0,
    label: "Home",
    line1: "Lane 1",
    locality: "QA",
    city: "QA",
    pincode: "999999",
  }),
);
it("invalidates written-address confirmation after text or pin changes", () => {
  mount();
  const confirm = screen.getByLabelText(/I checked this address and pincode/),
    save = screen.getByRole("button", { name: "Confirm and save address" });
  fireEvent.click(confirm);
  expect(save).toBeEnabled();
  fireEvent.change(screen.getByLabelText("House, street and landmark"), {
    target: { value: "Changed entrance" },
  });
  expect(confirm).not.toBeChecked();
  expect(save).toBeDisabled();
  fireEvent.click(confirm);
  fireEvent.change(screen.getByLabelText("Delivery latitude"), { target: { value: "26" } });
  expect(confirm).not.toBeChecked();
  expect(save).toBeDisabled();
});
it("restores keyboard focus to address trigger after dismissing the sheet", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: /^Close$/ }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Confirm delivery address" })).toHaveFocus(),
  );
});
it("keeps failed-save values and requires only one request while submission is pending", async () => {
  let reject!: (e: Error) => void;
  vi.mocked(savedAddresses.create).mockImplementation(
    () =>
      new Promise((_ok, no) => {
        reject = no;
      }),
  );
  mount();
  fireEvent.change(screen.getByLabelText("Address label"), { target: { value: "Home" } });
  fireEvent.change(screen.getByLabelText("House, street and landmark"), {
    target: { value: "QA Lane 1" },
  });
  fireEvent.click(screen.getByLabelText(/I checked this address and pincode/));
  const form = screen.getByRole("button", { name: "Confirm and save address" }).closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() => expect(savedAddresses.create).toHaveBeenCalledTimes(1));
  reject(new Error("Offline: retry saving"));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("House, street and landmark")).toHaveValue("QA Lane 1");
  expect(screen.getByRole("button", { name: "Confirm and save address" })).toBeEnabled();
});
