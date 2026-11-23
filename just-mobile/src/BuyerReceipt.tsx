import { theme, themedStyles } from "./theme";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Pressable, Text, View } from "react-native";
import { buyerApi } from "./api";

export function BuyerReceipt({
  token,
  orderId,
  subId,
  version,
  cod,
  amount,
  shopName,
}: {
  token: string;
  orderId: string;
  subId: string;
  version: number;
  cod: boolean;
  amount: number;
  shopName?: string;
}) {
  const [proof, setProof] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!proof) return;
    const timer = setTimeout(
      () => setProof(null),
      Math.max(0, Date.parse(proof.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [proof]);
  const issue = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      setProof(await buyerApi.receiptCode(token, orderId, subId, version, cod));
      setConfirming(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Code could not generate. Refresh and retry.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <View style={s.card}>
      <Text style={s.heading}>
        {shopName ? `Receipt code · ${shopName}` : "Receipt code"}
      </Text>
      {proof ? (
        <>
          <View accessible accessibilityLabel={proof.code.split("").join(" ")} style={s.digits}>
            {proof.code.split("").map((digit, index) => <View key={index} style={s.digit}><Text style={s.code}>{digit}</Text></View>)}
          </View>
          <Text style={s.copy}>
            Share this code when you receive your order.
          </Text>
        </>
      ) : (
        <Text style={s.copy}>
          Confirm receipt to get your delivery verification code.
        </Text>
      )}
      {confirming ? (
        <>
          <Text style={s.copy}>
            {cod
              ? `Have you received your items and paid ₹${amount.toLocaleString("en-IN")} in cash?`
              : "Have you received your items?"}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void issue()}
            style={s.action}
          >
            <Text style={s.link}>
              {busy ? "Generating…" : cod ? "Received and paid" : "Received"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => setConfirming(false)}
            style={s.action}
          >
            <Text style={s.link}>Not yet</Text>
          </Pressable>
        </>
      ) : !proof ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setConfirming(true)}
          style={s.action}
        >
          <Text style={s.link}>View receipt code</Text>
        </Pressable>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      {proof && !confirming && (
        <View accessibilityRole="button" accessibilityState={{ disabled: true }} style={[s.action, s.delivered]}>
          <Text style={s.link}>View delivered order</Text>
        </View>
      )}
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.accentInk,
    backgroundColor: theme.surface,
    padding: 20,
    gap: 12,
  },
  heading: { color: theme.accentInk, fontSize: 18, fontWeight: "600" },
  digits: { flexDirection: "row", gap: 10 },
  digit: { flex: 1, minHeight: 66, borderRadius: 12, backgroundColor: theme.selected, alignItems: "center", justifyContent: "center" },
  code: {
    color: theme.accentInk,
    fontSize: 28,
    lineHeight: 50,

    fontWeight: "600",
  },
  copy: { color: theme.ink, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  action: { minHeight: 50, backgroundColor: theme.selected, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  link: { color: theme.accentInk, fontSize: 15, fontWeight: "600" },
  error: { color: theme.error },
  delivered: { alignItems: "center", opacity: 0.6 },
}));
