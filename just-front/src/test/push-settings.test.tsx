import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PushSettings } from "@/components/common/PushSettings";
import { browserPush } from "@/services/push";
vi.mock("@/stores/auth", () => ({
  useAuth: () => ({ session: { userId: "buyer", role: "buyer" } }),
}));
vi.mock("@/services/push", () => ({
  pushConfigured: true,
  browserPush: { status: vi.fn(), enable: vi.fn(), disable: vi.fn() },
}));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(browserPush.status).mockResolvedValue({ available: true, subscribed: false });
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PushSettings />
    </QueryClientProvider>,
  );
  return client;
}
it("requests browser opt-in only after an explicit click", async () => {
  vi.mocked(browserPush.enable).mockResolvedValue();
  const client = mount();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Enable browser alerts" })).toBeEnabled(),
  );
  expect(browserPush.enable).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Enable browser alerts" }));
  expect(
    await screen.findByText("Browser alert preference saved for this login."),
  ).toBeInTheDocument();
  expect(browserPush.enable).toHaveBeenCalledTimes(1);
  client.clear();
});
it("does not report success for denied permission", async () => {
  vi.mocked(browserPush.enable).mockRejectedValue(new Error("Alerts were not allowed."));
  const client = mount();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Enable browser alerts" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Enable browser alerts" }));
  expect(await screen.findByText("Alerts were not allowed.")).toBeInTheDocument();
  expect(
    screen.queryByText("Browser alert preference saved for this login."),
  ).not.toBeInTheDocument();
  client.clear();
});
it("lets the current login disable browser alerts", async () => {
  vi.mocked(browserPush.status).mockResolvedValue({ available: true, subscribed: true });
  vi.mocked(browserPush.disable).mockResolvedValue();
  const client = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Turn off browser alerts" }));
  await waitFor(() => expect(browserPush.disable).toHaveBeenCalledTimes(1));
  client.clear();
});
