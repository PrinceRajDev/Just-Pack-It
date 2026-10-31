import { afterEach, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RecoveryNotice } from "@/components/portal/RecoveryNotice";
afterEach(cleanup);
it("flags operator review without inferring payment failure or allowing stock release", () => {
  render(
    <RecoveryNotice
      recovery={{
        lastCheckedAt: "2026-10-30T00:00:00Z",
        nextCheckAt: "2026-10-30T01:00:00Z",
        failures: 8,
        manualReview: true,
        code: "PAYMENT_PROVIDER_UNAVAILABLE",
      }}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(/do not prove a payment failed/);
  expect(screen.getByText(/does not confirm the recovery worker is running/)).toBeInTheDocument();
  expect(screen.getByText(/Consecutive errors: 8/)).toBeInTheDocument();
});
it("does not invent a successful check for records with no recovery history", () => {
  render(
    <RecoveryNotice
      recovery={{
        lastCheckedAt: null,
        nextCheckAt: null,
        failures: 0,
        manualReview: false,
        code: null,
      }}
    />,
  );
  expect(screen.getByText("No automatic provider check recorded.")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
