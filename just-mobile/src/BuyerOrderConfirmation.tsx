import { theme } from "./theme";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { DeliveryAddressContents } from "./CheckoutPresentation";
import type { BuyerOrder } from "./api";

const green = theme.accentInk;
const money = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

export function BuyerOrderConfirmation({
  order,
  contact,
  back,
  track,
  shop,
}: {
  order: BuyerOrder;
  contact?: string;
  back: () => void;
  track: () => void;
  shop: () => void;
}) {
  const count = order.subOrders.length;
  const cod = order.paymentMethod === "cod";
  const due =
    order.amountDue ?? (order.paymentStatus === "paid" ? 0 : order.total);
  const { address } = order;
  return (
    <View style={s.screen} testID="order-confirmation">
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back from confirmation"
          hitSlop={8}
          onPress={back}
          style={s.back}
        >
          <Text style={s.arrow}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={s.headerTitle}>
          Order confirmed
        </Text>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <View style={[s.card, s.success]}>
          <View style={s.checkArea}>
            <View style={s.check} />
          </View>
          <Text accessibilityRole="header" style={s.title}>
            Your neighbourhood{"\n"}is on it!
          </Text>
          <Text style={s.reference}>Order #{order.id}</Text>
          <Text style={s.description}>
            Your order is placed with {count} {count === 1 ? "shop" : "shops"}.
            We’ll update you as each shop prepares your items.
          </Text>
        </View>
        <View style={s.paymentCard}><Text style={s.payment}>
          {cod ? "Cash on Delivery" : "Online payment"}
        </Text>
        <Text style={s.amount}>
          {cod
            ? due > 0
              ? `${money(due)} due at delivery`
              : "No cash due at delivery"
            : order.onlinePaidAmount != null && order.onlinePaidAmount > 0
              ? `${money(order.onlinePaidAmount)} paid`
              : order.paymentStatus.replaceAll("_", " ")}
        </Text>
        </View>
        <View style={[s.card, s.selected]}>
          <DeliveryAddressContents address={address} contact={contact} selected />
        </View>
        <Text style={s.note}>
          We’ll show an estimated arrival when one is available.
        </Text>
      </ScrollView>
      <View style={s.footer}>
        <Pressable
          accessibilityRole="button"
          onPress={track}
          style={[s.button, s.track]}
        >
          <Text style={[s.buttonText, s.trackText]}>Track Order</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={shop}
          style={[s.button, s.continue]}
        >
          <Text style={s.buttonText}>Continue Shopping</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.canvas },
  header: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  back: { minHeight: 44, justifyContent: "center" },
  arrow: { color: green, fontSize: 27, lineHeight: 30 },
  headerTitle: { fontSize: 18, color: green, fontWeight: "500" },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 },
  card: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
  },
  success: { backgroundColor:theme.mint, borderColor:theme.mint, padding: 19 },
  selected: { borderColor: green },
  paymentCard: { borderRadius: 20, padding: 16, gap: 8, backgroundColor: theme.lime },
  footer: { borderTopWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, paddingHorizontal: 20, paddingVertical: 16, gap: 8 },
  checkArea: {
    width: 48, height: 48, borderRadius: 16, backgroundColor: theme.lime,
    justifyContent: "center", alignItems: "center", marginBottom: 14,
  },
  check: {
    width: 23,
    height: 13,
    borderColor: green,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    transform: [{ translateY: -2 }, { rotate: "-45deg" }],
  },
  title: { color: theme.ink, fontSize: 24, lineHeight: 34, fontWeight: "500" },
  reference: {
    color: theme.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    marginTop: 10,
  },
  description: {
    color: theme.ink,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  payment: {
    color: green,
    fontSize: 12,
    lineHeight: 18,
  },
  amount: { color: green, fontSize: 24, lineHeight: 33, fontWeight: "500" },
  addressTitle: {
    color: green,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  contact: {
    color: theme.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    marginTop: 10,
  },
  address: { color: theme.muted, fontSize: 13, lineHeight: 18, marginTop: 10 },
  button: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  track: { backgroundColor: theme.coral },
  continue: { backgroundColor: theme.lime },
  buttonText: { color: green, fontSize: 15, fontWeight: "600" },
  trackText: { color: theme.ink },
  note: { color: theme.muted, fontSize: 12, lineHeight: 16 },
});
