import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { marketApi, type Product, type Shop } from "./api";
import { resolveImage } from "./images";
import { MarketIcon } from "./MarketIcon";

type Line = Product & { quantity: number };
const green = "#07552F";
const sage = "#EAF0D9";
const money = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;
const subtotal = (lines: Line[]) =>
  lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

export function BuyerBag({
  bag,
  shops,
  signedIn,
  onBack,
  onSignIn,
  onCheckout,
  onBrowse,
  onChange,
}: {
  bag: Line[];
  shops: Shop[];
  signedIn: boolean;
  onBack: () => void;
  onSignIn: () => void;
  onCheckout: () => void;
  onBrowse: () => void;
  onChange: (id: string, delta: number) => void;
}) {
  const [extraShops, setExtraShops] = useState<Shop[]>([]);
  const groups = new Map<string, Line[]>();
  for (const line of bag) {
    const rows = groups.get(line.shopId) ?? [];
    rows.push(line);
    groups.set(line.shopId, rows);
  }
  const known = new Map(
    [...extraShops, ...shops].map((shop) => [shop.id, shop]),
  );
  const missing = [...groups.keys()]
    .filter((id) => !known.has(id))
    .sort()
    .join(",");
  useEffect(() => {
    if (!missing) return;
    let active = true;
    const ids = missing.split(",");
    const batches = Array.from(
      { length: Math.ceil(ids.length / 24) },
      (_, index) =>
        marketApi
          .shopsByIds(ids.slice(index * 24, index * 24 + 24))
          .catch(() => []),
    );
    void Promise.all(batches).then((results) => {
      if (active) setExtraShops((previous) => [...previous, ...results.flat()]);
    });
    return () => {
      active = false;
    };
  }, [missing]);

  return (
    <View style={s.page} testID="buyer-bag">
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back from bag"
          hitSlop={8}
          onPress={onBack}
          style={s.backButton}
        >
          <Text style={s.back}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={s.heading}>
          Your bag
        </Text>
      </View>
      {bag.length ? (
        <>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.content}
            testID="bag-scroll"
            showsVerticalScrollIndicator={false}
          >
            <Text accessibilityRole="header" style={s.title}>
              Fresh finds, ready to go.
            </Text>
            {!signedIn && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Sign in to place your order</Text>
                <Text style={s.copy}>
                  Your bag will be waiting after sign-in.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={onSignIn}
                  style={[s.button, s.sageButton]}
                >
                  <Text style={[s.buttonText, s.sageText]}>
                    Sign in to continue
                  </Text>
                </Pressable>
              </View>
            )}
            {[...groups].map(([id, lines]) => {
              const shop = known.get(id);
              const delivery = shop?.fulfilment?.includes("platform_delivery");
              return (
                <View key={id} style={s.card} testID={`bag-shop-${id}`}>
                  <Text accessibilityRole="header" style={s.cardTitle}>
                    {shop?.name ?? "Local shop"}
                  </Text>
                  <Text style={[s.delivery, delivery === false && s.muted]}>
                    {delivery
                      ? "Rider delivery available"
                      : delivery === false
                        ? "Rider delivery unavailable"
                        : "Rider delivery checked at checkout"}
                  </Text>
                  {lines.map((item) => {
                    const image = resolveImage(item.image);
                    return (
                      <View key={item.id} style={s.row}>
                        <View style={s.thumbnail}>
                          {image ? (
                            <Image
                              source={{ uri: image }}
                              style={s.photo}
                              resizeMode="cover"
                            />
                          ) : (
                            <MarketIcon name="bag" color={green} />
                          )}
                        </View>
                        <View style={s.item}>
                          <Text style={s.name}>{item.name}</Text>
                          <Text style={s.unit}>
                            {item.unit} · {money(item.price)} each
                          </Text>
                          <View style={s.stepper}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Remove one ${item.name}`}
                              onPress={() => onChange(item.id, -1)}
                              style={s.stepButton}
                            >
                              <Text style={s.step}>−</Text>
                            </Pressable>
                            <Text style={s.step}>{item.quantity}</Text>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Add one ${item.name}`}
                              disabled={item.quantity >= item.stock}
                              onPress={() => onChange(item.id, 1)}
                              style={[
                                s.stepButton,
                                item.quantity >= item.stock && s.disabled,
                              ]}
                            >
                              <Text style={s.step}>+</Text>
                            </Pressable>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${item.name}`}
                            onPress={() => onChange(item.id, -item.quantity)}
                            style={s.removeButton}
                          >
                            <Text style={s.remove}>Remove</Text>
                          </Pressable>
                        </View>
                        <Text
                          accessibilityLabel={`Item total ${money(item.price * item.quantity)}`}
                          style={s.amount}
                        >
                          {money(item.price * item.quantity)}
                        </Text>
                      </View>
                    );
                  })}
                  <Text
                    accessibilityLabel={`Shop subtotal ${money(subtotal(lines))}`}
                    style={s.shopSubtotal}
                  >
                    {money(subtotal(lines))} subtotal
                  </Text>
                </View>
              );
            })}
            <View style={s.total}>
              <Text style={s.cardTitle}>Items total</Text>
              <Text style={s.cardTitle}>{money(subtotal(bag))}</Text>
            </View>
          </ScrollView>
          <View style={s.footer} testID="bag-footer">
            <Pressable
              accessibilityRole="button"
              style={s.button}
              onPress={signedIn ? onCheckout : onSignIn}
            >
              <Text style={s.buttonText}>
                {signedIn ? "Continue to checkout" : "Sign in to checkout"}
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={s.empty}>
          <MarketIcon name="bag" color={green} />
          <Text style={s.title}>Your bag is looking empty.</Text>
          <Text style={s.copy}>
            Explore nearby shops and find something fresh.
          </Text>
          <Pressable
            accessibilityRole="button"
            style={[s.button, s.sageButton, s.start]}
            onPress={onBrowse}
          >
            <Text style={[s.buttonText, s.sageText]}>Start shopping</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FAF8F1" },
  header: {
    minHeight: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  backButton: { minHeight: 44, justifyContent: "center" },
  back: { color: green, fontSize: 27, lineHeight: 30 },
  heading: { color: green, fontSize: 21, fontWeight: "600" },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 20,
  },
  title: { color: "#252D25", fontSize: 24, lineHeight: 32, fontWeight: "600" },
  card: {
    borderWidth: 1,
    borderColor: "#E0E3D8",
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 16,
  },
  cardTitle: {
    color: "#252D25",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  copy: { color: "#73796E", fontSize: 13, lineHeight: 18, marginTop: 10 },
  button: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: green,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  sageButton: { backgroundColor: sage, marginTop: 10 },
  sageText: { color: green },
  delivery: {
    color: green,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    marginTop: 10,
  },
  muted: { color: "#73796E" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 11 },
  thumbnail: {
    width: 62,
    height: 66,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: sage,
    alignItems: "center",
    justifyContent: "center",
  },
  photo: { width: "100%", height: "100%" },
  item: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, lineHeight: 19, fontWeight: "600", color: "#252D25" },
  unit: { fontSize: 11, lineHeight: 16, color: "#73796E", marginTop: 2 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: -6,
  },
  stepButton: {
    minWidth: 23,
    minHeight: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  step: { color: green, fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.4 },
  removeButton: { alignSelf: "flex-start", paddingBottom: 2 },
  remove: { color: "#73796E", fontSize: 11, lineHeight: 15, fontWeight: "600" },
  amount: { fontSize: 14, fontWeight: "700", color: "#252D25", marginTop: 20 },
  shopSubtotal: {
    position: "absolute",
    right: 16,
    bottom: 9,
    fontSize: 11,
    color: "#73796E",
  },
  total: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  footer: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  empty: {
    padding: 20,
    gap: 8,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  start: { paddingHorizontal: 22 },
});
