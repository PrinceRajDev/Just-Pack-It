import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ShoppingBasket, Store, Bike, ShieldCheck, Loader2 } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { NeighbourhoodIllustration } from "@/components/portal/NeighbourhoodIllustration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, roleHome } from "@/stores/auth";
import { isDemoMode } from "@/lib/config";
import { ApiError } from "@/lib/api/client";
import type { Role } from "@/domain/types";
import { LiveAuthForm } from "@/components/auth/LiveAuthForm";
import { authDestination, accountLabels } from "@/lib/auth-flow";
import { Link } from "@tanstack/react-router";
import "@/styles/auth.css";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — Just Pack It" },
      { name: "description", content: "Sign in to shop, sell, deliver or manage Just Pack It." },
      { property: "og:title", content: "Sign in — Just Pack It" },
      { property: "og:description", content: "Sign in with your phone number." },
    ],
  }),
  component: Login,
});

const schema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"),
  otp: z.string().regex(/^\d{6}$/, "The code is 6 digits"),
});

const roles: { role: Role; label: string; body: string; icon: typeof Store }[] = [
  { role: "buyer", label: "Shopper", body: "Browse, order and track", icon: ShoppingBasket },
  { role: "seller", label: "Shop owner", body: "Catalogue, stock and orders", icon: Store },
  { role: "delivery", label: "Delivery partner", body: "Pickups, drops and earnings", icon: Bike },
  { role: "admin", label: "Operations", body: "Marketplace administration", icon: ShieldCheck },
];

function Login() {
  const { signInDemo, signIn, session, ready, signOut } = useAuth();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const [registering, setRegistering] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [switching, setSwitching] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { phone: "", otp: "" },
  });

  const goHome = (role: Role, registered = false) =>
    navigate({ to: registered ? roleHome[role] : authDestination(role, redirect), replace: true });

  return (
    <main id="main" className="market-login grid min-h-dvh md:grid-cols-2">
      <div className="login-brand-panel hidden flex-col justify-between bg-primary p-10 text-primary-foreground md:flex">
        <Logo inverse className="[&_span]:text-primary-foreground" />
        <div className="auth-brand-story">
          <span className="auth-brand-kicker">Your local market, a little closer.</span>
          <p className="font-display text-5xl leading-tight">
            Your market.
            <br />
            Your people.
            <br />
            <em>One familiar place.</em>
          </p>
          <NeighbourhoodIllustration className="auth-brand-illustration" />
        </div>
        <div className="auth-market-note">
          <span className="auth-note-number" aria-hidden>
            01 / LOCAL FIRST
          </span>
          <p>
            From the shop around the corner
            <br />
            to the bag at your door.
          </p>
          <div className="tape h-2 w-40" aria-hidden />
        </div>
      </div>
      <div className="login-form-panel flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <Link to="/" className="auth-back-link">
            ← Back to the market
          </Link>
          <div className="md:hidden">
            <Logo />
          </div>
          <p className="auth-eyebrow">
            <span aria-hidden="true" />
            {registering ? "A new face in the neighbourhood" : "Your neighbourhood is waiting"}
          </p>
          <h1 className="mt-8 font-display text-4xl md:mt-0">
            {session
              ? "You’re already home."
              : recovering
                ? "Let’s get you back in."
                : registering
                  ? "Make yourself local."
                  : "Good to have you back."}
          </h1>
          {!ready ? (
            <p role="status" className="mt-6">
              Checking your session…
            </p>
          ) : session ? (
            <div className="auth-signed-in-panel">
              <p>
                Signed in as <strong>{session.name}</strong>
              </p>
              <span>{accountLabels[session.role]} account</span>
              <Button asChild className="w-full">
                <Link to={authDestination(session.role, redirect)}>Continue to my account</Link>
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={switching}
                onClick={async () => {
                  if (switching) return;
                  setSwitching(true);
                  try {
                    await signOut();
                  } finally {
                    setSwitching(false);
                  }
                }}
              >
                {switching ? "Signing out…" : "Use a different account"}
              </Button>
            </div>
          ) : !isDemoMode ? (
            <LiveAuthForm
              onSuccess={goHome}
              onModeChange={setRegistering}
              onRecoveryChange={setRecovering}
            />
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={form.handleSubmit(async (v) => {
                setError(undefined);
                try {
                  const s = await signIn(v.phone, v.otp);
                  goHome(s.role);
                } catch (e) {
                  setError(
                    e instanceof ApiError && e.code === "NO_BACKEND"
                      ? "Phone sign-in will work once the backend is connected. Use a demo role below."
                      : (e as Error).message,
                  );
                }
              })}
              noValidate
            >
              <div>
                <Label htmlFor="phone">Mobile number</Label>
                <Input
                  id="phone"
                  inputMode="numeric"
                  placeholder="98XXXXXXXX"
                  className="mt-1 h-11"
                  aria-invalid={!!form.formState.errors.phone}
                  {...form.register("phone")}
                />
                {form.formState.errors.phone && (
                  <p className="mt-1 text-sm text-destructive">
                    {form.formState.errors.phone.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="otp">One-time code</Label>
                <Input
                  id="otp"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit code"
                  className="mt-1 h-11"
                  aria-invalid={!!form.formState.errors.otp}
                  {...form.register("otp")}
                />
                {form.formState.errors.otp && (
                  <p className="mt-1 text-sm text-destructive">
                    {form.formState.errors.otp.message}
                  </p>
                )}
              </div>
              {error && (
                <p role="alert" className="border border-warning/50 bg-warning/10 p-3 text-sm">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />} Continue
              </Button>
            </form>
          )}
          {isDemoMode && ready && !session && (
            <div className="mt-10">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="label-stamp text-muted-foreground">Preview as a demo role</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-2">
                {roles.map(({ role, label, body, icon: Icon }) => (
                  <li key={role}>
                    <button
                      onClick={() => {
                        signInDemo(role);
                        goHome(role);
                      }}
                      className="flex h-full w-full flex-col items-start gap-1 border border-border bg-card p-3 text-left hover:border-primary"
                    >
                      <Icon className="size-5 text-primary" />
                      <span className="font-semibold">{label}</span>
                      <span className="text-xs text-muted-foreground">{body}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
