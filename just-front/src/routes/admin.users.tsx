import { UiAttributes } from "@/lib/i18n/Language";
import { createFileRoute } from "@tanstack/react-router";
import { isDemoMode } from "@/lib/config";
import { AdminUsers } from "@/components/portal/AdminUsers";
import { EmptyState } from "@/components/common/states";
export const Route = createFileRoute("/admin/users")({
  component: () =>
    isDemoMode ? (
      <UiAttributes>
        <EmptyState
          title="Account directory needs a backend"
          body="No sample accounts or access changes are simulated."
        />
      </UiAttributes>
    ) : (
      <AdminUsers />
    ),
});
