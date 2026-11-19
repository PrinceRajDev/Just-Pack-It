import { useEffect, useRef, useState } from "react";
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
} from "./api";
export function BuyerCheckout({
  session,
  areaId,
  bag,
  back,
  account,
  onConfirmed,
}: {
  session: Session | null;
  areaId?: string;
  bag: (Product & { quantity: number })[];
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
  return (
    <ScrollView contentContainerStyle={s.page}>
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
      <Pressable onPress={back} disabled={busy}>
        <Text style={s.link}>← Bag</Text>
      </Pressable>
      <Text style={s.title}>Delivery and bill</Text>
      {!session ? (
        <Pressable onPress={account} style={s.button}>
          <Text style={s.buttonText}>Sign in to continue</Text>
        </Pressable>
      ) : (
        <>
          {selected && !choosing ? (
            <Text style={s.copy}>
              Delivery to {selected.label} · {selected.line1}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setError(null);
              setChoosing(true);
            }}
          >
            <Text style={s.link}>Change delivery address</Text>
          </Pressable>
          {review ? (
            <View style={s.card}>
              <Text style={s.name}>Order summary</Text>
              <Text style={s.copy}>
                Items: ₹{review.itemsSubtotal.toLocaleString("en-IN")}
              </Text>
              <Text style={s.copy}>
                Delivery:{" "}
                {review.deliveryTotal === null
                  ? "Unavailable"
                  : `₹${review.deliveryTotal}`}
              </Text>
              <Text style={s.name}>
                Total:{" "}
                {review.grandTotal === null
                  ? "Not available"
                  : `₹${review.grandTotal.toLocaleString("en-IN")}`}
              </Text>
              {review.shops.map(({ shop, issues: shopIssues }) => {
                const delivery = review.fulfilments.find(
                  (choice) => choice.shopId === shop.id,
                );
                const messages = [
                  ...new Set(
                    [...shopIssues, ...(delivery?.issues ?? [])].map(
                      (issue) => issue.message,
                    ),
                  ),
                ];
                return (
                  <View key={shop.id}>
                    <Text style={s.name}>{shop.name}</Text>
                    {delivery?.listedFee != null && (
                      <Text style={s.copy}>
                        Delivery: ₹{delivery.listedFee.toLocaleString("en-IN")}
                      </Text>
                    )}
                    {messages.map((message) => (
                      <Text key={message} style={s.error}>
                        {message}
                      </Text>
                    ))}
                  </View>
                );
              })}
              {[...new Set(issues.map((issue) => issue.message))].map(
                (message) => (
                  <Text key={message} style={s.error}>
                    {message}
                  </Text>
                ),
              )}
              {review.checkoutAvailable ? (
                <Text style={s.copy}>
                  Delivery is available. This check does not reserve stock.
                </Text>
              ) : null}
              {review.checkoutAvailable &&
              review.paymentMethods.includes("cod") &&
              selected &&
              areaId &&
              review.grandTotal !== null ? (
                <PlaceCodOrder
                  onConfirmed={onConfirmed}
                  key={`${selected.id}:${selected.version}:${review.grandTotal}`}
                  session={session}
                  areaId={areaId}
                  address={selected}
                  total={review.grandTotal}
                  items={bag.map((line) => ({
                    productId: line.productId ?? line.id,
                    variantId: line.variantId,
                    qty: line.quantity,
                  }))}
                  shopIds={[...new Set(bag.map((line) => line.shopId))]}
                />
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FAF8F1" },
  page: { padding: 24, paddingBottom: 120, gap: 16 },
  title: { fontSize: 26, color: "#1F2A22", fontWeight: "500" },
  link: {
    fontSize: 14,
    color: "#174B34",
    paddingVertical: 8,
    fontWeight: "600",
  },
  copy: { fontSize: 14, lineHeight: 21, color: "#5E554A", marginTop: 8 },
  name: { fontSize: 16, color: "#1F2A22", fontWeight: "600", marginTop: 8 },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DDD6C9",
    backgroundColor: "#FDFBF7",
  },
  button: {
    minHeight: 48,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#174B34",
  },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  error: { color: "#B3432B", fontSize: 14, lineHeight: 20 },
});
