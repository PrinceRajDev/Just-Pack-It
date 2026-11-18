import { useEffect, useState } from "react";
import { PlaceCodOrder } from "./PlaceCodOrder";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  buyerApi,
  type Address,
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
  const [selected, setSelected] = useState<Address | null>(null);
  const [review, setReview] = useState<CheckoutReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;
    let active = true;
    void buyerApi
      .addresses(session.token)
      .then((items) => {
        if (active) setAddresses(items);
      })
      .catch(() => {
        if (active)
          setError("Saved addresses could not load. Reopen checkout to retry.");
      });
    return () => {
      active = false;
    };
  }, [session]);
  const check = async () => {
    if (!session || !selected || !areaId || busy) return;
    setBusy(true);
    setError(null);
    setReview(null);
    try {
      setReview(
        await buyerApi.reviewCheckout(
          session.token,
          areaId,
          selected,
          bag.map((line) => ({
            productId: line.productId ?? line.id,
            variantId: line.variantId,
            qty: line.quantity,
          })),
          [...new Set(bag.map((line) => line.shopId))],
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Delivery check failed",
      );
    } finally {
      setBusy(false);
    }
  };
  const issues = review
    ? [
        ...review.issues,
        ...review.lines.flatMap((line) => line.issues),
        ...review.shops.flatMap((shop) => shop.issues),
        ...review.fulfilments.flatMap((choice) => choice.issues),
      ]
    : [];
  return (
    <ScrollView contentContainerStyle={s.page}>
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
          <Text style={s.copy}>Choose a saved delivery address</Text>
          {addresses.map((address) => (
            <Pressable
              disabled={busy}
              key={address.id}
              style={[s.card, selected?.id === address.id && s.selected]}
              onPress={() => {
                setSelected(address);
                setReview(null);
                setError(null);
              }}
            >
              <Text style={s.name}>{address.label}</Text>
              <Text style={s.copy}>
                {address.line1}, {address.locality}, {address.city}{" "}
                {address.pincode}
              </Text>
            </Pressable>
          ))}
          {!addresses.length ? (
            <Pressable onPress={account}>
              <Text style={s.link}>Manage addresses in Account</Text>
            </Pressable>
          ) : null}
          <Text style={s.copy}>
            Rider collects from each shop and delivers to this address
          </Text>
          {!areaId ? (
            <Text style={s.error}>Choose a shopping area first</Text>
          ) : null}
          <Pressable
            disabled={!selected || !areaId || busy || !bag.length}
            onPress={() => void check()}
            style={[s.button, (!selected || busy) && { opacity: 0.5 }]}
          >
            <Text style={s.buttonText}>
              {busy ? "Checking delivery…" : "Check delivery and bill"}
            </Text>
          </Pressable>
          {busy ? <ActivityIndicator color="#174B34" /> : null}
          {error ? <Text style={s.error}>{error}</Text> : null}
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
              {review.checkoutAvailable && review.paymentMethods.includes("cod") && selected && areaId && review.grandTotal !== null ? <PlaceCodOrder onConfirmed={onConfirmed} key={`${selected.id}:${selected.version}:${review.grandTotal}`} session={session} areaId={areaId} address={selected} total={review.grandTotal} items={bag.map((line) => ({ productId: line.productId ?? line.id, variantId: line.variantId, qty: line.quantity }))} shopIds={[...new Set(bag.map((line) => line.shopId))]} /> : null}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
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
  selected: { borderColor: "#174B34", backgroundColor: "#EDF3DF" },
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
