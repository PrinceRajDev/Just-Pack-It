import { createFileRoute } from "@tanstack/react-router";
import { PlatformSettingsPage } from "@/components/portal/PlatformSettingsPage";
import { isDemoMode } from "@/lib/config";
import { EmptyState } from "@/components/common/states";
export const Route = createFileRoute("/admin/platform")({
  component: () =>
    isDemoMode ? (
      <EmptyState
        title="Platform settings need a backend"
        body="No settings are simulated or published in demo mode."
      />
    ) : (
      <PlatformSettingsPage />
    ),
});
