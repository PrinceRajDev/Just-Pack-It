import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { buyerApi, marketApi, type Product, type Session } from "./api";
import { MarketIcon } from "./MarketIcon";
export function HomeNotifications({ session }: { session: Session | null }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<
    { id: string; title: string; body: string; read: boolean }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const load = async () => {
    setOpen(true);
    if (!session) return;
    setBusy(true);
    setError(false);
    try {
      setItems(await buyerApi.notifications(session.token));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Pressable
        accessibilityLabel="Notifications"
        onPress={() => void load()}
        style={{ padding: 12 }}
      >
        <MarketIcon name="bell" />
      </Pressable>
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FAF8F1" }}>
          <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={{ color: "#07552F", paddingVertical: 12 }}>
                ← Home
              </Text>
            </Pressable>
            <Text style={{ fontSize: 26, color: "#202820" }}>
              Notifications
            </Text>
            {!session ? (
              <Text>Sign in from Account to see your updates.</Text>
            ) : busy ? (
              <ActivityIndicator color="#07552F" />
            ) : error ? (
              <Pressable onPress={() => void load()}>
                <Text>Could not load updates. Tap to retry.</Text>
              </Pressable>
            ) : items.length ? (
              items.map((item) => (
                <View
                  key={item.id}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    backgroundColor: "#fff",
                    borderWidth: 1,
                    borderColor: "#E5E2D8",
                  }}
                >
                  <Text style={{ fontWeight: "600", color: "#202820" }}>
                    {item.title}
                  </Text>
                  <Text
                    style={{ marginTop: 8, color: "#5E554A", lineHeight: 21 }}
                  >
                    {item.body}
                  </Text>
                </View>
              ))
            ) : (
              <Text>No notifications yet</Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
export function BuyAgain({
  session,
  renderProduct,
  onAccount,
}: {
  session: Session | null;
  renderProduct: (product: Product) => ReactNode;
  onAccount: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!session) return;
    let active = true;
    void buyerApi
      .orders(session.token)
      .then(async (orders) => {
        const ids = [
          ...new Set(
            orders.flatMap((order) =>
              order.subOrders
                .filter((shop) => shop.status !== "cancelled")
                .flatMap((shop) => shop.lines.map((line) => line.productId)),
            ),
          ),
        ].slice(0, 6);
        const resolved = await Promise.allSettled(
          ids.map((id) => marketApi.product(id)),
        );
        if (active)
          setProducts(
            resolved.flatMap((result) =>
              result.status === "fulfilled" ? [result.value] : [],
            ),
          );
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setDone(true);
      });
    return () => {
      active = false;
    };
  }, [session]);
  return (
    <View
      style={{
        margin: 16,
        padding: 16,
        borderRadius: 20,
        backgroundColor: "#EAF0D9",
      }}
    >
      <View style={{ minHeight: 96, justifyContent: "center" }}><View style={{ width: "58%", zIndex: 1 }}><Text style={{ fontSize: 23, lineHeight: 27, fontWeight: "600", color: "#07552F" }}>Buy Again<Text style={{ color: "#202820" }}>{"\n"}in One Tap</Text></Text><Text style={{ marginTop: 8, color: "#202820", fontSize: 12 }}>Your frequently bought items</Text></View><Image source={require("../assets/buy-again-reference.png")} style={{ position: "absolute", right: -12, width: "52%", height: 120, resizeMode: "contain" }} /></View>
      {!session ? (
        <Pressable onPress={onAccount}>
          <Text
            style={{ paddingVertical: 16, color: "#07552F", fontWeight: "600" }}
          >
            Sign in to see your past purchases →
          </Text>
        </Pressable>
      ) : !done ? (
        <ActivityIndicator style={{ marginTop: 16 }} color="#07552F" />
      ) : products.length ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 16,
          }}
        >
          {products.map((product) => (
            <View key={product.id} style={{ width: "48%" }}>
              {renderProduct(product)}
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ marginTop: 16, color: "#5E554A", lineHeight: 20 }}>
          {failed
            ? "Purchase history could not load. Your orders are available from the Orders tab."
            : "Your recent purchases will appear here when they are available to buy again."}
        </Text>
      )}
    </View>
  );
}
