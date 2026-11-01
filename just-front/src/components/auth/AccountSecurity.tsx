import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { authentication } from "@/services/auth";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LockKeyhole } from "lucide-react";
export function AccountSecurity() {
  const { clearSession } = useAuth();
  const [mode, setMode] = useState<"password" | "logout">("password"),
    [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || uncertain) return;
    setError("");
    if (current.length < 12 || current.length > 128) {
      setError("Enter your current password (12 to 128 characters).");
      return;
    }
    if (
      mode === "password" &&
      (next.length < 12 || next.length > 128 || next === current || next !== confirm)
    ) {
      setError("Use a different new password of 12 to 128 characters and match its confirmation.");
      return;
    }
    if (!ack) {
      setError("Confirm that every device, including this one, will be signed out.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "password") await authentication.changePassword(current, next);
      else await authentication.logoutAll(current);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success(
        mode === "password"
          ? "Password changed. Sign in again with your new password."
          : "All sessions revoked. Sign in again.",
      );
      clearSession();
    } catch (cause) {
      setCurrent("");
      setNext("");
      setConfirm("");
      const unknown =
        !(cause instanceof ApiError) ||
        cause.status === 0 ||
        cause.status >= 500 ||
        cause.status === 409;
      setUncertain(unknown);
      setAck(false);
      setError(
        unknown
          ? "The result could not be confirmed. Do not repeat this action. Sign in again; if you changed your password, try the new password first."
          : cause instanceof Error
            ? cause.message
            : "The action could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-6 space-y-4 rounded-xl border bg-card p-5"
      aria-labelledby="account-security-title"
    >
      <h2 id="account-security-title" className="account-card-heading font-display text-2xl">
        <span>
          <LockKeyhole size={21} aria-hidden="true" />
        </span>
        Account security
      </h2>
      <p className="text-sm text-muted-foreground">
        Your current password is required. Both actions sign out every device, including this one.
        SMS password recovery is not available yet.
      </p>
      <form onSubmit={(event) => void submit(event)} className="max-w-lg space-y-4" noValidate>
        <fieldset disabled={busy || uncertain} className="space-y-4">
          <label className="block text-sm">
            Security action
            <select
              className="mt-1 block w-full rounded border bg-background p-2"
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as "password" | "logout");
                setCurrent("");
                setNext("");
                setConfirm("");
                setAck(false);
                setError("");
              }}
            >
              <option value="password">Change password</option>
              <option value="logout">Sign out all devices</option>
            </select>
          </label>
          <div>
            <Label htmlFor="security-current-password">Current password</Label>
            <Input
              id="security-current-password"
              type="password"
              autoComplete="current-password"
              minLength={12}
              maxLength={128}
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </div>
          {mode === "password" && (
            <>
              <div>
                <Label htmlFor="security-new-password">New password</Label>
                <Input
                  id="security-new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="security-confirm-password">Confirm new password</Label>
                <Input
                  id="security-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>
            </>
          )}
          <label className="flex items-start gap-3 text-sm">
            <input
              className="mt-1 accent-primary"
              type="checkbox"
              checked={ack}
              onChange={(event) => setAck(event.target.checked)}
            />
            I understand all devices, including this one, will be signed out.
          </label>
          <Button
            type="submit"
            disabled={!ack || !current || (mode === "password" && (!next || !confirm))}
          >
            {busy
              ? "Updating account security…"
              : mode === "password"
                ? "Change password & sign out"
                : "Sign out all devices"}
          </Button>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {uncertain && (
          <Button asChild variant="outline">
            <Link to="/login" onClick={() => clearSession()}>
              Clear this session & sign in again
            </Link>
          </Button>
        )}
      </form>
    </section>
  );
}
