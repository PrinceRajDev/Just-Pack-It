import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { AccountSecurity } from "@/components/auth/AccountSecurity";
import { authentication } from "@/services/auth";
import { ApiError } from "@/lib/api/client";
const { clearSession } = vi.hoisted(() => ({ clearSession: vi.fn() }));
vi.mock("@/stores/auth", () => ({ useAuth: () => ({ clearSession }) }));
vi.mock("@/services/auth", () => ({
  authentication: { changePassword: vi.fn(), logoutAll: vi.fn() },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <a
      href="/login"
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      {children}
    </a>
  ),
}));
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});
afterEach(cleanup);
function fill() {
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: "Current-password-2026" },
  });
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: "New-password-2026" },
  });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: "New-password-2026" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
}
it("requires acknowledgement and matching new passwords before clearing the session on success", async () => {
  vi.mocked(authentication.changePassword).mockResolvedValue();
  render(<AccountSecurity />);
  expect(screen.getByRole("button", { name: "Change password & sign out" })).toBeDisabled();
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Change password & sign out" }));
  await waitFor(() => expect(clearSession).toHaveBeenCalledTimes(1));
  expect(authentication.changePassword).toHaveBeenCalledWith(
    "Current-password-2026",
    "New-password-2026",
  );
  expect(localStorage.length).toBe(0);
});
it("does not submit mismatched confirmation", () => {
  render(<AccountSecurity />);
  fill();
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: "Mismatch-password-2026" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Change password & sign out" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/match its confirmation/);
  expect(authentication.changePassword).not.toHaveBeenCalled();
});
it("signs out every device only after current-password confirmation", async () => {
  vi.mocked(authentication.logoutAll).mockResolvedValue();
  render(<AccountSecurity />);
  fireEvent.change(screen.getByRole("combobox", { name: "Security action" }), {
    target: { value: "logout" },
  });
  expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: "Current-password-2026" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Sign out all devices" }));
  await waitFor(() => expect(clearSession).toHaveBeenCalled());
  expect(authentication.logoutAll).toHaveBeenCalledWith("Current-password-2026");
});
it("clears password fields but keeps the session after a definite incorrect-password rejection", async () => {
  vi.mocked(authentication.changePassword).mockRejectedValue(
    new ApiError("Current password is incorrect", 403, "CURRENT_PASSWORD_INVALID"),
  );
  render(<AccountSecurity />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Change password & sign out" }));
  await screen.findByText("Current password is incorrect");
  expect(clearSession).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Current password")).toHaveValue("");
  expect(screen.getByLabelText("New password")).toHaveValue("");
});
it("blocks blind retry on a lost response and offers fresh sign-in without claiming success", async () => {
  vi.mocked(authentication.changePassword).mockRejectedValue(
    new ApiError("Connection lost", 0, "NETWORK"),
  );
  render(<AccountSecurity />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Change password & sign out" }));
  await screen.findByText(/The result could not be confirmed/);
  expect(screen.getByLabelText("Current password")).toBeDisabled();
  expect(clearSession).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("link", { name: "Clear this session & sign in again" }));
  expect(clearSession).toHaveBeenCalledTimes(1);
});
