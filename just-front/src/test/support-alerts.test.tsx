vi.mock("@/components/common/SupportConversation", () => ({ SupportConversation: () => null }));
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { OrderSupport } from "@/components/store/OrderSupport";
import { LiveSupport } from "@/components/portal/LiveSupport";
import { SellerOrderAlerts } from "@/components/portal/SellerOrderAlerts";
import { unseenOrders } from "@/lib/seller-alerts";
import { support } from "@/services/support";
import { sellerOrders } from "@/services/seller-orders";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ search, children }: { search: { orderId: string }; children: ReactNode }) => (
    <a href={`/admin/orders?orderId=${search.orderId}`}>{children}</a>
  ),
}));
vi.mock("@/services/support", () => ({
  support: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("@/services/seller-orders", () => ({ sellerOrders: { list: vi.fn() } }));
vi.mock("@/components/portal/PortalShell", () => ({
  PortalHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());
function mount(node: ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}
const ticket = {
  id: "sub",
  orderId: "order",
  suborderId: "sub",
  shopName: "TEST",
  kind: "quality",
  description: "TEST issue description",
  status: "open" as const,
  version: 0,
  note: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
it("does not consider initial orders or repeated IDs new", () => {
  expect(unseenOrders(null, ["a"])).toEqual([]);
  expect(unseenOrders(new Set(["a"]), ["a", "b"])).toEqual(["b"]);
});
it("requires buyer description and submits actual order/suborder context", async () => {
  vi.mocked(support.list).mockResolvedValue({ items: [] });
  vi.mocked(support.create).mockResolvedValue(ticket);
  mount(<OrderSupport orderId="order" suborderId="sub" />);
  expect(await screen.findByRole("button", { name: "Report issue" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Describe the issue"), {
    target: { value: "TEST issue description" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Report issue" }));
  await waitFor(() =>
    expect(support.create).toHaveBeenCalledWith({
      orderId: "order",
      suborderId: "sub",
      kind: "missing_item",
      description: "TEST issue description",
    }),
  );
});
it("shows existing resolution without offering duplicate report", async () => {
  vi.mocked(support.list).mockResolvedValue({
    items: [{ ...ticket, status: "resolved", note: "TEST resolved note" }],
  });
  mount(<OrderSupport orderId="order" suborderId="sub" />);
  expect(await screen.findByText("Admin note: TEST resolved note")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Report issue" })).toBeNull();
});
it("does not replace failed support loading with empty state", async () => {
  vi.mocked(support.list).mockRejectedValue(new Error("offline"));
  mount(<OrderSupport orderId="order" suborderId="sub" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load support");
  expect(support.create).not.toHaveBeenCalled();
});
it("requires a buyer-visible admin note and sends optimistic version", async () => {
  vi.mocked(support.list).mockResolvedValue({ items: [ticket] });
  vi.mocked(support.update).mockResolvedValue(undefined);
  mount(<LiveSupport />);
  fireEvent.click(await screen.findByRole("button", { name: "View ticket" }));
  expect(await screen.findByRole("button", { name: "Resolve ticket" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "View order" })).toHaveAttribute(
    "href",
    "/admin/orders?orderId=order",
  );
  fireEvent.change(screen.getByLabelText("Buyer-visible update / resolution"), {
    target: { value: "TEST investigating" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Mark in progress" }));
  await waitFor(() =>
    expect(support.update).toHaveBeenCalledWith(ticket, "in_progress", "TEST investigating"),
  );
});
it("keeps sound opt-in and reports unsupported audio without breaking review", async () => {
  vi.mocked(sellerOrders.list).mockResolvedValue([]);
  const review = vi.fn();
  mount(<SellerOrderAlerts shopId="shop" onReview={review} />);
  expect(await screen.findByText("0 orders awaiting acceptance")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enable order sound" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  fireEvent.click(screen.getByRole("button", { name: "Enable order sound" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Sound is unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Review new orders" }));
  expect(review).toHaveBeenCalledOnce();
});

it("sounds once for a newly observed order after explicit opt-in", async () => {
  const start = vi.fn(),
    ctx = {
      state: "running",
      currentTime: 0,
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      createOscillator: () => ({ frequency: { value: 0 }, connect: vi.fn(), start, stop: vi.fn() }),
      createGain: () => ({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      }),
    };
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return ctx;
      }
    },
  );
  try {
    vi.mocked(sellerOrders.list).mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SellerOrderAlerts shopId="sound-shop" onReview={() => {}} />
      </QueryClientProvider>,
    );
    await screen.findByText("0 orders awaiting acceptance");
    fireEvent.click(screen.getByRole("button", { name: "Enable order sound" }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    client.setQueryData(["seller-orders", "sound-shop", "placed"], [{ orderId: "o", id: "s" }]);
    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    client.setQueryData(["seller-orders", "sound-shop", "placed"], [{ orderId: "o", id: "s" }]);
    expect(start).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("filters server-side and starts a new cursor chain when status changes", async () => {
  vi.mocked(support.list).mockImplementation(async (_order, after, status) =>
    status === "resolved"
      ? { items: [] }
      : {
          items: [{ ...ticket, id: after ? "second-ticket" : ticket.id }],
          next: after ? undefined : "next-cursor",
        },
  );
  mount(<LiveSupport />);
  await screen.findByText("TEST issue description");
  fireEvent.click(screen.getByRole("button", { name: "Load more tickets" }));
  await waitFor(() =>
    expect(support.list).toHaveBeenCalledWith(undefined, "next-cursor", undefined, undefined),
  );
  fireEvent.change(screen.getByLabelText("Ticket status"), { target: { value: "resolved" } });
  await screen.findByText(/No resolved tickets/);
  expect(support.list).toHaveBeenCalledWith(undefined, undefined, "resolved", undefined);
  expect(screen.queryByRole("button", { name: "Load more tickets" })).toBeNull();
  expect(screen.queryByText("TEST issue description")).toBeNull();
});

it("labels partial support statistics as loaded results rather than global totals", async () => {
  vi.mocked(support.list).mockResolvedValue({
    items: [ticket, { ...ticket, id: "resolved", status: "resolved" }],
    next: "more",
  });
  mount(<LiveSupport />);
  await screen.findByText(/More matching tickets are available/);
  const stats = screen.getByRole("region", { name: "Loaded ticket statistics" });
  expect(within(stats).getByText("2", { exact: true })).toBeInTheDocument();
  expect(within(stats).getAllByText("1", { exact: true })).toHaveLength(2);
  expect(screen.getByText(/not all marketplace tickets/)).toBeInTheDocument();
});
it("retains submitted search on failed listing request and does not claim zero tickets", async () => {
  vi.mocked(support.list).mockRejectedValue(new Error("Offline support"));
  mount(<LiveSupport />);
  await screen.findByRole("alert");
  fireEvent.change(screen.getByLabelText("Search support tickets"), {
    target: { value: "parcel" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search tickets" }));
  await waitFor(() =>
    expect(support.list).toHaveBeenCalledWith(undefined, undefined, undefined, "parcel"),
  );
  expect(screen.getByLabelText("Search support tickets")).toHaveValue("parcel");
  expect(
    await within(screen.getByRole("region", { name: "Loaded ticket statistics" })).findAllByText(
      "Count unavailable",
    ),
  ).toHaveLength(4);
  expect(screen.queryByText("No support tickets")).toBeNull();
});
it("locks duplicate status updates and preserves the buyer-visible draft on failure", async () => {
  vi.mocked(support.list).mockResolvedValue({ items: [ticket] });
  let rejectUpdate!: (error: Error) => void;
  vi.mocked(support.update).mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rejectUpdate = reject;
      }),
  );
  mount(<LiveSupport />);
  fireEvent.click(await screen.findByRole("button", { name: "View ticket" }));
  fireEvent.change(screen.getByLabelText("Buyer-visible update / resolution"), {
    target: { value: "Investigating this issue" },
  });
  const action = screen.getByRole("button", { name: "Resolve ticket" });
  fireEvent.click(action);
  fireEvent.click(action);
  expect(support.update).toHaveBeenCalledTimes(1);
  rejectUpdate(new Error("Version changed"));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Buyer-visible update / resolution")).toHaveValue(
    "Investigating this issue",
  );
});
