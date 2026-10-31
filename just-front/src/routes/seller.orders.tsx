import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PortalHeader } from "@/components/portal/PortalShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/states";
import { fulfilmentLabel } from "@/components/store/ShopMark";
import { Button } from "@/components/ui/button";
import { useSeller } from "@/stores/seller";
import type { SellerOrder } from "@/mocks/data";
import { inr } from "@/lib/image";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/seller/orders")({ component: SellerOrders });

const columns: { key: SellerOrder["status"]; label: string }[] = [
  { key: "placed", label: "New" },
  { key: "accepted", label: "Accepted" },
  { key: "preparing", label: "Packing" },
  { key: "ready", label: "Ready for pickup" },
];

const next: Partial<Record<SellerOrder["status"], [SellerOrder["status"], string]>> = {
  placed: ["accepted", "Accept order"],
  accepted: ["preparing", "Start packing"],
  preparing: ["ready", "Mark ready"],
  ready: ["picked_up", "Handed over"],
};

function SellerOrders() {
  const { orders, setOrderStatus } = useSeller();
  const [filter, setFilter] = useState<SellerOrder["status"] | "all">("all");
  const list = orders.filter(
    (o) => o.status !== "picked_up" && (filter === "all" || o.status === filter),
  );

  return (
    <>
      <PortalHeader title="Orders" sub="Accept, pack and hand over. Customers see each step." />
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter orders by status">
        {[{ key: "all", label: "All" }, ...columns].map((c) => {
          const n =
            c.key === "all"
              ? orders.filter((o) => o.status !== "picked_up").length
              : orders.filter((o) => o.status === c.key).length;
          return (
            <button
              key={c.key}
              aria-pressed={filter === c.key}
              onClick={() => setFilter(c.key as typeof filter)}
              className={cn(
                "h-10 rounded-full border px-4 text-sm",
                filter === c.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card",
              )}
            >
              {c.label} <span className="ml-1 tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>
      {list.length === 0 ? (
        <EmptyState title="No orders here" body="New orders will appear at the top." />
      ) : (
        <ul className="workspace-order-list">
          {list.map((o) => {
            const n = next[o.status];
            return (
              <li key={o.id} className="border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm">{o.id}</span>
                  <StatusBadge status={o.status} />
                  <span className="label-stamp text-muted-foreground">
                    {fulfilmentLabel[o.fulfilment]}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {o.placedMinsAgo} min ago
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                  <div className="text-sm">
                    <p className="font-medium">{o.customer}</p>
                    <ul className="text-muted-foreground">
                      {o.items.map((i) => (
                        <li key={i.name}>
                          {i.qty} × {i.name}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 font-semibold tabular-nums">{inr(o.total)}</p>
                  </div>
                  <div className="flex gap-2">
                    {o.status === "placed" && (
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={() =>
                          toast.info(
                            "Rejecting needs a reason — available once connected to the backend.",
                          )
                        }
                      >
                        Can't fulfil
                      </Button>
                    )}
                    {n && (
                      <Button
                        size="lg"
                        variant={o.status === "placed" ? "citrus" : "default"}
                        onClick={() => {
                          setOrderStatus(o.id, n[0]);
                          toast.success(`${o.id}: ${n[1]}`);
                        }}
                      >
                        {o.fulfilment === "platform_delivery" && o.status === "ready"
                          ? "Handed to rider"
                          : n[1]}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
