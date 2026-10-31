import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationBell } from "@/components/common/NotificationBell";
import { notifications } from "@/services/notifications";
const state = vi.hoisted(() => ({ demo: false }));
vi.mock("@/components/common/PushSettings", () => ({ PushSettings: () => null }));
vi.mock("@/lib/config", () => ({
  isDemoMode: false,
  config: { apiUrl: "http://isolated.invalid" },
}));
vi.mock("@/stores/auth", () => ({
  useAuth: () => ({ session: { userId: "buyer", role: "buyer", isDemo: state.demo } }),
}));
vi.mock("@/services/notifications", () => ({
  notifications: { count: vi.fn(), list: vi.fn(), read: vi.fn() },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  state.demo = false;
  vi.mocked(notifications.count).mockResolvedValue({ count: 1 });
  vi.mocked(notifications.list).mockResolvedValue({
    items: [
      {
        id: "one",
        title: "Order placed",
        body: "Check your order",
        link: "/orders/one",
        createdAt: "2026-10-30T10:00:00Z",
        read: false,
      },
    ],
    next: undefined,
  });
  vi.mocked(notifications.read).mockResolvedValue();
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NotificationBell />
    </QueryClientProvider>,
  );
  return client;
}
it("loads on opening, shows unread updates and marks them read", async () => {
  const client = mount();
  expect(notifications.list).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
  expect(await screen.findByText("Order placed")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute("href", "/orders/one");
  fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
  await waitFor(() => expect(notifications.read).toHaveBeenCalledWith("one", expect.anything()));
  client.clear();
});
it("does not fabricate demo notifications or contact the API in demo sessions", () => {
  state.demo = true;
  const client = mount();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(notifications.count).not.toHaveBeenCalled();
  client.clear();
});
it("shows a recoverable loading error", async () => {
  vi.mocked(notifications.list).mockRejectedValue(new Error("offline"));
  const client = mount();
  fireEvent.click(await screen.findByRole("button", { name: /Notifications/ }));
  expect(await screen.findByText("Couldn’t load updates.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  client.clear();
});
