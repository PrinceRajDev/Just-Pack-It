import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EmailOtpField } from "@/components/auth/EmailOtpField";
import { authentication } from "@/services/auth";
vi.mock("@/services/auth", () => ({ authentication: { sendEmailOtp: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("sends explicitly, binds entered OTP to its email and invalidates it when the email changes", async () => {
  const onProof = vi.fn(),
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(authentication.sendEmailOtp).mockResolvedValue({
    challengeId: "11111111-1111-4111-8111-111111111111",
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    resendAfterSeconds: 60,
  });
  render(
    <QueryClientProvider client={client}>
      <EmailOtpField available disabled={false} onProof={onProof} />
    </QueryClientProvider>,
  );
  expect(authentication.sendEmailOtp).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "Buyer@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send email code" }));
  fireEvent.change(await screen.findByLabelText("Six-digit email code"), {
    target: { value: "123456" },
  });
  await waitFor(() =>
    expect(onProof).toHaveBeenLastCalledWith({
      email: "buyer@example.test",
      emailChallengeId: "11111111-1111-4111-8111-111111111111",
      emailOtp: "123456",
    }),
  );
  expect(screen.getByRole("button", { name: /Resend in/ })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "other@example.test" },
  });
  await waitFor(() => expect(onProof).toHaveBeenLastCalledWith(undefined));
  client.clear();
});
it("shows unavailable sender configuration without pretending an OTP was sent", () => {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <EmailOtpField available={false} disabled={false} onProof={() => {}} />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("awaiting sender configuration");
  expect(screen.getByRole("button", { name: "Send email code" })).toBeDisabled();
  client.clear();
});
