import { useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Alert, Pressable, Text, View } from "react-native";
import { buyerApi, type Address, type CheckoutLine, type Session } from "./api";

export function PlaceCodOrder({ session, areaId, address, total, items, shopIds, onConfirmed }: { session: Session; areaId: string; address: Address; total: number; items: CheckoutLine[]; shopIds: string[]; onConfirmed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const lock = useRef(false);
  const place = async () => {
    if (lock.current || orderId) return;
    lock.current = true; setBusy(true); setMessage(null);
    try {
      const input = { areaId, addressId: address.id, addressVersion: address.version, expectedTotal: total, paymentMethod: "cod" as const, items, fulfilments: shopIds.map((shopId) => ({ shopId, method: "platform_delivery" as const })) };
      const storageKey = `jpi.pending.cod.${session.userId}`;
      const fingerprint = JSON.stringify(input);
      const existing = await SecureStore.getItemAsync(storageKey);
      const pending: { key: string; fingerprint: string } | null = existing ? JSON.parse(existing) : null;
      if (pending && pending.fingerprint !== fingerprint) throw new Error("An earlier order attempt needs checking. Open Your orders before changing this checkout; retry the original bag and address if its result is uncertain.");
      const key = pending?.key ?? `mobile_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
      await SecureStore.setItemAsync(storageKey, JSON.stringify({ key, fingerprint }));
      const order = await buyerApi.placeCod(session.token, key, input);
      setOrderId(order.id);
      setMessage("Order confirmed. Pay cash when your delivery arrives. View its status in Account → Your orders. Your bag is retained so you can review it.");
      await SecureStore.deleteItemAsync(storageKey).catch(() => undefined);
      Alert.alert("Order confirmed", `Order ${order.id.slice(0, 8)} is confirmed. Pay cash on delivery.`);
      onConfirmed();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Order result could not be confirmed. Retry with the same bag and address."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={{ marginTop: 16, gap: 12 }}>{orderId ? <Text style={{ color: "#174B34", fontSize: 16, fontWeight: "600" }}>Order confirmed · {orderId.slice(0, 8)}</Text> : <Pressable disabled={busy} onPress={() => Alert.alert("Confirm cash on delivery", `Place this order for ₹${total.toLocaleString("en-IN")}? Pay the rider on delivery.`, [{ text: "Review again", style: "cancel" }, { text: "Place COD order", onPress: () => void place() }])} style={{ minHeight: 48, padding: 12, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#174B34", opacity: busy ? 0.5 : 1 }}><Text style={{ color: "#fff", fontWeight: "600" }}>{busy ? "Confirming order…" : `Place COD order · ₹${total.toLocaleString("en-IN")}`}</Text></Pressable>}{message ? <Text accessibilityRole="alert" style={{ color: "#5E554A", fontSize: 14, lineHeight: 21 }}>{message}</Text> : null}</View>;
}
