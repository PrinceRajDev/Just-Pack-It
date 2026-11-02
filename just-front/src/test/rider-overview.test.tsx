import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RiderOverview } from "@/components/portal/RiderOverview";
import type { ReactNode } from "react";
vi.mock("@/services/management", () => ({
  management: {
    areas: async () => [
      { id: "assigned", name: "Assigned market" },
      { id: "other", name: "Other market" },
    ],
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
afterEach(cleanup);
it("shows only assigned area names and labels loaded task counts without invented earnings", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RiderOverview
        profile={{ approved: true, online: true, areaIds: ["assigned"], version: 1 }}
        task={null}
        taskKnown
        loadedTasks={2}
        hasMore
        updatedAt={0}
        refreshing={false}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Assigned market")).toBeInTheDocument();
  expect(screen.queryByText("Other market")).toBeNull();
  expect(screen.getByText("2+")).toBeInTheDocument();
  expect(screen.getByText("No active task")).toBeInTheDocument();
  expect(screen.queryByText(/₹/)).toBeNull();
  expect(screen.getByText("Pick a task").closest("li")).toHaveAttribute("aria-current", "step");
  expect(screen.getByText("Collect from shop").closest("li")).toHaveAttribute(
    "data-progress",
    "pending",
  );
});
