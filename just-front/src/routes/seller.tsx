import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  Boxes,
  ClipboardList,
  Tag,
  Wallet,
  Settings,
} from "lucide-react";
import { PortalShell, type NavItem } from "@/components/portal/PortalShell";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { SellerProvider } from "@/stores/seller";
import { isDemoMode } from "@/lib/config";
import { LiveSeller } from "@/components/portal/LiveSeller";

const nav: NavItem[] = [
  { to: "/seller", label: "Today", icon: LayoutDashboard, exact: true },
  { to: "/seller/orders", label: "Orders", icon: ClipboardList },
  { to: "/seller/products", label: "Products", icon: Package },
  { to: "/seller/inventory", label: "Stock", icon: Boxes },
  { to: "/seller/offers", label: "Offers", icon: Tag },
  { to: "/seller/settlements", label: "Payouts", icon: Wallet },
  { to: "/seller/settings", label: "Shop settings", icon: Settings },
];

export const Route = createFileRoute("/seller")({
  head: () => ({
    meta: [
      { title: "Seller portal — Just Pack It" },
      {
        name: "description",
        content: "Manage your shop's orders, products and stock on Just Pack It.",
      },
      { property: "og:title", content: "Seller portal — Just Pack It" },
      { property: "og:description", content: "Tools for neighbourhood shopkeepers." },
    ],
  }),
  component: () => (
    <RoleGuard role="seller">
      {isDemoMode ? (
        <SellerProvider>
          <PortalShell label="Seller" items={nav}>
            <Outlet />
          </PortalShell>
        </SellerProvider>
      ) : (
        <PortalShell
          label="Seller"
          items={nav.filter((item) =>
            [
              "/seller",
              "/seller/orders",
              "/seller/products",
              "/seller/inventory",
              "/seller/settlements",
              "/seller/settings",
            ].includes(item.to),
          )}
        >
          <LiveSeller />
        </PortalShell>
      )}
    </RoleGuard>
  ),
});
