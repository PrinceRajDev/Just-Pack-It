import { useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { buyerApi } from "./api";
export function BuyerReceipt({ token, orderId, subId, version, cod, amount }: { token: string; orderId: string; subId: string; version: number; cod: boolean; amount: number }) {
  const [proof, setProof] = useState<{ code: string; expiresAt: string; amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const issue = async () => { if (lock.current) return; lock.current = true; setBusy(true); setError(null); try { setProof(await buyerApi.receiptCode(token, orderId, subId, version, cod)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Code could not generate. Refresh the order and retry."); } finally { lock.current = false; setBusy(false); } };
  return <View style={{ gap: 12 }}><Text style={{ color: "#5E554A", lineHeight: 20 }}>Share this code only after receiving your goods{cod ? ` and paying ₹${amount.toLocaleString("en-IN")} in cash` : ""}.</Text>{proof ? <View><Text selectable style={{ fontSize: 30, color: "#174B34", letterSpacing: 4 }}>{proof.code}</Text><Text>Expires {new Date(proof.expiresAt).toLocaleTimeString("en-IN")}</Text><Text>The rider must verify this code to complete delivery.</Text></View> : null}<Pressable disabled={busy} onPress={() => Alert.alert("Confirm receipt", cod ? `Have you received these goods and paid ₹${amount.toLocaleString("en-IN")} in cash?` : "Have you received these goods?", [{ text: "Not yet", style: "cancel" }, { text: cod ? "Received and paid" : "Received", onPress: () => void issue() }])} style={{ padding: 14, borderRadius: 8, backgroundColor: "#174B34", alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "600" }}>{busy ? "Generating…" : proof ? "Generate a new receipt code" : "Confirm receipt and get code"}</Text></Pressable>{error ? <Text style={{ color: "#B3432B" }}>{error}</Text> : null}</View>;
}
