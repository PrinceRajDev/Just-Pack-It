import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { isDemoMode } from "@/lib/config";
import { LiveDelivery } from "@/components/portal/LiveDelivery";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ListChecks, Wallet, LogOut } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { DemoBanner } from "@/components/common/states";
import { LogoMark } from "@/components/brand/Logo";
import { DeliveryProvider, useDelivery } from "@/stores/delivery";
import { useAuth } from "@/stores/auth";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/delivery")({
  head: () => ({
    meta: [
      { title: "Delivery partner: Just Pack It" },
      {
        name: "description",
        content: "Pickups, drops and earnings for Just Pack It delivery partners.",
      },
      { property: "og:title", content: "Deliver with Just Pack It" },
      { property: "og:description", content: "The delivery partner app." },
    ],
  }),
  component: () => (
    <RoleGuard role="delivery">
      {!isDemoMode ? (
        <LiveDelivery />
      ) : (
        <DeliveryProvider>
          <Shell />
        </DeliveryProvider>
      )}
    </RoleGuard>
  ),
});

function Shell() {
  const { online, setOnline } = useDelivery();
  const { session, signOut } = useAuth();
  return (
    <div className="delivery-workspace flex min-h-screen flex-col bg-background">
      <DemoBanner>Sample tasks for preview.</DemoBanner>
      <header
        className={cn(
          "delivery-header sticky top-0 z-30 flex items-center gap-3 px-4 py-3",
          online ? "bg-primary text-primary-foreground" : "bg-foreground text-background",
        )}
      >
        <LogoMark className="size-7" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{session?.name}</p>
          <p className="label-stamp opacity-80">
            <UiText>{online ? "Online · receiving tasks" : "Offline"}</UiText>
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <UiAttributes>
            <Switch
              checked={online}
              onCheckedChange={setOnline}
              aria-label="Go online"
              className="data-[state=checked]:bg-citrus"
            />
          </UiAttributes>
        </label>
        <UiAttributes>
          <button onClick={signOut} aria-label="Sign out" className="p-2">
            <LogOut className="size-5" />
          </button>
        </UiAttributes>
      </header>
      <main className="delivery-main flex-1 px-4 pb-28 pt-4">
        <Outlet />
      </main>
      <UiAttributes>
        <nav
          className="delivery-navigation fixed inset-x-0 bottom-0 z-30 mx-auto grid grid-cols-2 border-t border-border bg-card"
          aria-label="Delivery navigation"
        >
          <Link
            to="/delivery"
            activeOptions={{ exact: true }}
            className="flex h-16 flex-col items-center justify-center gap-1 text-xs"
            activeProps={{ className: "text-primary font-semibold" }}
          >
            <ListChecks className="size-5" />
            Tasks
          </Link>
          <Link
            to="/delivery/earnings"
            className="flex h-16 flex-col items-center justify-center gap-1 text-xs"
            activeProps={{ className: "text-primary font-semibold" }}
          >
            <Wallet className="size-5" />
            Earnings
          </Link>
        </nav>
      </UiAttributes>
    </div>
  );
}
