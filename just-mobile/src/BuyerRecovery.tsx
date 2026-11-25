import { theme, themedStyles } from "./theme";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { buyerApi } from "./api";
import { BuyerAuthNotice } from "./BuyerAuthNotice";

const countdown = (milliseconds: number) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export function BuyerRecovery({ back }: { back: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<"email" | "code" | "password" | "done">(
    "email",
  );
  const [challenge, setChallenge] = useState<{
    challengeId: string;
    expiresAt: string;
    resendAt: number;
    email: string;
  } | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const expired = !!challenge && now >= Date.parse(challenge.expiresAt);
  const resendWait = challenge ? challenge.resendAt - now : 0;

  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [challenge]);

  const send = async () => {
    if (lock.current) return;
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter your verified account email.");
      return;
    }
    if (challenge && Date.now() < challenge.resendAt) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await buyerApi.recoveryCode(address);
      const issued = Date.now();
      setNow(issued);
      setChallenge({
        ...response,
        email: address,
        resendAt: issued + response.resendAfterSeconds * 1000,
      });
      setCode("");
      setStep("code");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Code could not be requested.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const next = () => {
    setError("");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the six-digit email code.");
      return;
    }
    setStep("password");
  };

  const reset = async () => {
    if (lock.current || !challenge) return;
    if (Date.now() >= Date.parse(challenge.expiresAt)) {
      setNow(Date.now());
      return;
    }
    if (password.length < 12 || password !== confirm) {
      setError(
        password.length < 12
          ? "Use at least 12 characters."
          : "The passwords must match.",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await buyerApi.resetPassword({
        email: challenge.email,
        emailChallengeId: challenge.challengeId,
        emailOtp: code,
        newPassword: password,
      });
      setPassword("");
      setConfirm("");
      setCode("");
      setChallenge(null);
      setStep("done");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Password could not reset.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const title =
    step === "done"
      ? "Password updated."
      : expired
        ? "This code has expired."
        : step === "email"
          ? "Forgot your password?"
          : step === "code"
            ? "Check your email."
            : "Choose a new password.";
  const copy =
    step === "done"
      ? "You can now sign in using your new password."
      : expired
        ? "Request a new code to continue."
        : step === "email"
          ? "We'll send a verification code to your verified account email."
          : step === "code"
            ? `If ${challenge?.email} is eligible, a six-digit code will arrive in that inbox.`
            : "Use 12–128 characters. Your email code will be verified when you save.";
  const sendsCode = step === "email" || expired;
  const primaryAction = sendsCode ? () => void send() : step === "code" ? next : () => void reset();
  const primaryLabel = busy ? (sendsCode ? "Sending…" : "Saving…") : step === "email" ? "Send verification code" : expired ? "Resend code" : step === "code" ? "Verify code" : "Save password";
  const primaryDisabled = busy || (sendsCode && resendWait > 0);
  const stage = step === "email" ? 1 : step === "code" || expired ? 2 : 3;
  return (
    <View style={s.screen} testID="buyer-recovery">
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back from password recovery" hitSlop={10} disabled={busy} onPress={back} style={s.headerBack}>
          <Text style={s.chevron}>‹</Text>
        </Pressable>
        <Text style={s.headerTitle}>Reset password</Text>
      </View>
    <ScrollView style={s.scroll}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.page}
    >
      {step === "done" || expired ? (
        <BuyerAuthNotice title={title} copy={copy} tone={expired ? "warning" : "success"} icon={expired ? "clock" : "check"} action={step === "done" ? "Back to sign in" : undefined} onAction={back} />
      ) : (
        <View style={s.intro}>
          <Text style={s.stepLabel}>Step {stage} of 3</Text>
          <View style={s.progress} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[1, 2, 3].map(index => <View key={index} style={[s.segment, index <= stage && s.segmentActive]} />)}
          </View>
          <Text accessibilityRole="header" style={s.title}>{title}</Text>
          <Text style={s.description}>{copy}</Text>
        </View>
      )}
      {error ? (
        <BuyerAuthNotice title="Check your details" copy={error} warning />
      ) : null}
      {step !== "done" && <View style={s.form}>
        {step === "email" && (
          <>
            <Text style={s.label}>Verified account email</Text>
            <TextInput
              accessibilityLabel="Recovery email"
              editable={!busy}
              style={s.input}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              autoCorrect={false}
              placeholder="you@example.com"
              placeholderTextColor={theme.muted}
              value={email}
              onChangeText={setEmail}
            />
          </>
        )}
        {(step === "code" || expired) && (
          <>
            <Text style={s.label}>Verification code</Text>
            <TextInput
              accessibilityLabel="Recovery code"
              editable={!busy && !expired}
              autoComplete="one-time-code"
              placeholder="000000"
              placeholderTextColor={theme.muted}
              style={[s.input, s.codeInput, expired && s.disabled]}
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, ""))}
            />
            <Text style={[s.label, expired && s.expiredText]}>
              {expired ? "Expired · 00:00" : `Expires in ${countdown(Date.parse(challenge!.expiresAt) - now)}`}
            </Text>
          </>
        )}
        {step === "password" && !expired && (
          <>
            <Text style={s.label}>New password</Text>
            <TextInput
              accessibilityLabel="New password"
              autoCapitalize="none"
              autoComplete="new-password"
              editable={!busy}
              style={s.input}
              secureTextEntry={!visible}
              value={password}
              onChangeText={setPassword}
              maxLength={128}
            />
            <Text style={s.label}>Confirm password</Text>
            <TextInput
              accessibilityLabel="Confirm password"
              autoCapitalize="none"
              editable={!busy}
              style={s.input}
              secureTextEntry={!visible}
              value={confirm}
              onChangeText={setConfirm}
              maxLength={128}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setVisible((value) => !value)}
            >
              <Text style={s.link}>
                {visible ? "Hide passwords" : "Show passwords"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                setError("");
                setStep("code");
              }}
            >
              <Text style={s.link}>Edit email code</Text>
            </Pressable>
          </>
        )}
        {step === "code" && !expired && (
          <Pressable accessibilityRole="button" disabled={busy || resendWait > 0} onPress={() => void send()} style={[s.backAction, s.resend, (busy || resendWait > 0) && s.disabled]}>
            <Text style={[s.link, (busy || resendWait > 0) && s.disabledText]}>{resendWait > 0 ? `Resend in ${countdown(resendWait)}` : "Resend code"}</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={s.backAction}
          onPress={back}
        >
          <Text style={s.link}>
            Back to sign in
          </Text>
        </Pressable>
      </View>}
    </ScrollView>
    {step !== "done" && <View style={s.footer}><Pressable accessibilityRole="button" disabled={primaryDisabled} onPress={primaryAction} style={[s.button, primaryDisabled && s.disabled]}>{busy && <ActivityIndicator size="small" color={theme.secondary} />}<Text style={[s.buttonText, primaryDisabled && s.disabledText]}>{primaryLabel}</Text></Pressable></View>}
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.canvas },
  scroll: { flex: 1 },
  footer: { padding: 16, paddingHorizontal: 20, backgroundColor: theme.surface, borderTopWidth: 1, borderColor: theme.border },
  resend: { backgroundColor: theme.selected },
  page: {
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 16,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
  header: { minHeight: 64, paddingHorizontal: 20, gap: 14, flexDirection: "row", alignItems: "center" },
  headerBack: { minHeight: 44, justifyContent: "center" },
  chevron: { color: theme.accentInk, fontSize: 27, lineHeight: 30 },
  headerTitle: { color: theme.accentInk, fontSize: 21, fontWeight: "600" },
  intro: { gap: 8 },
  stepLabel: { color: theme.accentInk, fontSize: 13, fontWeight: "600" },
  progress: { flexDirection: "row", gap: 5, maxWidth: 160, marginBottom: 6 },
  segment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: theme.border },
  segmentActive: { backgroundColor: theme.primary },
  title: { color: theme.ink, fontSize: 32, lineHeight: 38, fontWeight: "700" },
  description: { color: theme.secondary, fontSize: 14, lineHeight: 20 },
  codeInput: { letterSpacing: 6, fontSize: 20, fontVariant: ["tabular-nums"] },
  expiredText: { color: theme.error },
  backAction: { borderWidth: 1, borderColor: theme.border, borderRadius: 12, minHeight: 50, justifyContent: "center", alignItems: "center" },
  form: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 20, padding: 16, gap: 10 },
  label: { fontSize: 13, color: theme.secondary },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: theme.controlBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: theme.surface,
    color: theme.ink,
  },
  button: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    minHeight: 50,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  disabled: { backgroundColor: theme.disabled },
  disabledText: { color: theme.secondary },
  buttonText: { color: theme.onPrimary, fontWeight: "600", textAlign: "center" },
  link: {
    color: theme.accentInk,
    textAlign: "center",
    fontWeight: "600",
    paddingVertical: 12,
  },
}));
