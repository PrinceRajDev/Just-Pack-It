import { UiAttributes } from "@/lib/i18n/Language";
import { createFileRoute } from "@tanstack/react-router";
import { isDemoMode } from "@/lib/config";
import { AdminReports } from "@/components/portal/AdminReports";
import { EmptyState } from "@/components/common/states";
export const Route = createFileRoute("/admin/reports")({
  component: () =>
    isDemoMode ? (
      <UiAttributes>
        <EmptyState
          title="Reports need a backend"
          body="No sample orders or financial totals are simulated."
        />
      </UiAttributes>
    ) : (
      <AdminReports />
    ),
});
