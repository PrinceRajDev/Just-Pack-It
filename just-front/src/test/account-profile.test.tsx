import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountProfile } from "@/components/auth/AccountProfile";
import { authentication } from "@/services/auth";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/stores/auth", () => ({
  useAuth: () => ({ session: { userId: "a" }, refreshProfile: refresh }),
}));
vi.mock("@/services/auth", () => ({
  authentication: { profile: vi.fn(), updateProfile: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AccountProfile />
    </QueryClientProvider>,
  );
}
it("saves name only with version and refreshes session display", async () => {
  vi.mocked(authentication.profile).mockResolvedValue({
    name: "Old name",
    phone: "+919999999999",
    emailVerified: false,
    version: 2,
  });
  vi.mocked(authentication.updateProfile).mockResolvedValue({
    name: "New name",
    phone: "+919999999999",
    emailVerified: false,
    version: 3,
  });
  refresh.mockResolvedValue(undefined);
  mount();
  expect(await screen.findByRole("button", { name: "Save profile" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "New name" } });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await waitFor(() => expect(authentication.updateProfile).toHaveBeenCalledWith("New name", 2));
  expect(await screen.findByText("Saved name: New name")).toBeInTheDocument();
  expect(refresh).toHaveBeenCalledOnce();
  expect(screen.getByText(/Phone and email changes need verification/)).toBeInTheDocument();
});
it("keeps draft and explains reload when server rejects stale changes", async () => {
  vi.mocked(authentication.profile).mockResolvedValue({
    name: "Old name",
    phone: "+919999999999",
    emailVerified: false,
    version: 0,
  });
  vi.mocked(authentication.updateProfile).mockRejectedValue(new Error("Profile changed"));
  mount();
  await screen.findByLabelText("Your name");
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Draft name" } });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Reload");
  expect(screen.getByLabelText("Your name")).toHaveValue("Draft name");
});
