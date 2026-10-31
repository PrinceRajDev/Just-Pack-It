import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ProductModeration,
  Reconciliation,
  AuditExplorer,
} from "@/components/portal/AdminWorkspace";
import { SupportConversation } from "@/components/common/SupportConversation";
import { adminWorkspace } from "@/services/admin-workspace";
import { support } from "@/services/support";
import type { SupportTicket } from "@/domain/support";
import type { ReactNode } from "react";
vi.mock("@/services/admin-workspace", () => ({
  adminWorkspace: { products: vi.fn(), moderate: vi.fn(), audit: vi.fn(), reconciliation: vi.fn() },
}));
vi.mock("@/services/support", () => ({ support: { messages: vi.fn(), reply: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function mount(child: ReactNode) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {child}
    </QueryClientProvider>,
  );
}
it("moderation requires seller-visible reason and server confirmation", async () => {
  const product = {
    id: "p",
    name: "Test rice",
    shopName: "Test shop",
    shopId: "shop",
    version: 3,
    active: true,
    price: 25,
    variantCount: 1,
    moderation: null,
  };
  vi.mocked(adminWorkspace.products).mockResolvedValue({ items: [product] });
  vi.mocked(adminWorkspace.moderate).mockRejectedValue(new Error("Listing changed; refresh"));
  mount(<ProductModeration />);
  fireEvent.click((await screen.findAllByRole("button", { name: "View / moderate" }))[0]);
  const button = await screen.findByRole("button", { name: "Block listing" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason for seller"), {
    target: { value: "TEST policy" },
  });
  fireEvent.click(button);
  expect(adminWorkspace.moderate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm moderation" }));
  await screen.findByText("Listing changed; refresh");
  expect(adminWorkspace.moderate).toHaveBeenCalledWith(product, true, "TEST policy");
});
it("reconciliation does not claim money settled and audit explains coverage", async () => {
  vi.mocked(adminWorkspace.reconciliation).mockResolvedValue({ checkedAt: "now", items: [] });
  vi.mocked(adminWorkspace.audit).mockResolvedValue({ items: [] });
  mount(
    <>
      <Reconciliation />
      <AuditExplorer />
    </>,
  );
  await screen.findByText(/Read-only order allocations/);
  expect(screen.getByText(/No historical backfill/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Transfer|Pay seller/ })).toBeNull();
});
const ticket = { id: "ticket", version: 3, status: "resolved" } as SupportTicket;
it("reopen requires explanation, keeps text after error and reuses message key on retry", async () => {
  vi.mocked(support.messages).mockResolvedValue({
    items: [
      {
        id: "m",
        role: "admin",
        body: "<script>plain text</script>",
        kind: "status",
        createdAt: "2026-10-31T10:00:00Z",
      },
    ],
  });
  vi.mocked(support.reply)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ version: 4 });
  mount(<SupportConversation ticket={ticket} />);
  await screen.findByText("<script>plain text</script>");
  const button = screen.getByRole("button", { name: "Reopen ticket" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason to reopen (at least 10 characters)"), {
    target: { value: "Still missing the original item" },
  });
  fireEvent.click(button);
  await screen.findByText(/offline/);
  const first = vi.mocked(support.reply).mock.calls[0];
  fireEvent.click(screen.getByRole("button", { name: "Reopen ticket" }));
  await waitFor(() => expect(support.reply).toHaveBeenCalledTimes(2));
  expect(vi.mocked(support.reply).mock.calls[1][2]).toBe(first[2]);
  expect(first[3]).toBe(true);
  expect(document.querySelector("script")).toBeNull();
});
it("conversation failure has retry without dropping the reply draft", async () => {
  vi.mocked(support.messages).mockRejectedValue(new Error("offline"));
  mount(<SupportConversation ticket={{ ...ticket, status: "open" }} />);
  await screen.findByRole("alert");
  fireEvent.change(screen.getByLabelText("Your reply"), { target: { value: "My draft reply" } });
  fireEvent.click(screen.getByRole("button", { name: "Refresh conversation" }));
  expect(screen.getByLabelText("Your reply")).toHaveValue("My draft reply");
});
