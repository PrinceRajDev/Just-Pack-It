import { useEffect, useState } from "react";
import { BuyerReceipt } from "./BuyerReceipt";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { buyerApi, type BuyerOrder } from "./api";
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const label = (value: string) => value.replaceAll("_", " ");
export function BuyerOrderDetails({
  token,
  id,
  back,
}: {
  token: string;
  id: string;
  back: () => void;
}) {
  const [order, setOrder] = useState<BuyerOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void buyerApi
      .order(token, id)
      .then((data) => {
        if (active) {
          setOrder(data);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Order could not load",
          );
      });
    return () => {
      active = false;
    };
  }, [token, id, attempt]);
  return (
    <ScrollView
      contentContainerStyle={{ padding: 24, paddingBottom: 120, gap: 16 }}
    >
      <Pressable onPress={back}>
        <Text style={{ color: "#174B34", paddingVertical: 8 }}>
          ← Your orders
        </Text>
      </Pressable>
      <Text style={{ fontSize: 26, color: "#1F2A22" }}>
        Order {id.slice(0, 8)}
      </Text>
      <Pressable onPress={() => setAttempt((value) => value + 1)}>
        <Text style={{ color: "#174B34", paddingVertical: 8 }}>
          Refresh status
        </Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: "#B3432B" }}>
          {error}
        </Text>
      ) : null}
      {!order && !error ? <ActivityIndicator color="#174B34" /> : null}
      {order ? (
        <>
          <Text>{new Date(order.createdAt).toLocaleString("en-IN")}</Text>
          <Text>Order total: {money(order.total)}</Text>
          <Text>
            Remaining amount due: {money(order.amountDue ?? order.total)}
          </Text>
          <Text>
            Payment: {label(order.paymentStatus)} · {label(order.paymentMethod)}
          </Text>
          {order.cancelledAmount ? (
            <Text>Cancelled amount: {money(order.cancelledAmount)}</Text>
          ) : null}
          <View
            style={{
              padding: 16,
              borderRadius: 12,
              backgroundColor: "#EDF3DF",
            }}
          >
            <Text style={{ fontWeight: "600" }}>
              Deliver to {order.address.label}
            </Text>
            <Text style={{ marginTop: 8, lineHeight: 21 }}>
              {order.address.line1}, {order.address.locality},{" "}
              {order.address.city} {order.address.pincode}
            </Text>
          </View>
          {order.subOrders.map((shop) => (
            <View
              key={shop.id}
              style={{
                padding: 16,
                borderWidth: 1,
                borderColor: "#DDD6C9",
                borderRadius: 12,
                backgroundColor: "#FDFBF7",
                gap: 12,
              }}
            >
              <Text
                style={{ fontSize: 18, fontWeight: "600", color: "#1F2A22" }}
              >
                {shop.shopName}
              </Text>
              <Text style={{ color: "#174B34" }}>
                Shop status: {label(shop.status)}
              </Text>
              {shop.deliveryState ? (
                <Text>Rider status: {label(shop.deliveryState)}</Text>
              ) : null}
              {shop.cancelReason ? (
                <Text>Cancellation: {shop.cancelReason}</Text>
              ) : null}
              {shop.lines.map((line, index) => (
                <View key={`${line.productId}:${line.variantId ?? index}`}>
                  <Text style={{ fontWeight: "500" }}>{line.name}</Text>
                  <Text style={{ color: "#5E554A", marginTop: 4 }}>
                    {line.variantLabel || line.unit} · {line.qty} ×{" "}
                    {money(line.price)} = {money(line.qty * line.price)}
                  </Text>
                </View>
              ))}
              <Text>Delivery fee: {money(shop.deliveryFee)}</Text>
              <Text>Remaining due: {money(shop.amountDue)}</Text>
              {shop.status === "out_for_delivery" && shop.deliveryState === "out_for_delivery" ? <BuyerReceipt token={token} orderId={order.id} subId={shop.id} version={(shop as typeof shop & { version?: number }).version ?? 0} cod={order.paymentMethod === "cod"} amount={shop.amountDue} /> : null}
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
