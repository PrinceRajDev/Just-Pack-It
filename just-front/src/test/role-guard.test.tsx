import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
const auth = vi.hoisted(() => ({
  ready: true,
  session: null as null | { role: "buyer" | "admin" },
  signOut: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/stores/auth", () => ({
  useAuth: () => auth,
  roleHome: { buyer: "/account", admin: "/admin" },
}));
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: "/admin/users" }),
  useNavigate: () => auth.navigate,
  Link: ({
    to,
    search,
    children,
    ...props
  }: {
    to: string;
    search?: { redirect: string };
    children: ReactNode;
  }) => (
    <a href={to + (search ? `?redirect=${encodeURIComponent(search.redirect)}` : "")} {...props}>
      {children}
    </a>
  ),
}));
afterEach(() => {
  cleanup();
  auth.ready = true;
  auth.session = null;
  vi.clearAllMocks();
});
it("keeps private content hidden and preserves the requested login destination", () => {
  render(<RoleGuard role="admin">Private records</RoleGuard>);
  expect(screen.queryByText("Private records")).toBeNull();
  expect(screen.getByRole("link", { name: "Sign in to continue" })).toHaveAttribute(
    "href",
    "/login?redirect=%2Fadmin%2Fusers",
  );
});
it("offers a safe account switch without revealing another role's content", async () => {
  auth.session = { role: "buyer" };
  render(<RoleGuard role="admin">Private records</RoleGuard>);
  expect(screen.queryByText("Private records")).toBeNull();
  expect(screen.getByRole("link", { name: "Go to my area" })).toHaveAttribute("href", "/account");
  const switchLink = screen.getByRole("button", { name: "Switch account" });
  fireEvent.click(switchLink);
  expect(auth.signOut).toHaveBeenCalledOnce();
  await waitFor(() => expect(auth.navigate).toHaveBeenCalled());
});
it("does not navigate if the server session could not be ended", async () => {
  auth.session = { role: "buyer" };
  auth.signOut.mockResolvedValue(false);
  render(<RoleGuard role="admin">Private records</RoleGuard>);
  fireEvent.click(screen.getByRole("button", { name: "Switch account" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Switch account" })).toBeEnabled());
  expect(auth.navigate).not.toHaveBeenCalled();
});
it("waits for logout before switching and ignores repeated clicks", async () => {
  auth.session = { role: "buyer" };
  let finish!: (value: boolean) => void;
  auth.signOut.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  render(<RoleGuard role="admin">Private records</RoleGuard>);
  const button = screen.getByRole("button", { name: "Switch account" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(auth.signOut).toHaveBeenCalledOnce();
  expect(auth.navigate).not.toHaveBeenCalled();
  finish(true);
  await waitFor(() =>
    expect(auth.navigate).toHaveBeenCalledWith({
      to: "/login",
      search: { redirect: "/admin/users" },
    }),
  );
});
it("renders the authorised workspace and waits for session hydration", () => {
  auth.session = { role: "admin" };
  auth.ready = false;
  const view = render(<RoleGuard role="admin">Private records</RoleGuard>);
  expect(screen.queryByText("Private records")).toBeNull();
  auth.ready = true;
  view.rerender(<RoleGuard role="admin">Private records</RoleGuard>);
  expect(screen.getByText("Private records")).toBeInTheDocument();
});
