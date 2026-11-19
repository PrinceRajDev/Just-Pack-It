import { useEffect, useRef, useState } from "react";
import { useAndroidBack } from "./useAndroidBack";
import { PlaceCodOrder } from "./PlaceCodOrder";
import { BuyerAddresses } from "./BuyerAddresses";
import { ChooseDeliveryAddress } from "./ChooseDeliveryAddress";
import * as storage from "./deviceStorage";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  buyerApi,
  type Address,
  type BuyerProfile,
  type CheckoutReview,
  type Product,
  type Session,
  type Shop,
} from "./api";
export function BuyerCheckout({
  session,
  areaId,
  bag,
  shops,
  back,
  account,
  onConfirmed,
}: {
  session: Session | null;
  areaId?: string;
  bag: (Product & { quantity: number })[];
  shops: Shop[];
  back: () => void;
  account: () => void;
  onConfirmed: () => void;
}) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [defaultId, setDefaultId] = useState<string>();
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [review, setReview] = useState<CheckoutReview | null>(null);
  const [reviewedAddress, setReviewedAddress] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(true);
  const [editor, setEditor] = useState<{ address?: Address } | null>(null);
  const [addressRevision, setAddressRevision] = useState(0);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const preferenceKey = session
    ? `jpi.address.default.${session.userId}`
    : undefined;
  const preferred =
    addresses.find((address) => address.id === defaultId) ??
    addresses.find(
      (address) => address.label.trim().toLowerCase() === "home",
    ) ??
    addresses[0];
  const selected =
    addresses.find((address) => address.id === selectedId) ?? preferred;

  const reload = () => {
    setError(null);
    setAddressesLoading(true);
    setAddressRevision((value) => value + 1);
  };

  useEffect(() => {
    if (!session || !preferenceKey) return;
    let active = true;
    void Promise.all([
      buyerApi.addresses(session.token),
      storage.getItemAsync(preferenceKey).catch(() => null),
    ])
      .then(([items, savedDefault]) => {
        if (!active) return;
        setAddresses(items);
        setDefaultId(savedDefault ?? undefined);
      })
      .catch(() => {
        if (active)
          setError(
            "Saved addresses could not load. Tap Reload addresses to retry.",
          );
      })
      .finally(() => {
        if (active) setAddressesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session, preferenceKey, addressRevision]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void buyerApi
      .profile(session.token)
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [session]);

  const saveEdited = (address: Address, makeDefault: boolean) => {
    setAddresses((items) =>
      items.some((item) => item.id === address.id)
        ? items.map((item) => (item.id === address.id ? address : item))
        : [...items, address],
    );
    setSelectedId(address.id);
    setEditor(null);
    if (reviewedAddress?.id === address.id) setReview(null);
    setError(null);
    if (!preferenceKey || (!makeDefault && defaultId !== address.id)) return;
    const persist = makeDefault
      ? storage.setItemAsync(preferenceKey, address.id)
      : storage.deleteItemAsync(preferenceKey);
    void persist
      .then(() => setDefaultId(makeDefault ? address.id : undefined))
      .catch(() =>
        setError(
          "Address saved. The default preference could not be saved on this device.",
        ),
      );
  };

  const closePicker = () => {
    if (busyRef.current) return;
    if (editor) setEditor(null);
    else if (review && reviewedAddress) {
      setSelectedId(reviewedAddress.id);
      setChoosing(false);
    } else back();
  };

  const check = async () => {
    if (!session || !selected || !areaId || !bag.length || busyRef.current)
      return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await buyerApi.reviewCheckout(
        session.token,
        areaId,
        selected,
        bag.map((line) => ({
          productId: line.productId ?? line.id,
          variantId: line.variantId,
          qty: line.quantity,
        })),
        [...new Set(bag.map((line) => line.shopId))],
      );
      setSelectedId(selected.id);
      setReviewedAddress(selected);
      setReview(result);
      setChoosing(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Delivery check failed",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const issues = review
    ? [...review.issues, ...review.lines.flatMap((line) => line.issues)]
    : [];
  const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
  const shopCounts = new Map<string, number>();
  for (const line of bag)
    shopCounts.set(
      line.shopId,
      (shopCounts.get(line.shopId) ?? 0) + line.quantity,
    );
  const shopIds = [...shopCounts.keys()];
  const total = review?.grandTotal ?? null;
  const hasCod = review?.paymentMethods.includes("cod") ?? false;
  const hasDelivery =
    shopIds.length > 0 &&
    shopIds.every((id) => {
      const group = review?.shops.find((row) => row.shop.id === id);
      const delivery = review?.fulfilments.find((row) => row.shopId === id);
      return (
        !!group &&
        !group.issues.length &&
        delivery?.listedFee != null &&
        !delivery.issues.length
      );
    });
  const openPicker = () => {
    setError(null);
    setChoosing(true);
  };
  useAndroidBack(() => {
    if (!session || choosing) return false;
    openPicker();
    return true;
  }, 10);
  const contact = profile
    ? [
        profile.name,
        profile.phone?.replace(/^\+91([6-9]\d{4})(\d{5})$/, "$1 $2"),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <View style={s.safe} testID="checkout-screen">
      <Modal
        visible={!!session && choosing}
        animationType="slide"
        onRequestClose={closePicker}
      >
        <SafeAreaProvider>
          <SafeAreaView testID="choose-address-safe" style={s.safe}>
            {session && editor ? (
              <BuyerAddresses
                token={session.token}
                back={() => setEditor(null)}
                checkout={{
                  address: editor.address,
                  isDefault:
                    !!editor.address && editor.address.id === defaultId,
                  onSaved: saveEdited,
                }}
              />
            ) : (
              <ChooseDeliveryAddress
                rows={addresses}
                selected={selected?.id}
                preferred={preferred?.id}
                profile={profile}
                busy={busy}
                loading={addressesLoading}
                error={
                  error ?? (!areaId ? "Choose a shopping area first" : null)
                }
                canDeliver={!!selected && !!areaId && !!bag.length}
                back={closePicker}
                select={(address) => {
                  setSelectedId(address.id);
                  setError(null);
                }}
                edit={(address) => setEditor({ address })}
                add={() => setEditor({})}
                confirm={() => void check()}
                reload={reload}
              />
            )}
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back from checkout"
          hitSlop={8}
          onPress={session ? openPicker : back}
          style={s.backButton}
        >
          <Text style={s.arrow}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={s.headerText}>
          Checkout
        </Text>
      </View>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.page}
        testID="checkout-scroll"
      >
        <Text accessibilityRole="header" style={s.title}>
          One last look.
        </Text>
        {!session ? (
          <Pressable
            accessibilityRole="button"
            onPress={account}
            style={[s.button, s.primary]}
          >
            <Text style={s.primaryText}>Sign in to continue</Text>
          </Pressable>
        ) : (
          <>
            <Text style={s.section}>1 DELIVERY ADDRESS</Text>
            {reviewedAddress && (
              <View style={s.card}>
                <Text style={s.choice}>◉ {reviewedAddress.label}</Text>
                {contact && <Text style={s.contact}>{contact}</Text>}
                <Text style={s.copy}>
                  {reviewedAddress.line1}
                  {"\n"}
                  {reviewedAddress.locality}, {reviewedAddress.city} ·{" "}
                  {reviewedAddress.pincode}
                </Text>
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={openPicker}
              style={s.button}
            >
              <Text style={s.action}>Change address</Text>
            </Pressable>
            {review && (
              <>
                <Text style={s.section}>2 SHOP-WISE DELIVERY</Text>
                <View style={s.card}>
                  {shopIds.map((id, index) => {
                    const group = review.shops.find(
                      (row) => row.shop.id === id,
                    );
                    const delivery = review.fulfilments.find(
                      (row) => row.shopId === id,
                    );
                    const count = shopCounts.get(id) ?? 0;
                    const available =
                      !!group &&
                      !group.issues.length &&
                      delivery?.listedFee != null &&
                      !delivery.issues.length;
                    const messages = [
                      ...new Set(
                        [
                          ...(group?.issues ?? []),
                          ...(delivery?.issues ?? []),
                        ].map((issue) => issue.message),
                      ),
                    ];
                    const name =
                      group?.shop.name ??
                      shops.find((shop) => shop.id === id)?.name ??
                      "Local shop";
                    return (
                      <View key={id} style={index > 0 && s.shopSpacing}>
                        <Text style={s.shopTitle}>{name}</Text>
                        <Text style={[s.delivery, !available && s.error]}>
                          {count} {count === 1 ? "item" : "items"} · Rider
                          delivery{" "}
                          {available
                            ? `available · Fee ${money(delivery.listedFee!)}`
                            : "unavailable"}
                        </Text>
                        {messages.map((message) => (
                          <Text key={message} style={s.error}>
                            {message}
                          </Text>
                        ))}
                      </View>
                    );
                  })}
                  <Text style={s.note}>
                    Fees are based on the current delivery quote.
                  </Text>
                </View>
                <Text style={s.section}>3 PAYMENT METHOD</Text>
                <View style={s.card}>
                  {hasCod ? (
                    <Text
                      accessibilityRole="radio"
                      aria-checked={true}
                      accessibilityState={{ checked: true }}
                      style={s.choice}
                    >
                      ◉ Cash on Delivery
                    </Text>
                  ) : (
                    <Text style={s.error}>
                      Cash on Delivery is unavailable for this checkout.
                    </Text>
                  )}
                </View>
                {[...new Set(issues.map((issue) => issue.message))].map(
                  (message) => (
                    <Text key={message} style={s.error}>
                      {message}
                    </Text>
                  ),
                )}
                <View style={s.card}>
                  <Text style={s.shopTitle}>Order summary</Text>
                  <Text style={s.copy}>
                    Items: {money(review.itemsSubtotal)}
                  </Text>
                  <Text style={s.copy}>
                    Delivery:{" "}
                    {review.deliveryTotal === null
                      ? "Unavailable"
                      : money(review.deliveryTotal)}
                  </Text>
                  {total !== null && (
                    <Text style={s.contact}>Total: {money(total)}</Text>
                  )}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
      {session && review && (
        <View style={s.footer} testID="checkout-footer">
          {review.checkoutAvailable &&
          !issues.length &&
          hasDelivery &&
          hasCod &&
          total !== null &&
          areaId &&
          reviewedAddress ? (
            <>
              <Text style={s.paymentSummary}>
                Cash on Delivery · {money(total)} due at delivery
              </Text>
              <PlaceCodOrder
                key={`${reviewedAddress.id}:${reviewedAddress.version}:${total}`}
                session={session}
                areaId={areaId}
                address={reviewedAddress}
                total={total}
                items={bag.map((line) => ({
                  productId: line.productId ?? line.id,
                  variantId: line.variantId,
                  qty: line.quantity,
                }))}
                shopIds={shopIds}
                onConfirmed={onConfirmed}
              />
            </>
          ) : (
            <>
              <Text style={s.error}>
                Review delivery and payment availability before placing your
                order.
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled
                style={[s.button, s.primary, s.disabled]}
              >
                <Text style={s.primaryText}>Place Order</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const green = "#07552F";
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FAF8F1" },
  header: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  backButton: { minHeight: 44, justifyContent: "center" },
  arrow: { color: green, fontSize: 27, lineHeight: 30 },
  headerText: { color: green, fontSize: 21, fontWeight: "600" },
  scroll: { flex: 1 },
  page: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 20 },
  title: { fontSize: 26, lineHeight: 36, color: "#252D25", fontWeight: "600" },
  section: {
    fontSize: 11,
    lineHeight: 15,
    color: "#73796E",
    fontWeight: "700",
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E0E3D8",
    backgroundColor: "#fff",
  },
  choice: { color: green, fontSize: 16, fontWeight: "600", lineHeight: 22 },
  contact: {
    fontSize: 13,
    lineHeight: 18,
    color: "#252D25",
    marginTop: 10,
    fontWeight: "600",
  },
  copy: { fontSize: 13, lineHeight: 18, color: "#73796E", marginTop: 9 },
  button: {
    minHeight: 50,
    padding: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  action: { color: green, fontSize: 15, fontWeight: "600" },
  primary: { backgroundColor: green },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  shopTitle: {
    color: "#252D25",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  delivery: { color: green, fontSize: 12, lineHeight: 17, marginTop: 9 },
  shopSpacing: { marginTop: 9 },
  note: { color: "#73796E", fontSize: 10, lineHeight: 14, marginTop: 10 },
  footer: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 8,
  },
  paymentSummary: {
    color: green,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  error: { color: "#A23425", fontSize: 13, lineHeight: 18 },
});
