import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminSettings } from "@/components/portal/AdminSettings";
import { AuditExplorer } from "@/components/portal/SettingsAudit";
import { management } from "@/services/management";
import { adminWorkspace } from "@/services/admin-workspace";
import type { ManagedShop } from "@/domain/management";
vi.mock("@/components/portal/AdminWorkspace", () => ({ AuditExplorer: () => null }));
vi.mock("@/services/management", () => ({
  management: { adminAreas: vi.fn(), shops: vi.fn(), area: vi.fn() },
}));
vi.mock("@/services/admin-workspace", () => ({ adminWorkspace: { audit: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const area = {
  id: "a",
  name: "QA Market",
  city: "QA Town",
  pincodes: ["999999"],
  active: true,
  version: 2,
};
function mount(node = <AdminSettings />) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}
function setup() {
  vi.mocked(management.adminAreas).mockResolvedValue([area]);
  vi.mocked(management.shops).mockResolvedValue([
    {
      id: "s1",
      name: "QA pin",
      serviceAreaIds: ["a"],
      active: true,
      status: "approved",
      location: { coordinates: [86, 26] },
    },
    { id: "s2", name: "QA missing", serviceAreaIds: ["a"], active: true, status: "approved" },
    { id: "s3", name: "QA pending", serviceAreaIds: ["a"], active: true, status: "pending" },
  ] as ManagedShop[]);
}
it("counts actual approved shop assignments and missing pins without treating pending shops as eligible", async () => {
  setup();
  mount();
  await screen.findByRole("button", { name: "Edit QA Market" });
  const stats = screen.getByRole("region", { name: "Service area statistics" });
  await waitFor(() => expect(within(stats).getAllByText("1", { exact: true })).toHaveLength(3));
  expect(within(stats).getByText("2", { exact: true })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search service areas"), { target: { value: "unknown" } });
  expect(screen.getByText("No matching service areas")).toBeInTheDocument();
  expect(within(stats).getByText("2", { exact: true })).toBeInTheDocument();
});
it("creates using only supported fields and resets only after server success", async () => {
  setup();
  vi.mocked(management.area).mockResolvedValue({ ...area, id: "new" });
  mount();
  await screen.findByRole("button", { name: "Edit QA Market" });
  fireEvent.change(screen.getByLabelText("Area / locality name"), {
    target: { value: " New Lane " },
  });
  fireEvent.change(screen.getByLabelText("City / town"), { target: { value: " Town " } });
  fireEvent.change(screen.getByLabelText("Pincodes (comma separated)"), {
    target: { value: "999997, 999998" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save area" }));
  await waitFor(() =>
    expect(management.area).toHaveBeenCalledWith(
      { name: "New Lane", city: "Town", pincodes: ["999997", "999998"] },
      undefined,
    ),
  );
  await waitFor(() => expect(screen.getByLabelText("Area / locality name")).toHaveValue(""));
});
it("retains failed deactivation draft and existing version/reference checks", async () => {
  setup();
  vi.mocked(management.area).mockRejectedValue(new Error("Area still has shop references"));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Edit QA Market" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Active area" }));
  fireEvent.click(screen.getByRole("button", { name: "Save area" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("checkbox", { name: "Active area" })).not.toBeChecked();
  expect(management.area).toHaveBeenCalledWith(
    { name: "QA Market", city: "QA Town", pincodes: ["999999"], active: false },
    area,
  );
});
it("shows unavailable shop metrics when readiness fails, keeping area management available", async () => {
  setup();
  vi.mocked(management.shops).mockRejectedValue(new Error("Offline shops"));
  mount();
  await screen.findByRole("alert");
  expect(screen.getAllByText("Data unavailable")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Edit QA Market" })).toBeEnabled();
});
it("uses exact supported audit filters, normalizes UUIDs and clears without fake date filtering", async () => {
  vi.mocked(adminWorkspace.audit).mockResolvedValue({ items: [] });
  mount(<AuditExplorer />);
  await screen.findByText("No matching audit records");
  fireEvent.change(screen.getByLabelText("Exact action"), { target: { value: " product.block " } });
  fireEvent.change(screen.getByLabelText("Target ID"), {
    target: { value: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Filter audit" }));
  await waitFor(() =>
    expect(adminWorkspace.audit).toHaveBeenCalledWith(
      { action: "product.block", targetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      undefined,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear audit filters" }));
  expect(screen.getByLabelText("Target ID")).toHaveValue("");
  expect(screen.getByText(/Date-range filtering/)).toBeInTheDocument();
});
