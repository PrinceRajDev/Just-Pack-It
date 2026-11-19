import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { BuyerOrder } from "./api";

const green = "#07552F";
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
        <Text style={s.payment}>
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
        <View style={s.card}>
          <Text style={s.addressTitle}>◉ {address.label}</Text>
          {contact ? <Text style={s.contact}>{contact}</Text> : null}
          <Text style={s.address}>
            {address.line1}
            {"\n"}
            {address.locality}, {address.city} · {address.pincode}
          </Text>
        </View>
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
        <Text style={s.note}>
          We’ll show an estimated arrival when one is available.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FAF8F1" },
  header: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  back: { minHeight: 44, justifyContent: "center" },
  arrow: { color: green, fontSize: 27, lineHeight: 30 },
  headerTitle: { fontSize: 21, color: green, fontWeight: "600" },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 20 },
  card: {
    backgroundColor: "#fff",
    borderColor: "#E0E3D8",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  success: { backgroundColor: "#EAF0D9" },
  checkArea: {
    height: 86,
    justifyContent: "center",
    alignItems: "flex-start",
    paddingLeft: 7,
  },
  check: {
    width: 35,
    height: 19,
    borderColor: green,
    borderLeftWidth: 7,
    borderBottomWidth: 7,
    transform: [{ translateY: -7 }, { rotate: "-45deg" }],
  },
  title: { color: green, fontSize: 30, lineHeight: 42, fontWeight: "600" },
  reference: {
    color: "#252D25",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    marginTop: 10,
  },
  description: {
    color: "#252D25",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  payment: {
    color: "#252D25",
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "600",
  },
  amount: { color: green, fontSize: 24, lineHeight: 33, fontWeight: "600" },
  addressTitle: {
    color: green,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  contact: {
    color: "#252D25",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    marginTop: 10,
  },
  address: { color: "#73796E", fontSize: 13, lineHeight: 18, marginTop: 10 },
  button: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  track: { backgroundColor: green },
  continue: { backgroundColor: "#EAF0D9" },
  buttonText: { color: green, fontSize: 15, fontWeight: "600" },
  trackText: { color: "#fff" },
  note: { color: "#73796E", fontSize: 12, lineHeight: 16 },
});
