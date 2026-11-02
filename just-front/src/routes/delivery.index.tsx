import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useDelivery } from "@/stores/delivery";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/image";
import type { DeliveryTask } from "@/domain/types";
import { PortalHeader } from "@/components/portal/PortalShell";

export const Route = createFileRoute("/delivery/")({ component: Tasks });

function TaskRow({ t, action }: { t: DeliveryTask; action?: React.ReactNode }) {
  return (
    <li className="delivery-task-card border border-border bg-card">
      <Link to="/delivery/$id" params={{ id: t.id }} className="block p-4">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge status={t.status} />
          <span className="font-semibold tabular-nums">{inr(t.payout)}</span>
        </div>
        <p className="mt-2 font-semibold">{t.shopName}</p>
        <div className="task-route-preview">
          <p>
            <span>
              <UiText>{"Pickup"}</UiText>
            </span>
            {t.pickup}
          </p>
          <p>
            <span>Drop-off</span>
            {t.drop}
          </p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.distanceKm} km · {t.items} items
          <UiText>{t.codAmount ? ` · collect ${inr(t.codAmount)}` : ""}</UiText>
        </p>
      </Link>
      {action && <div className="border-t border-border p-3">{action}</div>}
    </li>
  );
}

export function Tasks() {
  const { online, setOnline, tasks, setStatus } = useDelivery();
  const active = tasks.filter((t) =>
    ["assigned", "picked_up", "out_for_delivery"].includes(t.status),
  );
  const available = tasks.filter((t) => t.status === "available");

  return (
    <>
      <UiAttributes>
        <PortalHeader
          title="Your delivery desk"
          sub="Pickups, neighbourhood stops and your next delivery, in one place."
        />
      </UiAttributes>
      <div className="delivery-task-board">
        <div className="delivery-verification flex items-center gap-3 border border-success/30 bg-success/10 p-3 text-sm">
          <ShieldCheck className="size-5 text-success" /> Verification:{" "}
          <span className="font-semibold">
            <UiText>{"Approved"}</UiText>
          </span>{" "}
          <span className="ml-auto text-xs text-muted-foreground">demo</span>
        </div>
        {active.length > 0 && (
          <section>
            <h2 className="label-stamp mb-2 text-muted-foreground">Your current task</h2>
            <ul className="space-y-3">
              {active.map((t) => (
                <TaskRow
                  key={t.id}
                  t={t}
                  action={
                    <Button asChild size="xl" variant="citrus" className="w-full">
                      <Link to="/delivery/$id" params={{ id: t.id }}>
                        <UiText>{"Continue "}</UiText>
                        <ChevronRight />
                      </Link>
                    </Button>
                  }
                />
              ))}
            </ul>
          </section>
        )}
        <section>
          <h2 className="label-stamp mb-2 text-muted-foreground">Available near you</h2>
          {!online ? (
            <div className="border border-dashed border-border p-8 text-center">
              <p className="font-display text-2xl">You're offline</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Go online to see delivery requests.
              </p>
              <Button size="xl" className="mt-4 w-full" onClick={() => setOnline(true)}>
                Go online
              </Button>
            </div>
          ) : available.length === 0 ? (
            <p className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No requests right now. Stay online: we'll show new ones here.
            </p>
          ) : (
            <ul className="space-y-3">
              {available.map((t) => (
                <TaskRow
                  key={t.id}
                  t={t}
                  action={
                    <Button
                      size="xl"
                      className="w-full"
                      onClick={() => {
                        setStatus(t.id, "assigned");
                        toast.success("Task accepted (demo)");
                      }}
                    >
                      Accept delivery
                    </Button>
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
