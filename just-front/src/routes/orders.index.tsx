import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { StoreLayout, PageTitle } from "@/components/store/StoreLayout";
import { OrdersList } from "@/components/store/OrdersList";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ordersQuery } from "@/services/orders";
import { shopById } from "@/services/catalog";
import { inr } from "@/lib/image";
import { isDemoMode } from "@/lib/config";
import { LiveOrdersPage } from "@/components/store/LiveOrders";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { title: "Your orders — Just Pack It" },
      { name: "description", content: "Track and reorder from your past orders." },
      { property: "og:title", content: "Your orders — Just Pack It" },
      { property: "og:description", content: "Order history and tracking." },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  if (!isDemoMode) return <LiveOrdersPage />;
  return (
    <StoreLayout>
      <PageTitle eyebrow="Account" title="Your orders" />
      <div className="mx-auto max-w-4xl px-4">
        <OrdersList />
      </div>
    </StoreLayout>
  );
}
