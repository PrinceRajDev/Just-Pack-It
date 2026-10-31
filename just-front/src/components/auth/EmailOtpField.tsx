import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { authentication } from "@/services/auth";
import type { SignupEmailProof } from "@/domain/management";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function EmailOtpField({
  available,
  disabled,
  onProof,
}: {
  available: boolean;
  disabled: boolean;
  onProof: (proof: SignupEmailProof | undefined) => void;
}) {
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [challenge, setChallenge] = useState<{ challengeId: string; expiresAt: string }>(),
    [until, setUntil] = useState(0),
    [now, setNow] = useState(Date.now());
  const send = useMutation({
    mutationFn: () => authentication.sendEmailOtp(email.trim().toLowerCase()),
    onSuccess: (result) => {
      setChallenge(result);
      setCode("");
      setUntil(Date.now() + result.resendAfterSeconds * 1000);
    },
  });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    onProof(
      challenge && /^\d{6}$/.test(code) && Date.parse(challenge.expiresAt) > now
        ? {
            email: email.trim().toLowerCase(),
            emailChallengeId: challenge.challengeId,
            emailOtp: code,
          }
        : undefined,
    );
  }, [challenge, code, email, now, onProof]);
  return (
    <fieldset
      className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4"
      disabled={disabled}
    >
      <legend className="px-1 text-sm font-semibold">Verify your email</legend>
      <p className="text-xs text-muted-foreground">
        A six-digit code verifies your email address. Your mobile number remains unverified.
      </p>
      <Label htmlFor="signup-email">Email address</Label>
      <Input
        id="signup-email"
        type="email"
        autoComplete="email"
        maxLength={254}
        value={email}
        disabled={send.isPending}
        onChange={(event) => {
          setEmail(event.target.value);
          setChallenge(undefined);
          setCode("");
          send.reset();
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={
          !available ||
          send.isPending ||
          now < until ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        }
        onClick={() => send.mutate()}
      >
        {send.isPending
          ? "Sending code…"
          : now < until
            ? `Resend in ${Math.ceil((until - now) / 1000)}s`
            : challenge
              ? "Resend email code"
              : "Send email code"}
      </Button>
      {!available && (
        <p role="alert" className="text-sm">
          Email verification is awaiting sender configuration. New account registration is
          unavailable; existing users can still sign in.
        </p>
      )}
      {send.isError && (
        <p role="alert" className="text-sm">
          {send.error.message}
        </p>
      )}
      {challenge && (
        <>
          <p role="status" className="text-sm">
            Code submitted to your email provider. Check your inbox and spam folder. It expires in
            10 minutes.
          </p>
          <Label htmlFor="signup-email-code">Six-digit email code</Label>
          <Input
            id="signup-email-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          />
          {Date.parse(challenge.expiresAt) <= now && (
            <p role="alert" className="text-sm">
              Code expired. Request another code.
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}
