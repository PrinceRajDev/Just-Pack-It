import { UiAttributes } from "@/lib/i18n/Language";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ordersQuery } from "@/services/orders";
import { shopById } from "@/services/catalog";
import { inr } from "@/lib/image";
import { PackageCheck, ArrowUpRight } from "lucide-react";

export function OrdersList() {
  const { data, isPending, isError, refetch } = useQuery(ordersQuery());
  if (isPending)
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!data.length)
    return (
      <UiAttributes>
        <EmptyState
          title="No orders yet"
          action={
            <Button asChild>
              <Link to="/">Start shopping</Link>
            </Button>
          }
        />
      </UiAttributes>
    );
  return (
    <ul className="order-history-list">
      {data.map((o) => (
        <li key={o.id}>
          <Link to="/orders/$id" params={{ id: o.id }} className="order-history-card">
            <span className="order-history-icon">
              <PackageCheck className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm">
                {o.id} {o.isDemo && <span className="label-stamp ml-2 text-promo">demo</span>}
              </p>
              <p className="text-sm text-muted-foreground">
                {new Date(o.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })} ·{" "}
                {o.subOrders.map((s) => shopById(s.shopId)?.name).join(", ")}
              </p>
            </div>
            <div className="order-history-status flex flex-wrap gap-1.5">
              {o.subOrders.map((s) => (
                <StatusBadge key={s.id} status={s.status} />
              ))}
            </div>
            <p className="font-semibold tabular-nums sm:w-24 sm:text-right">{inr(o.total)}</p>
            <ArrowUpRight className="size-4 text-primary" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
