import { theme, themedStyles } from "./theme";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { StyleSheet,
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { BuyerReceipt } from "./BuyerReceipt";
import { BuyerCancelOrder } from "./BuyerCancelOrder";
import { ApiError, buyerApi, type BuyerOrder } from "./api";

export const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
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

export function statusLabel(status: string) {
  return (
    stages.find(([key]) => key === status)?.[1] ??
    {
      cancelled: "Cancelled",
      returning: "Returning to shop",
      delayed: "Delayed",
      partially_cancelled: "Partially cancelled",
      mixed: "Shop orders at different stages",
      returned: "Returned to shop",
    }[status] ??
    "Status unavailable"
  );
}

export function isPastOrder(order: BuyerOrder) {
  return order.subOrders.length > 0 && order.subOrders.every(shop =>
    shop.status === "delivered" || shop.status === "cancelled" || shopStage(shop) === "returned");
}

function isDelayed(shop: ShopOrder, createdAt: string) {
  return shop.status === "preparing" && Date.now() - Date.parse(shop.updatedAt ?? createdAt) >= 60 * 60 * 1000;
}

export function orderStage(order: BuyerOrder) {
  const active = order.subOrders.filter(shop => shop.status !== "cancelled");
  if (!active.length) return order.subOrders.length ? "cancelled" : "";
  if (active.length < order.subOrders.length) return "partially_cancelled";
  if (active.some(shop => isDelayed(shop, order.createdAt))) return "delayed";
  const pending = active.filter(shop => shop.status !== "delivered");
  const statuses = new Set((pending.length ? pending : active).map(shopStage));
  return statuses.size === 1 ? [...statuses][0] : "mixed";
}

export function orderDue(order: BuyerOrder) {
  if (order.amountDue != null) return order.amountDue;
  if (order.subOrders.length) return order.subOrders.reduce((sum, shop) => sum + (shop.status === "cancelled" ? 0 : shop.amountDue), 0);
  return order.paymentStatus === "paid" ? 0 : order.total;
}

export function OrderSymbol({ name, color = theme.accentInk }: { name: string; color?: string }) {
  const line = { borderColor: color, borderWidth: 1.5 };
  const stroke = { backgroundColor: color, height: 1.5 };
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.symbol}>
    {name === "out_for_delivery" ? <>
      <View style={[line, { position: "absolute", top: 4, left: 1, width: 12, height: 12, borderRadius: 1 }]} />
      <View style={[line, { position: "absolute", top: 8, left: 12, width: 9, height: 8, borderTopRightRadius: 4 }]} />
      {[3,15].map(left => <View key={left} style={[line, { position: "absolute", left, bottom: 2, width: 5, height: 5, borderRadius: 3, backgroundColor: theme.selected }]} />)}
    </> : name === "wallet" ? <>
      <View style={[line, { width: 17, height: 15, borderRadius: 1 }]} />
      <View style={[stroke, { position: "absolute", width: 14, top: 7 }]} />
      <View style={[line, { position: "absolute", right: 0, top: 10, width: 8, height: 6, borderRadius: 1 }]} />
    </> : name === "shop" ? <>
      <View style={[line, { width: 16, height: 14, marginTop: 4, borderRadius: 1 }]} />
      <View style={[line, { position: "absolute", width: 20, height: 7, top: 3, borderRadius: 2, backgroundColor: theme.selected }]} />
      <View style={[line, { position: "absolute", width: 5, height: 8, bottom: 3, borderBottomWidth: 0 }]} />
    </> : name === "delayed" || name === "cancelled" || name === "partially_cancelled" ?
      <View style={[line, { width: 19, height: 19, borderRadius: 10, alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color, fontSize: name === "delayed" ? 12 : 17, lineHeight: 18 }}>{name === "delayed" ? "└" : "×"}</Text>
      </View> : name === "delivered" ? <Text style={{ color, fontSize: 21 }}>✓</Text> : <>
      <View style={[line, { width: 13, height: 18, borderRadius: 1 }]} />
      {[7,11,15].map(top => <View key={top} style={[stroke, { position: "absolute", top, width: 7 }]} />)}
    </>}
  </View>;
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
  const statusKey = order ? orderStage(order) : "";
  const status = statusLabel(statusKey);
  const cod = order?.paymentMethod === "cod";
  const due = order ? orderDue(order) : 0;
  const cashPaid = order?.cashRecordedAmount ?? 0;
  const delayedShop = order?.subOrders.find(shop => isDelayed(shop, order.createdAt));
  const [receiptInfo, setReceiptInfo] = useState(false);
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
        {!order && !error ? <ActivityIndicator color={theme.accentInk} /> : null}
        {order && (
          <>
            <View style={s.statusHeading}>
              <View style={s.statusIcon}><OrderSymbol name={statusKey} color={statusKey === "cancelled" ? theme.error : theme.accentInk} /></View>
              <View style={s.headingCopy}>
                <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[s.title, statusKey === "cancelled" && s.error]}>{status}</Text>
                <Text style={s.muted}>#{order.id} · {dateTime(order.createdAt)}</Text>
              </View>
            </View>
            {statusKey === "delayed" && delayedShop && <View style={s.delay}>
              <Text style={s.shopName}>Taking a little longer</Text>
              <Text style={s.delayCopy}>{delayedShop.shopName} is still preparing your items. We’ll update you when the status changes.</Text>
            </View>}
            <View style={s.payment}>
              <View style={s.paymentLabel}><OrderSymbol name="wallet" color={theme.accentInk} /><Text style={s.paymentCopy}>{cod ? "Cash on Delivery" : "Online payment"}</Text></View>
              <Text style={s.amount}>
                {cod ? due > 0 ? `${money(due)} due at delivery` : cashPaid > 0 ? `${money(cashPaid)} paid` : "₹0 due"
                  : order.paymentStatus === "paid" ? `${money(order.onlinePaidAmount ?? order.total)} paid` : `${money(order.total)} · ${order.paymentStatus.replaceAll("_", " ")}`}
              </Text>
              {cod && <Text style={s.paymentCopy}>{statusKey === "cancelled" && !cashPaid
                ? "Nothing to pay. This COD order was cancelled."
                : statusKey === "partially_cancelled" && due > 0
                  ? `${order.subOrders.filter(shop => shop.status === "cancelled").map(shop => shop.shopName).join(", ")} items and delivery fees removed.`
                  : due > 0 ? "Pay the exact amount to your delivery partner."
                    : cashPaid > 0 ? "Payment collected at delivery." : "No cash payment is outstanding."}</Text>}
            </View>
            {!error && receiptShops.length === 0 && pending.length > 0 && <>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: receiptInfo }} style={[s.refresh, s.sage]} onPress={() => setReceiptInfo(value => !value)}>
                <Text style={s.label}>View receipt code</Text>
              </Pressable>
              {receiptInfo && <Text accessibilityLiveRegion="polite" style={s.muted}>A receipt code is available for eligible deliveries after you confirm you received your items.</Text>}
            </>}
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
            {delivered.length > 0 && pending.length > 0 && (
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
  const subtotal = shop.lines.reduce((sum, line) => sum + line.qty * line.price, 0);
  return (
    <View style={s.card}>
      <View style={s.statusHeading}>
        <View style={s.shopIcon}><OrderSymbol name={status === "cancelled" ? "cancelled" : "shop"} color={status === "cancelled" ? theme.error : theme.accentInk} /></View>
        <View style={s.headingCopy}>
          <Text style={s.shopName}>{shop.shopName}</Text>
          <Text style={[s.label, status === "cancelled" && s.error]}>{statusLabel(status)}</Text>
        </View>
      </View>
      {current >= 0 && <View style={s.timeline}>
        {timeline.map(([key, name], index) => (
          <View key={key} style={s.stage}>
            <View style={s.rail}>
              {index < timeline.length - 1 && <View style={[s.connector, index < current && s.connectorDone]} />}
              <View style={[s.dot, index < current && s.dotDone, index === current && s.dotCurrent]}>
                {index < current ? <Text style={s.check}>✓</Text> : index === current ? <View style={s.dotCenter} /> : null}
              </View>
            </View>
            <Text style={[s.stageText, index > current && s.muted, index === current && s.label]}>{name}</Text>
          </View>
        ))}
      </View>}
      <View style={s.summary}>
        {shop.cancelReason && <Text style={s.muted}>{shop.cancelReason}</Text>}
        {shop.lines.length > 0 && <Text style={s.muted}>{shop.lines.map(line => `${line.name} ${line.variantLabel || line.unit} × ${line.qty}`).join(" · ")}</Text>}
        {status === "cancelled"
          ? <Text style={s.smallGreen}>Amount due {money(shop.amountDue)}</Text>
          : <Text style={s.smallGreen}>Items {money(subtotal)} + delivery {money(shop.deliveryFee)} = {money(subtotal + shop.deliveryFee)}</Text>}
      </View>
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

const s = themedStyles(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.canvas },
  header: {
    minHeight: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  back: { minHeight: 44, justifyContent: "center" },
  arrow: { color: theme.accentInk, fontSize: 27, lineHeight: 30 },
  headerText: { color: theme.accentInk, fontSize: 18, fontWeight: "500" },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 20,
  },
  title: { color: theme.accentInk, fontSize: 28, lineHeight: 38, fontWeight: "500" },
  muted: { color: theme.muted, fontSize: 12, lineHeight: 18 },
  card: {
    padding: 16,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 24,
    gap: 10,
  },
  sage: { backgroundColor: theme.selected },
  payment: { minHeight: 142, justifyContent: "center", gap: 12, borderRadius: 24, padding: 20, backgroundColor:theme.hero },
  paymentCopy: { fontSize: 12, lineHeight: 18, color:theme.secondary },
  statusHeading: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  headingCopy: { flex: 1, gap: 3 },
  statusIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.selected, alignItems: "center", justifyContent: "center" },
  shopIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: theme.selected, alignItems: "center", justifyContent: "center" },
  symbol: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  paymentLabel: { flexDirection: "row", alignItems: "center", gap: 10 },
  delay: { borderLeftWidth: 3, borderColor: theme.primary, borderRadius: 24, padding: 20, gap: 10 },
  delayCopy: { fontSize: 14, lineHeight: 20, color: theme.muted },
  summary: { backgroundColor: theme.canvas, padding: 12, borderRadius: 12, gap: 5 },
  label: { color: theme.accentInk, fontSize: 13, fontWeight: "600" },
  amount: { color: theme.ink, fontSize: 28, lineHeight: 34, fontWeight: "500" },
  smallGreen: { color: theme.accentInk, fontSize: 13, lineHeight: 18 },
  shopName: {
    color: theme.ink,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
  },
  timeline: { paddingVertical: 6 },
  stage: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 14 },
  stageText: { color: theme.ink, fontSize: 14, lineHeight: 19 },
  rail: { width: 22, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  connector: { position: "absolute", top: "50%", height: "100%", width: 1, backgroundColor: theme.border },
  connectorDone: { backgroundColor: theme.successInk },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, alignItems: "center", justifyContent: "center" },
  dotDone: { backgroundColor: theme.successInk, borderColor: theme.successInk },
  dotCurrent: { borderColor: theme.accentInk, borderWidth: 2, width: 20, height: 20, borderRadius: 10, backgroundColor: theme.selected },
  dotCenter: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary },
  check: { color: theme.ink, fontWeight: "700", fontSize: 11 },
  error: { color: theme.error },
  refresh: { minHeight: 50, borderRadius: 12, alignItems: "center", justifyContent: "center" },
}));
