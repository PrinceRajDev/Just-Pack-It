import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BuyerReceipt } from "./BuyerReceipt";
import { BuyerCancelOrder } from "./BuyerCancelOrder";
import { ApiError, buyerApi, type BuyerOrder } from "./api";

const green = "#07552F";
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const dateTime = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
const stages = [
  ["placed", "Placed"],
  ["accepted", "Accepted"],
  ["preparing", "Preparing"],
  ["ready", "Ready for pickup"],
  ["picked_up", "Picked up"],
  ["out_for_delivery", "Out for delivery"],
  ["delivered", "Delivered"],
] as const;
type ShopOrder = BuyerOrder["subOrders"][number];

function shopStage(shop: ShopOrder) {
  if (shop.status === "cancelled") return "cancelled";
  if (shop.deliveryState === "returning" || shop.deliveryState === "returned")
    return shop.deliveryState;
  return shop.deliveryState === "picked_up" ? "picked_up" : shop.status;
}

function statusLabel(status: string) {
  return (
    stages.find(([key]) => key === status)?.[1] ??
    {
      cancelled: "Cancelled",
      returning: "Returning to shop",
      returned: "Returned to shop",
    }[status] ??
    "Status unavailable"
  );
}

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
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const deliveredOffset = useRef(0);
  useEffect(() => {
    let active = true;
    let busy = false;
    const refresh = async () => {
      if (!active || busy || AppState.currentState === "background") return;
      busy = true;
      try {
        const data = await buyerApi.order(token, id);
        if (!active) return;
        setOrder(data);
        setError("");
      } catch (reason) {
        if (!active) return;
        if (
          reason instanceof ApiError &&
          [401, 403, 404].includes(reason.status)
        )
          setOrder(null);
        setError(
          reason instanceof Error ? reason.message : "Order could not load.",
        );
      } finally {
        busy = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [token, id, attempt]);

  const activeShops =
    order?.subOrders.filter((shop) => shop.status !== "cancelled") ?? [];
  const pending = activeShops.filter((shop) => shop.status !== "delivered");
  const statuses = [
    ...new Set((pending.length ? pending : activeShops).map(shopStage)),
  ];
  const status =
    statuses.length === 1
      ? statusLabel(statuses[0])
      : statuses.length > 1
        ? "Shop orders at different stages"
        : order?.subOrders.length
          ? "Cancelled"
          : "Status unavailable";
  const cod = order?.paymentMethod === "cod";
  const due = order?.amountDue ?? order?.total ?? 0;
  const receiptShops = error
    ? []
    : activeShops.filter(
        (shop) =>
          shop.status === "out_for_delivery" &&
          shop.deliveryState === "out_for_delivery",
      );
  const delivered = activeShops.filter((shop) => shop.status === "delivered");

  return (
    <View style={s.screen} testID="buyer-order-details">
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back from order details"
          onPress={back}
          hitSlop={8}
          style={s.back}
        >
          <Text style={s.arrow}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={s.headerText}>
          Order details
        </Text>
      </View>
      <ScrollView
        ref={scroller}
        style={s.scroll}
        contentContainerStyle={s.content}
      >
        {error ? (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        ) : null}
        {!order && !error ? <ActivityIndicator color={green} /> : null}
        {order && (
          <>
            <Text
              accessibilityRole="header"
              accessibilityLiveRegion="polite"
              style={s.title}
            >
              {status}
            </Text>
            <Text style={s.muted}>
              #{order.id} · {dateTime(order.createdAt)}
            </Text>
            <View style={[s.card, s.sage, s.payment]}>
              <Text style={s.label}>
                {cod ? "Cash on Delivery" : "Online payment"}
              </Text>
              <Text style={s.amount}>
                {cod
                  ? due > 0
                    ? `${money(due)} due at delivery`
                    : "No cash due"
                  : order.paymentStatus === "paid"
                    ? `${money(order.onlinePaidAmount ?? order.total)} paid`
                    : `${money(order.total)} · ${order.paymentStatus.replaceAll("_", " ")}`}
              </Text>
              {cod && due > 0 ? (
                <Text style={s.smallGreen}>
                  Pay the exact amount to your delivery partner.
                </Text>
              ) : null}
            </View>
            {receiptShops.map((shop) => (
              <BuyerReceipt
                key={`${shop.id}:${shop.version ?? 0}`}
                token={token}
                orderId={order.id}
                subId={shop.id}
                version={shop.version ?? 0}
                cod={cod}
                amount={shop.amountDue}
                shopName={activeShops.length > 1 ? shop.shopName : undefined}
              />
            ))}
            {delivered.length > 0 && (
              <Pressable
                accessibilityRole="button"
                style={s.refresh}
                onPress={() =>
                  scroller.current?.scrollTo({ y: deliveredOffset.current })
                }
              >
                <Text style={s.label}>View delivered order</Text>
              </Pressable>
            )}
            {order.subOrders.map((shop) => (
              <ShopCard
                key={shop.id}
                shop={shop}
                order={order}
                token={token}
                refresh={() => setAttempt((value) => value + 1)}
              />
            ))}
            <View
              style={s.card}
              onLayout={(event) => {
                deliveredOffset.current = event.nativeEvent.layout.y;
              }}
            >
              <Text style={s.shopName}>
                {delivered.length === activeShops.length && delivered.length > 0
                  ? "Delivery details"
                  : `Deliver to ${order.address.label}`}
              </Text>
              <Text style={s.muted}>
                {order.address.line1}, {order.address.locality},{" "}
                {order.address.city} · {order.address.pincode}
              </Text>
              {order.cancelledAmount ? (
                <Text style={s.muted}>
                  Cancelled amount: {money(order.cancelledAmount)}
                </Text>
              ) : null}
              {delivered.map((shop) => (
                <Text key={shop.id} style={s.label}>
                  {shop.shopName} · Delivered
                </Text>
              ))}
            </View>
          </>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => setAttempt((value) => value + 1)}
          style={s.refresh}
        >
          <Text style={s.label}>Refresh status</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function ShopCard({
  shop,
  order,
  token,
  refresh,
}: {
  shop: ShopOrder;
  order: BuyerOrder;
  token: string;
  refresh: () => void;
}) {
  const status = shopStage(shop);
  const timeline = stages.filter(
    ([key]) =>
      key !== "picked_up" ||
      shop.fulfilment === "platform_delivery" ||
      !!shop.deliveryState,
  );
  const current = timeline.findIndex(([key]) => key === status);
  return (
    <View style={s.card}>
      <Text style={s.shopName}>{shop.shopName}</Text>
      <Text style={s.label}>{statusLabel(status)}</Text>
      {shop.updatedAt ? (
        <Text style={s.muted}>Updated {dateTime(shop.updatedAt)}</Text>
      ) : null}
      {current >= 0 ? (
        <View style={s.timeline}>
          {timeline.map(([key, name], index) => (
            <View key={key} style={s.stage}>
              <View style={[s.dot, index <= current && s.dotDone]} />
              <Text
                style={[
                  s.muted,
                  index <= current && s.smallGreen,
                  index === current && s.bold,
                ]}
              >
                {name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {shop.cancelReason ? (
        <Text style={s.muted}>Cancellation: {shop.cancelReason}</Text>
      ) : null}
      {shop.lines.map((line, index) => (
        <View key={`${line.productId}:${line.variantId ?? index}`}>
          <Text style={s.bold}>{line.name}</Text>
          <Text style={s.muted}>
            {line.variantLabel || line.unit} · {line.qty} × {money(line.price)}{" "}
            = {money(line.qty * line.price)}
          </Text>
        </View>
      ))}
      <Text style={s.muted}>
        Delivery fee: {money(shop.deliveryFee)} · Remaining due:{" "}
        {money(shop.amountDue)}
      </Text>
      {(shop.status === "placed" || shop.status === "accepted") &&
      (order.paymentMethod === "cod" || order.paymentStatus === "paid") ? (
        <BuyerCancelOrder
          key={shop.version ?? 0}
          token={token}
          orderId={order.id}
          subId={shop.id}
          version={shop.version ?? 0}
          shopName={shop.shopName}
          onCancelled={refresh}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FAF8F1" },
  header: {
    minHeight: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  back: { minHeight: 44, justifyContent: "center" },
  arrow: { color: green, fontSize: 27, lineHeight: 30 },
  headerText: { color: green, fontSize: 21, fontWeight: "600" },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 20,
  },
  title: { color: green, fontSize: 28, lineHeight: 38, fontWeight: "600" },
  muted: { color: "#73796E", fontSize: 12, lineHeight: 18 },
  card: {
    padding: 16,
    backgroundColor: "#fff",
    borderColor: "#E0E3D8",
    borderWidth: 1,
    borderRadius: 16,
    gap: 10,
  },
  sage: { backgroundColor: "#EAF0D9" },
  payment: { gap: 10 },
  label: { color: green, fontSize: 13, fontWeight: "600" },
  amount: { color: green, fontSize: 25, lineHeight: 34, fontWeight: "600" },
  smallGreen: { color: green, fontSize: 13, lineHeight: 18 },
  shopName: {
    color: "#252D25",
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
  },
  timeline: { gap: 10 },
  stage: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#818579",
  },
  dotDone: { backgroundColor: green, borderColor: green },
  bold: { fontWeight: "600" },
  error: { color: "#A23425" },
  refresh: { minHeight: 44, alignItems: "center", justifyContent: "center" },
});
