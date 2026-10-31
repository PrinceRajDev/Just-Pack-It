import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { authentication } from "@/services/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function PasswordRecovery({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [challenge, setChallenge] = useState<{ challengeId: string; expiresAt: string }>(),
    [until, setUntil] = useState(0),
    [now, setNow] = useState(Date.now());
  const request = useMutation({
    mutationFn: () => authentication.requestPasswordReset(email.trim().toLowerCase()),
    onSuccess: (data) => {
      setChallenge(data);
      setCode("");
      setUntil(Date.now() + data.resendAfterSeconds * 1000);
    },
  });
  const reset = useMutation({
    mutationFn: () =>
      authentication.resetPassword({
        email: email.trim().toLowerCase(),
        emailChallengeId: challenge!.challengeId,
        emailOtp: code,
        newPassword: password,
      }),
    onSuccess: () => {
      setPassword("");
      setRepeat("");
      setCode("");
    },
  });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (reset.isSuccess)
    return (
      <div className="mt-6 space-y-4" role="status">
        <p>
          Password reset complete. All previous sessions have been signed out. Sign in with your new
          password.
        </p>
        <Button onClick={onClose}>Back to sign in</Button>
      </div>
    );
  return (
    <div className="mt-6 space-y-4">
      <h2 className="font-display text-2xl">Find your way back.</h2>
      <p className="text-sm text-muted-foreground">
        Use the email you previously verified. Accounts without a verified email need help from the
        platform.
      </p>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          request.mutate();
        }}
      >
        <Label htmlFor="recovery-email">Verified email address</Label>
        <Input
          id="recovery-email"
          required
          type="email"
          maxLength={254}
          value={email}
          autoComplete="email"
          disabled={request.isPending || reset.isPending}
          onChange={(event) => {
            setEmail(event.target.value);
            setChallenge(undefined);
            reset.reset();
            request.reset();
          }}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={request.isPending || reset.isPending || now < until}
        >
          {request.isPending
            ? "Requesting…"
            : now < until
              ? `Resend in ${Math.ceil((until - now) / 1000)}s`
              : "Request recovery code"}
        </Button>
      </form>
      {request.isSuccess && (
        <p role="status" className="text-sm">
          If this email belongs to an eligible account, a reset code will be submitted. Check
          inbox/spam. Delivery is not guaranteed; resend after the cooldown if needed.
        </p>
      )}
      {request.isError && (
        <p role="alert" className="text-sm">
          {request.error.message}
        </p>
      )}
      {challenge && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (password === repeat) reset.mutate();
          }}
        >
          <Label htmlFor="recovery-code">Six-digit recovery code</Label>
          <Input
            id="recovery-code"
            required
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            autoComplete="one-time-code"
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          />
          <Label htmlFor="recovery-password">New password</Label>
          <Input
            id="recovery-password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Label htmlFor="recovery-confirm">Confirm new password</Label>
          <Input
            id="recovery-confirm"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
          />
          {repeat && password !== repeat && (
            <p className="text-sm" role="alert">
              Passwords do not match.
            </p>
          )}
          {reset.isError && (
            <p role="alert" className="text-sm">
              {reset.error.message} If the result is uncertain, try signing in with your new
              password before requesting another code.
            </p>
          )}
          <Button
            type="submit"
            disabled={
              reset.isPending ||
              request.isPending ||
              password !== repeat ||
              password.length < 12 ||
              code.length !== 6 ||
              Date.parse(challenge.expiresAt) <= now
            }
          >
            {reset.isPending ? "Resetting…" : "Reset password and sign out devices"}
          </Button>
        </form>
      )}
      <Button variant="ghost" disabled={request.isPending || reset.isPending} onClick={onClose}>
        Back to sign in
      </Button>
    </div>
  );
}
