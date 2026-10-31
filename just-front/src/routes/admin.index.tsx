import { createFileRoute } from "@tanstack/react-router";
import { shops, products, sellerOrders, deliveryTasks } from "@/mocks/data";
import { sellerApplications, disputes } from "@/mocks/admin";
import { OperationsDashboard } from "@/components/portal/OperationsDashboard";
export const Route = createFileRoute("/admin/")({ component: Overview });
function Overview() {
  return (
    <OperationsDashboard
      preview={{
        shops: shops.length,
        products: products.length,
        summary: {
          asOf: new Date().toISOString(),
          thresholds: { orderStaleMinutes: 60, paymentPendingMinutes: 30, refundPendingHours: 24 },
          support: { count: disputes.filter((d) => d.status === "open").length, items: [] },
          pendingShops: {
            count: sellerApplications.filter((a) => a.status === "pending").length,
            items: [],
          },
          staleSuborders: {
            count: deliveryTasks.filter((t) => t.status === "failed").length,
            items: [],
          },
          payments: { count: 0, items: [] },
          refunds: { count: 0, items: [] },
        },
        extra: [
          {
            count: products.filter((p) => p.stock === 0).length,
            title: "demo products out of stock",
            to: "/admin/catalog",
          },
          { count: sellerOrders.length, title: "demo orders in progress", to: "/admin/orders" },
          {
            count: deliveryTasks.filter((t) => t.status === "available").length,
            title: "unassigned demo deliveries",
            to: "/admin/orders",
          },
        ],
      }}
    />
  );
}
