import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { PortalHeader, Kpi } from "@/components/portal/PortalShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { useSeller, LOW_STOCK } from "@/stores/seller";
import { shopById } from "@/services/catalog";
import { inr } from "@/lib/image";
import { Panel } from "@/components/common/Panel";
import { listingStock } from "@/lib/seller-product";

export const Route = createFileRoute("/seller/")({ component: SellerHome });

function SellerHome() {
  const { orders, products } = useSeller();
  const shop = shopById("s1")!;
  const pending = orders.filter((o) => o.status === "placed");
  const low = products.filter((p) => !p.archived && listingStock(p) <= LOW_STOCK);
  const sales = orders.reduce((s, o) => s + o.total, 0);

  return (
    <>
      <PortalHeader
        title={`Good morning, ${shop.name.split(" ")[0]} ji`}
        sub={`${shop.name} · ${shop.isOpen ? "Open" : "Closed"} · ${shop.hours}`}
        actions={
          <Button asChild variant="citrus">
            <Link to="/seller/products/new">Add product</Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Kpi label="Orders today" value={orders.length} hint="demo" />
        <Kpi label="Sales today" value={inr(sales)} hint="before commission · demo" />
        <Kpi
          label="Waiting for you"
          value={pending.length}
          tone={pending.length ? "warn" : undefined}
        />
        <Kpi label="Low stock" value={low.length} tone={low.length ? "warn" : undefined} />
      </div>
      {pending.length > 0 && (
        <section className="mt-10 border border-promo/40 bg-promo/5 p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-5 text-promo" /> {pending.length} new order
            {pending.length > 1 ? "s" : ""} to accept
          </h2>
          <ul className="mt-3 divide-y divide-border">
            {pending.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="font-mono">{o.id}</span>
                <span>{o.customer}</span>
                <span className="text-muted-foreground">{o.placedMinsAgo} min ago</span>
                <Button asChild size="sm" className="ml-auto">
                  <Link to="/seller/orders">Review</Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <Panel title="Order pipeline" description="A clear view of the orders at your counter.">
          <ul className="divide-y divide-border">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="font-mono">{o.id}</span>
                  <span className="block text-muted-foreground">
                    {o.items.length} items · {inr(o.total)}
                  </span>
                </span>
                <StatusBadge status={o.status} />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Running low" description="Keep these listings ready for the next customer.">
          <ul className="divide-y divide-border">
            {low.length === 0 && (
              <li className="py-3 text-sm text-muted-foreground">All stocked up.</li>
            )}
            {low.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0 truncate">{p.name}</span>
                <StatusBadge
                  status={listingStock(p) === 0 ? "out" : "low"}
                  label={`${listingStock(p)} left`}
                />
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link to="/seller/inventory">Update stock</Link>
          </Button>
        </Panel>
      </div>
    </>
  );
}
