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

import { CheckoutHeading, DeliveryAddressContents } from "./CheckoutPresentation";
import { OrderSymbol } from "./BuyerOrderDetails";
import type { BagDelivery } from "./BuyerCheckout";

type Line = Product & { quantity: number };
const green = "#07552F";
const sage = "#EAF0D9";
const money = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;
const subtotal = (lines: Line[]) =>
  lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

export type BuyerBagProps = {
  bag: Line[];
  shops: Shop[];
  signedIn: boolean;
  onBack: () => void;
  onSignIn: () => void;
  delivery: BagDelivery;
  onBrowse: () => void;
  onChange: (id: string, delta: number) => void;
};

export function BuyerBag({
  bag,
  shops,
  signedIn,
  onBack,
  onSignIn,
  delivery,
  onBrowse,
  onChange,
}: BuyerBagProps) {
  const [shopRemoved, setShopRemoved] = useState(false);
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
            <CheckoutHeading title={shopRemoved ? "Shop removed from your bag" : "Fresh finds, ready to go."} icon="bag" plain />
            {!signedIn && (
              <View style={[s.card, s.signInCard]}>
                <Text style={[s.cardTitle, s.white]}>Sign in to place your order</Text>
                <Text style={[s.copy, s.signInCopy]}>
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
            {signedIn && delivery.checking && <View style={s.checking}>
              <OrderSymbol name="out_for_delivery" />
              <Text accessibilityLiveRegion="polite" style={s.delivery}>Checking rider availability…</Text>
            </View>}
            {signedIn && !delivery.checking && delivery.unavailable.map(shop => (
              <View key={shop.id} style={[s.card, s.problem]}>
                <Text style={[s.cardTitle, s.remove]}>No rider for {shop.name}</Text>
                <Text style={s.copy}>{shop.reason ? `${shop.reason} ` : ""}Your items are saved. Try a different delivery address or remove this shop to continue.</Text>
                <Pressable accessibilityRole="button" style={[s.button, s.spaced]} onPress={delivery.change}><Text style={s.buttonText}>Change address</Text></Pressable>
                <Pressable accessibilityRole="button" style={[s.button, s.sageButton]} onPress={delivery.retry}><Text style={[s.buttonText, s.sageText]}>Retry delivery check</Text></Pressable>
                <Pressable accessibilityRole="button" style={[s.button, s.removeShop]} onPress={() => {
                  groups.get(shop.id)?.forEach(item => onChange(item.id, -item.quantity));
                  setShopRemoved(true);
                }}><Text style={[s.buttonText, s.remove]}>Remove {shop.name}</Text></Pressable>
              </View>
            ))}
            {signedIn && !delivery.checking && delivery.error && <View style={[s.card, s.problem]}>
              <Text accessibilityRole="alert" style={s.remove}>{delivery.error}</Text>
              <Pressable accessibilityRole="button" style={[s.button, s.sageButton]} onPress={delivery.retry}><Text style={[s.buttonText, s.sageText]}>Retry delivery check</Text></Pressable>
            </View>}
            {signedIn && delivery.address && <View style={[s.card, s.selected]}>
              <DeliveryAddressContents address={delivery.address} contact={delivery.contact} selected />
            </View>}
            {signedIn && <View style={s.addressActions}>
              <Pressable accessibilityRole="button" style={[s.button, s.addressButton]} onPress={delivery.change}><Text style={s.addressActionText}>{delivery.address ? "Change delivery address" : "Choose delivery address"}</Text></Pressable>
              <Pressable accessibilityRole="button" style={[s.button, s.addressButton, s.addressSage]} onPress={delivery.saved}><Text style={s.addressActionText}>Saved addresses</Text></Pressable>
            </View>}
            {[...groups].map(([id, lines]) => {
              const shop = known.get(id);
              const riderAvailable = signedIn && delivery.unavailable.some(row => row.id === id)
                ? false : shop?.fulfilment?.includes("platform_delivery");
              return (
                <View key={id} style={s.card} testID={`bag-shop-${id}`}>
                  <View style={s.shopHeader}>
                    <View style={s.shopIcon}><OrderSymbol name="shop" /></View>
                    <View style={s.item}><Text accessibilityRole="header" style={s.cardTitle}>{shop?.name ?? "Local shop"}</Text>
                  <Text style={[s.delivery, riderAvailable === false && s.muted]}>
                    {signedIn && delivery.checking ? "Checking rider availability…" : riderAvailable
                      ? "Rider delivery available"
                      : riderAvailable === false
                        ? "Rider delivery unavailable"
                        : "Rider delivery checked at checkout"}
                  </Text>
                    </View>
                  </View>
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
              style={[s.button, signedIn && (delivery.checking || delivery.blocked) && s.footerDisabled]}
              disabled={signedIn && (delivery.checking || delivery.blocked)}
              onPress={signedIn ? delivery.checkout : onSignIn}
            >
              <Text style={[s.buttonText, signedIn && (delivery.checking || delivery.blocked) && s.muted]}>
                {!signedIn ? "Sign in to checkout" : delivery.checking ? "Checking delivery…" : delivery.blocked ? "Resolve delivery to continue" : delivery.total === null ? "Choose address" : `Checkout · ${money(delivery.total)}`}
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
  page: { flex: 1, backgroundColor: "#F8F6EE" },
  header: {
    minHeight: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  backButton: { minHeight: 44, justifyContent: "center" },
  back: { color: green, fontSize: 27, lineHeight: 30 },
  heading: { color: green, fontSize: 18, fontWeight: "500" },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 16,
  },
  title: { color: "#252D25", fontSize: 24, lineHeight: 32, fontWeight: "600" },
  card: {
    borderWidth: 1,
    borderColor: "#E0E3D8",
    borderRadius: 24,
    backgroundColor: "#fff",
    padding: 16,
  },
  signInCard: { backgroundColor: green, borderColor: green, padding: 19 },
  white: { color: "#fff", fontSize: 18 },
  signInCopy: { color: "#EAF0D9", marginBottom: 4 },
  problem: { borderColor: "#AF3927" },
  selected: { borderColor: green },
  spaced: { marginTop: 12 },
  checking: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: sage, borderRadius: 16, minHeight: 64, padding: 16 },
  addressActions: { flexDirection: "row", gap: 12 },
  addressButton: { flex: 1, minHeight: 44, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E0E3D8", paddingHorizontal: 4 },
  addressSage: { backgroundColor: sage, borderColor: sage },
  addressActionText: { color: green, fontSize: 13, textAlign: "center", fontWeight: "500" },
  removeShop: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#AF3927", marginTop: 10 },
  footerDisabled: { backgroundColor: "#DDE2D5" },
  shopHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  shopIcon: { width: 36, height: 36, backgroundColor: sage, borderRadius: 11, alignItems: "center", justifyContent: "center" },
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
    marginTop: 2,
  },
  muted: { color: "#73796E" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: "#DADFD0" },
  thumbnail: {
    width: 72,
    height: 80,
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
    alignSelf: "flex-start",
    backgroundColor: sage,
    borderRadius: 10,
    minHeight: 36,
    marginTop: 3,
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
  remove: { color: "#AF3927", fontSize: 12, lineHeight: 18, fontWeight: "400" },
  amount: { fontSize: 14, fontWeight: "700", color: "#252D25", alignSelf: "center" },
  shopSubtotal: {
    alignSelf: "flex-end",
    marginTop: 10,
    fontSize: 11,
    color: "#73796E",
  },
  total: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  footer: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: "#DADFD0",
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
