import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminUsers } from "@/components/portal/AdminUsers";
import { adminUsers } from "@/services/admin-users";
vi.mock("@/stores/auth", () => ({ useAuth: () => ({ session: { userId: "admin" } }) }));
vi.mock("@/services/admin-users", () => ({ adminUsers: { list: vi.fn(), access: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const user = {
  id: "buyer",
  name: "QA Buyer",
  phone: "+919000000001",
  role: "buyer" as const,
  active: true,
  version: 2,
  emailVerified: false,
  createdAt: null,
};
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdminUsers />
    </QueryClientProvider>,
  );
}
it("requires reason and explicit confirmation before changing server account access", async () => {
  vi.mocked(adminUsers.list).mockResolvedValue({ items: [user], total: 1 });
  vi.mocked(adminUsers.access).mockResolvedValue({ ...user, active: false, version: 3 });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Review account" }));
  const action = screen.getByRole("button", { name: "Block account" });
  expect(action).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason for access change"), {
    target: { value: "Confirmed QA account restriction" },
  });
  fireEvent.click(action);
  expect(adminUsers.access).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", { name: "Confirm access change" }),
  );
  await waitFor(() =>
    expect(adminUsers.access).toHaveBeenCalledWith(user, false, "Confirmed QA account restriction"),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("protects admin accounts and never exposes a role mutation control", async () => {
  vi.mocked(adminUsers.list).mockResolvedValue({
    items: [{ ...user, id: "admin", role: "admin" }],
    total: 1,
  });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Review account" }));
  expect(screen.getByText(/Admin accounts and your own account are protected/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Block account" })).toBeNull();
  expect(within(screen.getByRole("dialog")).queryByRole("combobox")).toBeNull();
});
it("resets signed pagination when role filters change", async () => {
  vi.mocked(adminUsers.list).mockResolvedValue({ items: [], total: 27, next: "more" });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Next accounts" }));
  await waitFor(() =>
    expect(adminUsers.list).toHaveBeenCalledWith({ role: "all", state: "all" }, "more"),
  );
  fireEvent.change(screen.getByLabelText("Account role", { exact: true }), {
    target: { value: "seller" },
  });
  await waitFor(() =>
    expect(adminUsers.list).toHaveBeenCalledWith({ role: "seller", state: "all" }, undefined),
  );
});
it("retains the reason and requires refresh after a failed account decision", async () => {
  vi.mocked(adminUsers.list).mockResolvedValue({ items: [user], total: 1 });
  vi.mocked(adminUsers.access).mockRejectedValue(new Error("Version changed"));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Review account" }));
  fireEvent.change(screen.getByLabelText("Reason for access change"), {
    target: { value: "Confirmed QA restriction reason" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Block account" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm access change" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Reason for access change")).toHaveValue(
    "Confirmed QA restriction reason",
  );
  expect(screen.getByRole("button", { name: "Block account" })).toBeDisabled();
});
