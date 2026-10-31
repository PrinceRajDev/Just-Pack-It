import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
  ChartNoAxesCombined,
  Settings,
  Users,
  LayoutDashboard,
  Store,
  ClipboardList,
  Package,
  Wallet,
  LifeBuoy,
  MapPinned,
} from "lucide-react";
import { PortalShell, type NavItem } from "@/components/portal/PortalShell";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { isDemoMode } from "@/lib/config";
import { LiveAdmin } from "@/components/portal/LiveAdmin";
import "@/styles/admin-overview.css";

const nav: NavItem[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/partners", label: "Sellers & approvals", icon: Store },
  { to: "/admin/orders", label: "Orders & cash records", icon: ClipboardList },
  { to: "/admin/catalog", label: "Catalogue", icon: Package },
  { to: "/admin/finance", label: "Payments & refunds", icon: Wallet },
  { to: "/admin/support", label: "Order support", icon: LifeBuoy },
  { to: "/admin/reports", label: "Reports & analytics", icon: ChartNoAxesCombined },
  { to: "/admin/users", label: "Users & roles", icon: Users },
  { to: "/admin/platform", label: "Platform settings", icon: Settings },
  { to: "/admin/settings", label: "Service areas & audit", icon: MapPinned },
];

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Operations — Just Pack It" },
      { name: "description", content: "Marketplace operations console." },
      { property: "og:title", content: "Operations — Just Pack It" },
      { property: "og:description", content: "Admin console." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RoleGuard role="admin">
      <PortalShell
        label="Ops"
        items={
          isDemoMode
            ? nav
            : nav
                .filter((item) =>
                  [
                    "/admin",
                    "/admin/partners",
                    "/admin/orders",
                    "/admin/finance",
                    "/admin/catalog",
                    "/admin/settings",
                    "/admin/support",
                    "/admin/users",
                    "/admin/reports",
                    "/admin/platform",
                  ].includes(item.to),
                )
                .map((item) => ({
                  ...item,
                  label:
                    (
                      {
                        "/admin/finance": "Payments & refunds",
                        "/admin/partners": "Sellers & approvals",
                        "/admin/orders": "Orders & cash records",
                        "/admin/settings": "Service areas & audit",
                        "/admin/support": "Order support",
                      } as Record<string, string>
                    )[item.to] ?? item.label,
                }))
        }
      >
        {isDemoMode ? <Outlet /> : <LiveAdmin />}
      </PortalShell>
    </RoleGuard>
  ),
});
