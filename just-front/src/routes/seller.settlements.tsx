import { createFileRoute } from "@tanstack/react-router";
import { PortalHeader } from "@/components/portal/PortalShell";
import { EmptyState } from "@/components/common/states";
import { isDemoMode } from "@/lib/config";

export const Route = createFileRoute("/seller/settlements")({ component: Settlements });

function Settlements() {
  return (
    <>
      <PortalHeader title="Payouts" sub="Sales, commission and bank settlements." />
      <div className="mb-8 grid gap-4 border border-border bg-card p-5 text-sm sm:grid-cols-3">
        <p>
          <span className="label-stamp block text-muted-foreground">Settlement cycle</span>Weekly
          (to be confirmed by backend)
        </p>
        <p>
          <span className="label-stamp block text-muted-foreground">Bank account</span>Not linked
        </p>
        <p>
          <span className="label-stamp block text-muted-foreground">Commission</span>As per seller
          agreement
        </p>
      </div>
      <EmptyState
        title="No settlements yet"
        body={
          isDemoMode
            ? "Settlement history comes from the payments backend. We don't show invented payout figures."
            : "Your first payout will appear after your first completed week."
        }
      />
    </>
  );
}
