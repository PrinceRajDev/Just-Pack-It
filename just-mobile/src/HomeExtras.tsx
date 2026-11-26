import { theme } from "./theme";
import { BuyerStateCard } from "./BuyerStateCard";
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
import { resolveImage } from "./images";
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
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.canvas }}>
          <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={{ color: theme.accentInk, paddingVertical: 12 }}>
                ← Home
              </Text>
            </Pressable>
            <Text style={{ fontSize: 26, color: theme.ink }}>
              Notifications
            </Text>
            {!session ? (
              <Text>Sign in from Account to see your updates.</Text>
            ) : busy ? (
              <ActivityIndicator color={theme.accentInk} />
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
                    backgroundColor: theme.surface,
                    borderWidth: 1,
                    borderColor: theme.surfaceSoft,
                  }}
                >
                  <Text style={{ fontWeight: "600", color: theme.ink }}>
                    {item.title}
                  </Text>
                  <Text
                    style={{ marginTop: 8, color: theme.secondary, lineHeight: 21 }}
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
  onAdd,
  onAccount,
  onBrowseAlternatives,
}: {
  session: Session | null;
  renderProduct: (product: Product) => ReactNode;
  onAdd: (product: Product) => void;
  onAccount: () => void;
  onBrowseAlternatives: (query: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
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
        if (!active) return;
        const available = resolved.flatMap((result, index) => {
          if (result.status !== "fulfilled") return [];
          const product = result.value;
          if (
            product?.id !== ids[index] ||
            typeof product.name !== "string" ||
            typeof product.unit !== "string" ||
            typeof product.shopId !== "string" ||
            !Number.isFinite(product.price) ||
            !Number.isFinite(product.stock)
          ) return [];
          return [product];
        });
        setProducts(available);
        setFailed(ids.length > 0 && available.length === 0);
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
  const product = products.find(item => item.stock > 0 || item.variants?.some(variant => variant.stock > 0)) ?? products[0];
  const unavailable = products.find(item => item.stock <= 0 && !item.variants?.some(variant => variant.stock > 0));
  return (
    <View
      style={{
        margin: 20,
        marginTop: 28,
        padding: 14,
        minHeight: 128,
        borderRadius: 16,
        backgroundColor: theme.selected,
      }}
    >
      {unavailable && <View style={{marginBottom:16}}><BuyerStateCard title="Some favourites are unavailable" copy={`${unavailable.name} is out of stock. Explore similar items nearby.`} tone="warning" icon="shop" compact action="Browse alternatives" onAction={() => onBrowseAlternatives(unavailable.name)} /></View>}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <MarketIcon name="bag" />
        <Text
          style={{ fontSize: 18, fontWeight: "600", color: theme.accentInk, flex: 1 }}
        >
          Buy Again
        </Text>
        <Pressable
          onPress={() => (session ? setExpanded(!expanded) : onAccount())}
          accessibilityLabel="Show recent purchases"
        >
          <Text style={{ fontSize: 20, color: theme.accentInk }}>→</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 11, color: theme.muted, marginTop: 6 }}>
        Your favourites, one tap away
      </Text>
      {!session ? (
        <Pressable onPress={onAccount}>
          <Text style={{ fontSize: 12, color: theme.accentInk, marginTop: 16 }}>
            Sign in to see your purchases →
          </Text>
        </Pressable>
      ) : !done ? (
        <ActivityIndicator color={theme.accentInk} style={{ marginTop: 16 }} />
      ) : product ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginTop: 16,
          }}
        >
          <Image
            source={{ uri: resolveImage(product.image) }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              backgroundColor: theme.canvas,
            }}
          />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "600" }}>
              {product.name}
            </Text>
            <Text style={{ fontSize: 10, color: theme.muted, marginTop: 4 }}>
              {product.unit}
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: theme.accentInk, fontWeight: "600" }}>
            ₹{product.price.toLocaleString("en-IN")}
          </Text>
          <Pressable
            disabled={product.stock <= 0}
            onPress={() =>
              product.variants?.length ? setExpanded(true) : onAdd(product)
            }
            style={{ padding: 8 }}
          >
            <Text style={{ fontSize: 11, color: theme.accentInk, fontWeight: "600" }}>
              {product.stock <= 0 ? "Out" : "+ Add"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text
          style={{
            fontSize: 12,
            lineHeight: 18,
            color: theme.muted,
            marginTop: 16,
          }}
        >
          {failed
            ? "Purchase history could not load"
            : "Your purchases will appear here"}
        </Text>
      )}
      {expanded
        ? products.map((item) => (
            <View key={item.id} style={{ marginTop: 12 }}>
              {renderProduct(item)}
            </View>
          ))
        : null}
    </View>
  );
}
