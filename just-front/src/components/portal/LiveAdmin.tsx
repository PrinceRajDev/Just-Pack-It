import { PlatformSettingsPage } from "./PlatformSettingsPage";
import { AdminReports } from "./AdminReports";
import { AdminUsers } from "./AdminUsers";
import { AdminSettings } from "./AdminSettings";
import { AdminFinance } from "./AdminFinance";
import { AdminCatalogue } from "./AdminCatalogue";
import { SellerApprovalsPage } from "./SellerApprovalsPage";
import { LiveSupport } from "./LiveSupport";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { EmptyState } from "@/components/common/states";
import { AdminOrders } from "./AdminOrders";
import { OperationsDashboard } from "./OperationsDashboard";

export function LiveAdmin() {
  const navigate = useNavigate();
  const orderId = useRouterState({
    select: (state) => (state.location.search as { orderId?: string }).orderId,
  });
  const path = useRouterState({
    select: (state) => state.location.pathname.replace(/\/+$/, "") || "/",
  });
  if (path === "/admin" || path === "/admin/") return <OperationsDashboard />;
  if (path === "/admin/platform") return <PlatformSettingsPage />;
  if (path === "/admin/reports") return <AdminReports />;
  if (path === "/admin/users") return <AdminUsers />;
  if (path === "/admin/support") return <LiveSupport />;
  if (path === "/admin/orders")
    return (
      <AdminOrders
        key={orderId ?? "all"}
        initialOrderId={orderId}
        onLookup={(value) => void navigate({ to: "/admin/orders", search: { orderId: value } })}
      />
    );
  if (path === "/admin/finance") return <AdminFinance />;
  if (path === "/admin/catalog") return <AdminCatalogue />;
  if (path === "/admin/settings") return <AdminSettings />;
  if (path !== "/admin" && path !== "/admin/" && path !== "/admin/partners")
    return (
      <EmptyState
        title="This operations screen is not connected yet"
        body="Choose an available section from the operations menu."
      />
    );
  return <SellerApprovalsPage />;
}
