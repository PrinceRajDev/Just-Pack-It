import { LanguageSwitcher } from "@/lib/i18n/Language";
import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ShoppingBasket, Store, Bike, ShieldCheck, Loader2 } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
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
import "@/styles/auth-refined.css";
import { imageUrl } from "@/lib/image";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Sign in: Just Pack It" },
      { name: "description", content: "Sign in to shop, sell, deliver or manage Just Pack It." },
      { property: "og:title", content: "Sign in: Just Pack It" },
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
  const mode = registering ? "signup" : recovering ? "recovery" : "signin";
  const previousMode = useRef(mode);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (previousMode.current !== mode) heading.current?.focus();
    previousMode.current = mode;
  }, [mode]);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { phone: "", otp: "" },
  });

  const goHome = (role: Role, registered = false) =>
    navigate({ to: registered ? roleHome[role] : authDestination(role, redirect), replace: true });

  return (
    <main id="main" className="market-login auth-refined min-h-dvh">
      <header className="auth-navigation">
        <Link to="/" className="auth-back-link">
          <ArrowLeft size={16} strokeWidth={1.5} aria-hidden />
          <span className="max-sm:sr-only">
            <UiText>Back to the market</UiText>
          </span>
        </Link>
        <Logo />
        <LanguageSwitcher />
      </header>
      <div className="login-form-panel">
        <div className="auth-packing-label" aria-labelledby="auth-title">
          <span className="auth-label-tape tape" aria-hidden />
          <h1 id="auth-title" ref={heading} tabIndex={-1} className="font-display">
            <UiText>
              {session
                ? "Your account"
                : recovering
                  ? "Reset your password"
                  : registering
                    ? "Create an account"
                    : "Sign in"}
            </UiText>
          </h1>
          {!session && !recovering && (
            <p className="auth-welcome-description">
              <UiText>
                {registering
                  ? "Shop, sell or deliver in your neighbourhood"
                  : "Find your local shops and keep track of your orders"}
              </UiText>
            </p>
          )}
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
                <UiText>{switching ? "Signing out…" : "Use a different account"}</UiText>
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
                <Label htmlFor="phone">
                  <UiText>{"Mobile number"}</UiText>
                </Label>
                <UiAttributes>
                  <Input
                    id="phone"
                    inputMode="numeric"
                    placeholder="98XXXXXXXX"
                    className="mt-1 h-11"
                    aria-invalid={!!form.formState.errors.phone}
                    {...form.register("phone")}
                  />
                </UiAttributes>
                {form.formState.errors.phone && (
                  <p className="mt-1 text-sm text-destructive">
                    {form.formState.errors.phone.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="otp">One-time code</Label>
                <UiAttributes>
                  <Input
                    id="otp"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit code"
                    className="mt-1 h-11"
                    aria-invalid={!!form.formState.errors.otp}
                    {...form.register("otp")}
                  />
                </UiAttributes>
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
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                <UiText>{"Continue"}</UiText>
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
                      <span className="font-semibold">
                        <UiText>{label}</UiText>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        <UiText>{body}</UiText>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="auth-credit flex items-center justify-center gap-2 text-muted-foreground">
          <p>
            Developed by{" "}
            <UiAttributes>
              <a
                href="https://prince-newportfolio.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm font-semibold text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                aria-label="Prince’s portfolio (opens in a new tab)"
              >
                Prince
              </a>
            </UiAttributes>
          </p>
          <img
            src={imageUrl("/brand/prince-developer.jpg")}
            alt="Prince"
            width={48}
            height={48}
            loading="lazy"
            decoding="async"
            className="size-12 shrink-0 rounded-full border border-primary/20 object-cover object-top"
          />
        </div>
      </div>
    </main>
  );
}
