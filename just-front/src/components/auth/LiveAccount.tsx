import { AccountProfile } from "./AccountProfile";
import { ConnectedWishlist } from "@/components/store/ConnectedWishlist";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/stores/auth";
import { StoreLayout } from "@/components/store/StoreLayout";
import { Button } from "@/components/ui/button";
import { SavedAddresses } from "./SavedAddresses";
import { CodOrderAction } from "@/components/store/CodOrderAction";
import { OnlineOrderAction } from "@/components/store/OnlineOrderAction";
import { AccountSecurity } from "./AccountSecurity";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authentication } from "@/services/auth";
import { accountLabels } from "@/lib/auth-flow";
import { roleHome } from "@/stores/auth";
import { NeighbourhoodIllustration } from "@/components/portal/NeighbourhoodIllustration";
import {
  UserRound,
  Heart,
  MapPin,
  LockKeyhole,
  LogOut,
  ShoppingBag,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import "@/styles/account.css";
export function LiveAccount({ tab }: { tab?: string }) {
  const { session, ready, signOut } = useAuth();
  const [active, setActive] = useState("profile");
  const [signingOut, setSigningOut] = useState(false);
  const profile = useQuery({
    queryKey: ["account-profile", session?.userId],
    queryFn: authentication.profile,
    enabled: ready && !!session,
    retry: false,
  });
  const initials = session?.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return (
    <StoreLayout>
      <div className="account-dashboard">
        <section className="account-welcome" aria-labelledby="account-welcome-title">
          <div>
            <p>My account</p>
            <h1 id="account-welcome-title">
              {ready
                ? session
                  ? `Hello, ${session.name}`
                  : "Make yourself at home."
                : "Checking your session…"}
            </h1>
            <span>Manage your profile, addresses and account security.</span>
          </div>
          <NeighbourhoodIllustration className="account-welcome-art" />
        </section>
        <nav aria-label="Account sections" className="account-overview-tabs">
          <Button asChild variant={tab === "wishlist" ? "outline" : "default"}>
            <Link to="/account" search={{}} aria-current={tab !== "wishlist" ? "page" : false}>
              <UserRound size={18} aria-hidden="true" />
              Account overview
            </Link>
          </Button>
          <Button asChild variant={tab === "wishlist" ? "default" : "outline"}>
            <Link
              to="/account"
              search={{ tab: "wishlist" }}
              aria-current={tab === "wishlist" ? "page" : false}
            >
              <Heart size={18} aria-hidden="true" />
              Wishlist
            </Link>
          </Button>
        </nav>
        <div className={`account-dashboard-grid ${session ? "" : "account-dashboard-guest"}`}>
          {ready && session && (
            <aside className="account-identity-card">
              <div className="account-identity-summary">
                <span className="account-initials" aria-hidden="true">
                  {initials}
                </span>
                <h2>{session.name}</h2>
                <p>
                  {profile.data?.phone ??
                    (profile.isError ? "Contact details unavailable" : "Loading contact details…")}
                </p>
                <span className="account-role-badge">
                  <ShieldCheck size={14} aria-hidden="true" />
                  {accountLabels[session.role]}
                </span>
              </div>
              <nav aria-label="Your account settings">
                {[
                  { id: "profile", label: "Profile & account", Icon: UserRound },
                  { id: "addresses", label: "Saved addresses", Icon: MapPin },
                  { id: "security", label: "Account security", Icon: LockKeyhole },
                ].map(({ id, label, Icon }) => (
                  <a
                    key={id}
                    href={tab === "wishlist" ? `/account#account-${id}` : `#account-${id}`}
                    aria-current={tab !== "wishlist" && active === id ? "location" : undefined}
                    onClick={() => setActive(id)}
                  >
                    <Icon size={19} aria-hidden="true" />
                    {label}
                  </a>
                ))}
                {session.role === "buyer" ? (
                  <Link to="/orders">
                    <ShoppingBag size={19} aria-hidden="true" />
                    Your orders
                  </Link>
                ) : (
                  <Link to={roleHome[session.role]}>
                    <ArrowUpRight size={19} aria-hidden="true" />
                    Open my workspace
                  </Link>
                )}
              </nav>
              <Button
                variant="outline"
                disabled={signingOut}
                onClick={async () => {
                  if (signingOut) return;
                  setSigningOut(true);
                  try {
                    await signOut();
                  } finally {
                    setSigningOut(false);
                  }
                }}
              >
                <LogOut size={18} aria-hidden="true" />
                {signingOut ? "Signing out…" : "Sign out"}
              </Button>
            </aside>
          )}
          <div className="account-main-content">
            {tab === "wishlist" ? (
              <div className="account-wishlist-card">
                <ConnectedWishlist />
              </div>
            ) : (
              <div>
                {ready && session ? (
                  <>
                    {session.role === "buyer" && (
                      <>
                        <div className="account-order-recovery">
                          <CodOrderAction key={`cod:${session.userId}`} userId={session.userId} />
                          <OnlineOrderAction
                            key={`online:${session.userId}`}
                            userId={session.userId}
                          />
                        </div>
                      </>
                    )}
                    <div id="account-profile" className="account-content-section">
                      <AccountProfile key={`profile:${session.userId}`} />
                    </div>
                    <div id="account-addresses" className="account-content-section">
                      <SavedAddresses key={session.userId} userId={session.userId} />
                    </div>
                    <div id="account-security" className="account-content-section">
                      <AccountSecurity key={`security:${session.userId}`} />
                    </div>
                  </>
                ) : (
                  ready && (
                    <div className="account-guest-card">
                      <UserRound size={28} aria-hidden="true" />
                      <h2>Your account, all in one place.</h2>
                      <p>Sign in to manage your details and saved delivery addresses.</p>
                      <Button asChild>
                        <Link to="/login" search={{ redirect: "/account" }}>
                          Sign in
                        </Link>
                      </Button>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}
