import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
vi.mock("@/lib/config", () => ({ config: { apiUrl: "http://api.test" }, isDemoMode: false }));
import { AuthProvider, useAuth } from "@/stores/auth";
import { authentication } from "@/services/auth";
import { sessionStorageKey } from "@/lib/api/client";
vi.mock("@/services/auth", () => ({ authentication: { me: vi.fn() } }));
const profile = { userId: "buyer", name: "Test buyer", role: "buyer" as const, isDemo: false };
function Consumer() {
  const { session, ready, clearSession } = useAuth();
  return (
    <>
      <p>{ready ? (session?.name ?? "Signed out") : "Loading"}</p>
      <button onClick={clearSession}>Clear session</button>
    </>
  );
}
function mount() {
  const client = new QueryClient();
  client.setQueryData(["seller-products"], [{ private: true }]);
  client.setQueryData(["categories"], [{ public: true }]);
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  localStorage.setItem(sessionStorageKey, JSON.stringify({ ...profile, token: "test-token" }));
  vi.mocked(authentication.me).mockResolvedValue(profile);
});
afterEach(cleanup);
it("clears local session and private cache without an unnecessary server logout request", async () => {
  const client = mount();
  await screen.findByText("Test buyer");
  fireEvent.click(screen.getByRole("button", { name: "Clear session" }));
  await screen.findByText("Signed out");
  expect(localStorage.getItem(sessionStorageKey)).toBeNull();
  expect(client.getQueryData(["seller-products"])).toBeUndefined();
  expect(client.getQueryData(["categories"])).toBeDefined();
});
it("clears stale account state on another tab session change without deleting the new tab's session", async () => {
  mount();
  await screen.findByText("Test buyer");
  const replacement = JSON.stringify({ ...profile, userId: "other", token: "new-token" });
  localStorage.setItem(sessionStorageKey, replacement);
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: sessionStorageKey, newValue: replacement }),
    ),
  );
  await screen.findByText("Signed out");
  expect(localStorage.getItem(sessionStorageKey)).toBe(replacement);
});
it("does not restore a stale bootstrap profile after cross-tab revocation", async () => {
  let finish!: (value: typeof profile) => void;
  vi.mocked(authentication.me).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  mount();
  await waitFor(() => expect(authentication.me).toHaveBeenCalled());
  localStorage.removeItem(sessionStorageKey);
  act(() =>
    window.dispatchEvent(new StorageEvent("storage", { key: sessionStorageKey, newValue: null })),
  );
  await act(async () => finish(profile));
  await screen.findByText("Signed out");
  expect(screen.queryByText("Test buyer")).not.toBeInTheDocument();
});
