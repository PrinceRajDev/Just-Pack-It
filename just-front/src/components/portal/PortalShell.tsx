import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  LogOut,
  Menu,
  ArrowUpRight,
  Store,
  ShieldCheck,
  Users,
  ChartNoAxesCombined,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { AdminWorkspaceSearch } from "./AdminWorkspaceSearch";
import { NeighbourhoodIllustration } from "./NeighbourhoodIllustration";
import { Logo } from "@/components/brand/Logo";
import { DemoBanner } from "@/components/common/states";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/stores/auth";
import { NotificationBell } from "@/components/common/NotificationBell";
import { cn } from "@/lib/utils";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map((i) => (
        <li key={i.to}>
          <Link
            to={i.to}
            onClick={onNavigate}
            activeOptions={{ exact: i.exact }}
            className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            activeProps={{
              className:
                "bg-sidebar-accent text-sidebar-accent-foreground font-medium [&_svg]:text-sidebar-primary",
            }}
          >
            <i.icon className="size-4" /> {i.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Sidebar shell for seller + admin (desktop-first, drawer on mobile). */
export function PortalShell({
  label,
  items,
  children,
}: {
  label: string;
  items: NavItem[];
  children: ReactNode;
}) {
  const { session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const admin = label === "Ops" || label === "Admin";
  const side = (
    <div
      className={cn(
        "workspace-sidebar flex h-full flex-col bg-sidebar p-4 text-sidebar-foreground",
        admin && "admin-sidebar-content",
      )}
    >
      <div className={admin ? "admin-sidebar-brand" : undefined}>
        <Logo inverse to="/" className="text-sidebar-foreground [&_span]:text-sidebar-foreground" />
        {admin && <p>Admin · Marketplace Operations</p>}
      </div>
      <div className="workspace-role">
        <span>
          {label === "Seller" ? (
            <Store className="size-4" aria-hidden />
          ) : (
            <ShieldCheck className="size-4" aria-hidden />
          )}
        </span>
        <div>
          <strong>{label === "Seller" ? "Shop workspace" : "Operations"}</strong>
          <p>
            {label === "Seller"
              ? "Your counter, connected."
              : "Keep the neighbourhood running smoothly."}
          </p>
        </div>
      </div>
      <nav className="mt-8 flex-1" aria-label={`${label} navigation`}>
        <NavList items={items} onNavigate={() => setOpen(false)} />
      </nav>
      {admin && (
        <div className="admin-sidebar-note">
          <NeighbourhoodIllustration />
          <strong>
            Your marketplace,
            <br />
            stronger neighbourhoods.
          </strong>
          <p>Monitor, moderate and grow local commerce.</p>
        </div>
      )}
      <Link to="/" className="workspace-market-link">
        Visit the marketplace <ArrowUpRight className="size-4" aria-hidden />
      </Link>
      <div className="border-t border-sidebar-border pt-4 text-sm">
        <p className="truncate font-medium">{session?.name}</p>
        <button
          onClick={signOut}
          className="mt-2 flex items-center gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </div>
    </div>
  );
  return (
    <div className={cn("portal-shell workspace-shell min-h-screen", admin && "admin-workspace")}>
      <DemoBanner>
        Sample data for preview. Workspace edits affect this session only; metrics are not live
        business figures.
      </DemoBanner>
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">{side}</aside>
        <div className="min-w-0 flex-1">
          {!admin && (
            <div className="workspace-mobile-nav flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger
                  className="flex size-10 items-center justify-center rounded-md border border-border"
                  aria-label="Open menu"
                >
                  <Menu className="size-5" />
                </SheetTrigger>
                <SheetContent side="left" className="w-64 border-0 p-0">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  {side}
                </SheetContent>
              </Sheet>
              <Logo suffix={label} />
              <div className="ml-auto">
                <NotificationBell />
              </div>
            </div>
          )}
          {admin ? (
            <header className="admin-topbar">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger className="admin-menu-trigger" aria-label="Open admin menu">
                  <Menu size={21} />
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="admin-menu-drawer w-[min(19rem,90vw)] border-0 p-0"
                >
                  <SheetTitle className="sr-only">Admin navigation</SheetTitle>
                  {side}
                </SheetContent>
              </Sheet>
              <AdminWorkspaceSearch items={items} />
              <div className="admin-topbar-account">
                <NotificationBell />
                <span className="admin-avatar" aria-hidden="true">
                  {(session?.name ?? "Admin")
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <span className="admin-account-name">
                  <strong>{session?.name ?? "Administrator"}</strong>
                  <small>{session?.isDemo ? "Demo administrator" : "Administrator"}</small>
                </span>
              </div>
            </header>
          ) : (
            <div className="workspace-topbar">
              <span>{label === "Seller" ? "Seller workspace" : "Operations workspace"}</span>
              <span className="flex items-center gap-3">
                <NotificationBell />
                {session?.name}
                {session?.isDemo ? " · Demo session" : ""}
              </span>
            </div>
          )}
          <main className="workspace-main mx-auto max-w-6xl px-4 py-8 md:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

export function PortalHeader({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="portal-page-header mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="workspace-eyebrow">Just Pack It · Workspace</p>
        <h1 className="font-display text-3xl md:text-4xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <div
      className={cn(
        "portal-kpi border-t-2 pt-3",
        tone === "warn" ? "border-promo" : "border-foreground",
      )}
    >
      <p className="label-stamp text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
