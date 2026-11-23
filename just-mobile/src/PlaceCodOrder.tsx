import { theme } from "./theme";
import { useRef, useState } from "react";
import * as SecureStore from "./deviceStorage";
import { Pressable, Text, View } from "react-native";
import {
  ApiError, buyerApi,
  type Address,
  type BuyerOrder,
  type CheckoutLine,
  type Session,
} from "./api";

function createPlacementKey() {
  return `mobile_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

export function PlaceCodOrder({
  session,
  areaId,
  address,
  total,
  items,
  shopIds,
  onConfirmed, onBusy, onFailure,
}: {
  session: Session;
  areaId: string;
  address: Address;
  total: number;
  items: CheckoutLine[];
  shopIds: string[];
  onConfirmed: (order: BuyerOrder) => void;
  onBusy: (busy: boolean) => void;
  onFailure: (failure: {message:string; uncertain:boolean; retry:()=>void} | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const lock = useRef(false);
  const place = async () => {
    if (lock.current || orderId) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    onFailure(null);
    try {
      const input = {
        areaId,
        addressId: address.id,
        addressVersion: address.version,
        expectedTotal: total,
        paymentMethod: "cod" as const,
        items,
        fulfilments: shopIds.map((shopId) => ({
          shopId,
          method: "platform_delivery" as const,
        })),
      };
      const storageKey = `jpi.pending.cod.${session.userId}`;
      const fingerprint = JSON.stringify(input);
      const existing = await SecureStore.getItemAsync(storageKey);
      const pending: { key: string; fingerprint: string } | null = existing
        ? JSON.parse(existing)
        : null;
      if (pending && pending.fingerprint !== fingerprint)
        throw new Error(
          "An earlier order attempt needs checking. Open Your orders before changing this checkout; retry the original bag and address if its result is uncertain.",
        );
      const key =
        pending?.key ??
        createPlacementKey();
      await SecureStore.setItemAsync(
        storageKey,
        JSON.stringify({ key, fingerprint }),
      );
      const order = await buyerApi.placeCod(session.token, key, input);
      if (
        !order?.id ||
        !order.address ||
        !order.subOrders?.length ||
        !Number.isFinite(order.total) ||
        !order.paymentMethod ||
        !order.paymentStatus
      ) {
        throw new Error(
          "Order details could not be confirmed. Retry with the same bag and address.",
        );
      }
      setOrderId(order.id);
      await SecureStore.deleteItemAsync(storageKey).catch(() => undefined);
      onConfirmed(order);
    } catch (reason) {
      onFailure({
        message: reason instanceof Error ? reason.message : "Order result could not be confirmed. Check Orders before trying again.",
        uncertain: !(reason instanceof ApiError) || reason.status >= 500,
        retry: () => void place(),
      });
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <View style={{ gap: 8 }}>

      {orderId ? (
        <Text
          style={{
            color: theme.accentInk,
            fontSize: 16,
            fontWeight: "600",
          }}
        >
          Order confirmed · {orderId.slice(0, 8)}
        </Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void place()}
          style={{
            minHeight: 50,
            padding: 12,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: busy ? theme.disabled : theme.primary,
          }}
        >
          <Text style={{ color: busy ? theme.muted : theme.surface, fontWeight: "600", fontSize: 15 }}>
            {busy
              ? "Placing order…"
              : `Place Order · ₹${total.toLocaleString("en-IN")}`}
          </Text>
        </Pressable>
      )}

    </View>
  );
}
