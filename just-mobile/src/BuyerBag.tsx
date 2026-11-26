import { theme, themedStyles } from "./theme";
import { BuyerStateCard } from "./BuyerStateCard";
import { useEffect, useState } from "react";
import { StyleSheet,
  Image,
  Pressable,
  ScrollView,
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
const money = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;
const subtotal = (lines: Line[]) =>
  lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

export type BuyerBagProps = {
  bag: Line[];
  shops: Shop[];
  signedIn: boolean;
  hindi: boolean;
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
  hindi,
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
          {hindi ? "आपका बैग" : "Your bag"}
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
                  {hindi ? "आपका बैग" : "Your bag"} will be waiting after sign-in.
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
            {signedIn && !delivery.checking && delivery.addressIssue && <BuyerStateCard title="Your saved address changed" copy={delivery.addressIssue} tone="warning" compact action="Reload saved addresses" onAction={delivery.retry} />}
            {signedIn && delivery.feeChanges.size > 0 && <BuyerStateCard title="Delivery quote updated" copy="Review the updated fees under each shop." tone="warning" compact action="Accept new quote" onAction={delivery.acceptFees} />}
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
              const unavailable = signedIn && !delivery.checking ? delivery.unavailable.find(row => row.id === id) : undefined;
              const riderAvailable = unavailable
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
                  {unavailable && (
                    <View style={[s.card, s.problem]}>
                      <Text style={[s.cardTitle, s.remove]}>No rider for {unavailable.name}</Text>
                      <Text style={s.copy}>{unavailable.reason ? `${unavailable.reason} ` : ""}Your items are saved. Try a different delivery address or remove this shop to continue.</Text>
                      <Pressable accessibilityRole="button" style={[s.button, s.spaced]} onPress={delivery.change}><Text style={s.buttonText}>Change address</Text></Pressable>
                      <Pressable accessibilityRole="button" style={[s.button, s.sageButton]} onPress={delivery.retry}><Text style={[s.buttonText, s.sageText]}>Retry delivery check</Text></Pressable>
                      <Pressable accessibilityRole="button" style={[s.button, s.removeShop]} onPress={() => {
                        lines.forEach(item => onChange(item.id, -item.quantity));
                        setShopRemoved(true);
                      }}><Text style={[s.buttonText, s.remove]}>Remove {unavailable.name}</Text></Pressable>
                    </View>
                  )}
                  {signedIn && delivery.feeChanges.has(id) && <Text style={s.remove}>{delivery.feeChanges.get(id)}</Text>}
                  {signedIn && delivery.shopNotices.has(id) && <BuyerStateCard title={delivery.shopNotices.get(id)!.title} copy={delivery.shopNotices.get(id)!.copy} tone="warning" compact action={delivery.shopNotices.get(id)!.action} onAction={delivery.shopNotices.get(id)!.run} />}
                  {lines.map((item) => {
                    const image = resolveImage(item.image);
                    const notice = signedIn ? delivery.itemNotices.get(item.id) : undefined;
                    return (
                      <View key={item.id}>
                        <View style={s.row}>
                          <View style={s.thumbnail}>
                            {image ? (
                              <Image
                                source={{ uri: image }}
                                style={s.photo}
                                resizeMode="cover"
                              />
                            ) : (
                              <MarketIcon name="bag" color={theme.accentInk} />
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
                        {notice && <BuyerStateCard title={notice.title} copy={notice.copy} tone="warning" compact action={notice.action} onAction={notice.run} />}
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
        <ScrollView contentContainerStyle={s.content}>
          <BuyerStateCard title={hindi ? "आपका बैग आपका इंतज़ार कर रहा है।" : "Your bag is waiting."} copy={hindi ? "अपने पड़ोस की स्वतंत्र दुकानों से बढ़िया सामान खोजें।" : "Discover great things from independent shops in your neighbourhood."} icon="bag" action={hindi ? "आस-पास की दुकानें देखें" : "Explore nearby shops"} onAction={onBrowse} />
        </ScrollView>
      )}
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.canvas },
  header: {
    minHeight: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  backButton: { minHeight: 44, justifyContent: "center" },
  back: { color: theme.accentInk, fontSize: 27, lineHeight: 30 },
  heading: { color: theme.accentInk, fontSize: 18, fontWeight: "500" },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 16,
  },
  title: { color: theme.ink, fontSize: 24, lineHeight: 32, fontWeight: "600" },
  card: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 24,
    backgroundColor: theme.surface,
    padding: 16,
  },
  signInCard: { backgroundColor:theme.hero, borderColor:theme.border, padding: 19 },
  white: { color: theme.ink, fontSize: 18 },
  signInCopy: { color: theme.ink, marginBottom: 4 },
  problem: { borderColor: theme.error },
  selected: { borderColor: theme.accentInk },
  spaced: { marginTop: 12 },
  checking: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: theme.selected, borderRadius: 16, minHeight: 64, padding: 16 },
  addressActions: { flexDirection: "row", gap: 12 },
  addressButton: { flex: 1, minHeight: 44, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 4 },
  addressSage: { backgroundColor: theme.selected, borderColor: theme.selected },
  addressActionText: { color: theme.accentInk, fontSize: 13, textAlign: "center", fontWeight: "500" },
  removeShop: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.error, marginTop: 10 },
  footerDisabled: { backgroundColor: theme.disabled },
  shopHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  shopIcon: { width: 36, height: 36, backgroundColor: theme.selected, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  cardTitle: {
    color: theme.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  copy: { color: theme.muted, fontSize: 13, lineHeight: 18, marginTop: 10 },
  button: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  buttonText: { color: theme.onPrimary, fontSize: 15, fontWeight: "600" },
  sageButton: { backgroundColor: theme.selected, marginTop: 10 },
  sageText: { color: theme.accentInk },
  delivery: {
    color: theme.accentInk,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    marginTop: 2,
  },
  muted: { color: theme.muted },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: theme.border },
  thumbnail: {
    width: 72,
    height: 80,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: theme.selected,
    alignItems: "center",
    justifyContent: "center",
  },
  photo: { width: "100%", height: "100%" },
  item: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, lineHeight: 19, fontWeight: "600", color: theme.ink },
  unit: { fontSize: 11, lineHeight: 16, color: theme.muted, marginTop: 2 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: theme.selected,
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
  step: { color: theme.accentInk, fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.4 },
  removeButton: { alignSelf: "flex-start", paddingBottom: 2 },
  remove: { color: theme.error, fontSize: 12, lineHeight: 18, fontWeight: "400" },
  amount: { fontSize: 14, fontWeight: "700", color: theme.ink, alignSelf: "center" },
  shopSubtotal: {
    alignSelf: "flex-end",
    marginTop: 10,
    fontSize: 11,
    color: theme.muted,
  },
  total: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  footer: {
    backgroundColor: theme.surface,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: theme.border,
  },
  empty: {
    padding: 20,
    gap: 8,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  start: { paddingHorizontal: 22 },
}));
