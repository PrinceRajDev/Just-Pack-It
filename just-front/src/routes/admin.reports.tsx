import { createFileRoute } from "@tanstack/react-router";
import { isDemoMode } from "@/lib/config";
import { AdminReports } from "@/components/portal/AdminReports";
import { EmptyState } from "@/components/common/states";
export const Route = createFileRoute("/admin/reports")({
  component: () =>
    isDemoMode ? (
      <EmptyState
        title="Reports need a backend"
        body="No sample orders or financial totals are simulated."
      />
    ) : (
      <AdminReports />
    ),
});
