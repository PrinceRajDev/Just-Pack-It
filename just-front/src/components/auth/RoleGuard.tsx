import { useState, useRef, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { NeighbourhoodIllustration } from "@/components/portal/NeighbourhoodIllustration";
import { useAuth, roleHome } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Role } from "@/domain/types";
import "@/styles/access.css";

const workspaces: Record<Role, { name: string; description: string }> = {
  admin: {
    name: "Marketplace operations",
    description: "Review shops, support your customers and keep the neighbourhood market moving.",
  },
  seller: {
    name: "Your shop workspace",
    description:
      "Look after your catalogue, prepare orders and keep your local customers coming back.",
  },
  delivery: {
    name: "Your delivery workspace",
    description: "Manage your pickups and deliveries, one neighbourhood at a time.",
  },
  buyer: {
    name: "Your neighbourhood account",
    description: "Find your orders, saved favourites and the local shops you love.",
  },
};

/**
 * UX-only route protection. The backend MUST still authorise every request;
 * the role here comes from the server-issued session (or demo session).
 */
export function RoleGuard({ role, children }: { role: Role; children: ReactNode }) {
  const { session, ready, signOut } = useAuth();
  const location = useLocation();
  const returnTo = location.href || location.pathname;
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);
  const switchLock = useRef(false);
  if (!ready)
    return (
      <div className="p-8">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  if (session?.role === role) return <>{children}</>;
  return (
    <section className="workspace-access" aria-labelledby="workspace-access-title">
      <header className="workspace-access-header">
        <Logo />
        <Link to="/" className="workspace-access-back">
          <ArrowLeft size={16} aria-hidden="true" /> Back to market
        </Link>
      </header>
      <div className="workspace-access-layout">
        <div className="workspace-access-story">
          <span className="workspace-access-eyebrow">Local shops. Real people.</span>
          <h2>
            Good neighbourhoods
            <br />
            start with <em>good people.</em>
          </h2>
          <NeighbourhoodIllustration className="workspace-access-illustration" />
          <p>
            A little care behind every counter.
            <br />A better market for everyone.
          </p>
        </div>
        <div className="workspace-access-card">
          <span className="workspace-access-icon">
            <LockKeyhole size={27} aria-hidden="true" />
          </span>
          <p className="workspace-access-eyebrow">{workspaces[role].name}</p>
          <h1 id="workspace-access-title">
            {session ? "Let's get you to the right place." : "Your workspace awaits."}
          </h1>
          <p className="workspace-access-description">{workspaces[role].description}</p>
          <div className="workspace-access-note">
            <ShieldCheck size={20} aria-hidden="true" />
            <p>
              {session
                ? `You're signed in to ${workspaces[session.role].name.toLowerCase()}. Use an authorised ${role === "delivery" ? "delivery partner" : role} account to access this workspace.`
                : `Sign in with your ${role === "delivery" ? "delivery partner" : role} account to continue. This workspace is for authorised accounts.`}
            </p>
          </div>
          <div className="workspace-access-actions">
            {session ? (
              <Button
                disabled={switching}
                onClick={async () => {
                  if (switchLock.current) return;
                  switchLock.current = true;
                  setSwitching(true);
                  try {
                    if ((await signOut()) === false) return;
                    await navigate({ to: "/login", search: { redirect: returnTo } });
                  } finally {
                    switchLock.current = false;
                    setSwitching(false);
                  }
                }}
              >
                {switching ? "Signing out…" : "Switch account"}
              </Button>
            ) : (
              <Button asChild>
                <Link to="/login" search={{ redirect: returnTo }}>
                  Sign in to continue
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </Button>
            )}
            {session && (
              <Button variant="outline" asChild>
                <Link to={roleHome[session.role]}>Go to my area</Link>
              </Button>
            )}
          </div>
          <p className="workspace-access-help">
            {role === "admin"
              ? "Need access? Ask the marketplace administrator."
              : "Already have access? Use the account registered for this workspace."}
          </p>
        </div>
      </div>
      <footer className="workspace-access-footer">Your neighbourhood, packed with care.</footer>
    </section>
  );
}
