import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { createFileRoute } from "@tanstack/react-router";
import { useDelivery } from "@/stores/delivery";
import { StatusBadge } from "@/components/common/StatusBadge";
import { inr } from "@/lib/image";
import { PortalHeader } from "@/components/portal/PortalShell";
import { Panel } from "@/components/common/Panel";

export const Route = createFileRoute("/delivery/earnings")({ component: Earnings });

function Earnings() {
  const { tasks } = useDelivery();
  const done = tasks.filter((t) => t.status === "delivered" || t.status === "failed");
  const total = done.filter((t) => t.status === "delivered").reduce((s, t) => s + t.payout, 0);
  return (
    <div className="delivery-earnings">
      <UiAttributes>
        <PortalHeader title="Your earnings" sub="Completed deliveries from this preview session." />
      </UiAttributes>
      <div className="delivery-earnings-total">
        <p className="label-stamp text-muted-foreground">This session (demo)</p>
        <p className="mt-1 font-display text-5xl tabular-nums">{inr(total)}</p>
        <p className="text-sm text-muted-foreground">
          {done.filter((t) => t.status === "delivered").length} deliveries completed. Payouts are
          confirmed by the backend weekly.
        </p>
      </div>
      <UiAttributes>
        <Panel
          title="Delivery history"
          description="Each finished task stays with its recorded status."
        >
          <ul className="divide-y divide-border">
            {done.length === 0 && (
              <li className="py-6 text-sm text-muted-foreground">No completed deliveries yet.</li>
            )}
            {done.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="font-medium">{t.shopName}</span>
                  <span className="block text-xs text-muted-foreground">{t.subOrderId}</span>
                </span>
                <StatusBadge status={t.status} />
                <span className="tabular-nums">
                  <UiText>{t.status === "delivered" ? inr(t.payout) : "N/A"}</UiText>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </UiAttributes>
    </div>
  );
}
