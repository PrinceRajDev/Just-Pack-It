import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { marketApi, type Category, type Product, type Shop } from "./api";
import { resolveImage } from "./images";
import { MarketIcon } from "./MarketIcon";
import * as storage from "./deviceStorage";

type Line = Product & { quantity: number };
type Sort =
  "Recommended" | "Price: low to high" | "Price: high to low" | "Name";
type ShopInfo = Shop & { scheduleLabel?: string; ratingCount?: number };
export function BuyerShopPage({
  shop,
  categories,
  bag,
  userId,
  onBack,
  onBag,
  renderProduct,
}: {
  shop: Shop;
  categories: Category[];
  bag: Line[];
  userId?: string;
  onBack: () => void;
  onBag: () => void;
  renderProduct: (item: Product, cardWidth: number) => ReactNode;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = (Math.min(width, 600) - 52) / 2;
  const [catalogue, setCatalogue] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState<Sort>("Recommended");
  const [stockOnly, setStockOnly] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const favouriteKey = `jpi.favourite.shop.${userId ?? "guest"}.${shop.id}`;
  useEffect(() => {
    let active = true;
    void storage
      .getItemAsync(favouriteKey)
      .then((value) => {
        if (active) setSaved(value === "true");
      })
      .catch(() => {
        if (active) {
          setSaved(false);
          setSaveError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [favouriteKey]);
  const toggleFavourite = async () => {
    if (saved === null || saveBusy) return;
    setSaveBusy(true);
    setSaveError(false);
    try {
      await storage.setItemAsync(favouriteKey, String(!saved));
      setSaved(!saved);
    } catch {
      setSaveError(true);
    } finally {
      setSaveBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    void (async () => {
      const items: Product[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await marketApi.shopPage(shop.id, cursor);
        if (!active) return;
        items.push(
          ...page.items.filter(
            (item) => !items.some((old) => old.id === item.id),
          ),
        );
        if (!page.cursor) break;
        if (seen.has(page.cursor))
          throw new Error(
            "The shop catalogue could not finish loading. Please retry.",
          );
        seen.add(page.cursor);
        cursor = page.cursor;
      } while (active);
      if (active) {
        setCatalogue(items);
        setError(null);
      }
    })().catch((reason) => {
      if (active)
        setError(
          reason instanceof Error ? reason.message : "Products could not load.",
        );
    });
    return () => {
      active = false;
    };
  }, [shop.id, attempt]);
  const filters = useMemo(() => {
    const slugs = [
      ...new Set(catalogue?.map((item) => item.categorySlug).filter(Boolean)),
    ];
    return [
      { id: "All", name: "All" },
      ...slugs.map((slug) => ({
        id: slug!,
        name:
          categories.find((category) => category.slug === slug)?.name ?? slug!,
      })),
    ];
  }, [catalogue, categories]);
  const products = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    const items = (catalogue ?? []).filter(
      (item) =>
        (filter === "All" || item.categorySlug === filter) &&
        (!stockOnly || item.stock > 0) &&
        (!text ||
          `${item.name} ${item.description ?? ""} ${item.unit}`
            .toLocaleLowerCase()
            .includes(text)),
    );
    if (sort === "Price: low to high") items.sort((a, b) => a.price - b.price);
    if (sort === "Price: high to low") items.sort((a, b) => b.price - a.price);
    if (sort === "Name") items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }, [catalogue, query, filter, stockOnly, sort]);
  const count = bag.reduce((sum, line) => sum + line.quantity, 0);
  const total = bag.reduce((sum, line) => sum + line.quantity * line.price, 0);
  const shopCount = new Set(bag.map((line) => line.shopId)).size;
  const info = shop as ShopInfo;
  const shopCategory = categories.find((category) =>
    shop.categories?.includes(category.slug),
  )?.name;
  const availability =
    info.scheduleLabel || (shop.isOpen ? "Open now" : "Currently closed");
  return (
    <View style={s.page}>
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={s.row}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
        ListHeaderComponent={
          <>
            <View style={s.cover}>
              {resolveImage(shop.coverImage) && !coverFailed ? (
                <Image
                  source={{ uri: resolveImage(shop.coverImage) }}
                  style={s.coverImage}
                  onError={() => setCoverFailed(true)}
                />
              ) : (
                <View style={s.coverFallback}>
                  <MarketIcon name="home" />
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back from shop"
                onPress={onBack}
                style={[s.circle, { left: 20 }]}
              >
                <Text style={s.back}>‹</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  saved
                    ? "Remove shop from favourites"
                    : "Save shop to favourites"
                }
                accessibilityState={{
                  selected: !!saved,
                  disabled: saved === null || saveBusy,
                }}
                disabled={saved === null || saveBusy}
                onPress={() => void toggleFavourite()}
                style={[s.circle, { right: 20 }]}
              >
                <Text style={s.heart}>{saved ? "♥" : "♡"}</Text>
              </Pressable>
            </View>
            <View testID="shop-info" style={s.info}>
              <Text numberOfLines={1} style={s.eyebrow}>
                {shopCategory
                  ? `YOUR NEIGHBOURHOOD ${shopCategory.toUpperCase()}`
                  : "YOUR NEIGHBOURHOOD SHOP"}
              </Text>
              <Text numberOfLines={2} style={s.name}>
                {shop.name}
              </Text>
              <Text numberOfLines={1} style={s.description}>
                {shop.tagline ||
                  shop.description ||
                  shopCategory ||
                  shop.locality}
              </Text>
              <Text numberOfLines={1} style={s.metadata}>
                {typeof shop.rating === "number"
                  ? `☆  ${shop.rating.toFixed(1)}${typeof info.ratingCount === "number" ? ` (${info.ratingCount})` : ""}  ·  `
                  : ""}
                {typeof shop.distanceKm === "number"
                  ? `${shop.distanceKm.toFixed(1)} km  ·  `
                  : ""}
                {availability}
              </Text>
              {saveError ? (
                <Text style={s.error}>
                  Favourite could not be saved. Tap the heart to retry.
                </Text>
              ) : null}
            </View>
            <View style={s.search}>
              <View style={{ transform: [{ scale: 0.75 }] }}>
                <MarketIcon name="search" />
              </View>
              <TextInput
                accessibilityLabel="Search this shop"
                value={query}
                onChangeText={setQuery}
                placeholder="Search this shop"
                placeholderTextColor="#737B6D"
                style={s.input}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.filters}
            >
              {filters.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="tab"
                  aria-selected={filter === item.id}
                  accessibilityState={{ selected: filter === item.id }}
                  onPress={() => setFilter(item.id)}
                  style={[s.pill, filter === item.id && s.activePill]}
                >
                  <Text
                    style={[
                      s.pillText,
                      filter === item.id && { color: "#fff" },
                    ]}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={s.section}>
              <Text style={s.heading}>Fresh picks for today</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sort and filter products"
                onPress={() => setSortOpen(true)}
                style={{ padding: 4 }}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    justifyContent: "space-between",
                    paddingVertical: 2,
                  }}
                >
                  {[3, 11, 6].map((left, index) => (
                    <View
                      key={index}
                      style={{
                        height: 2,
                        width: 18,
                        backgroundColor: "#07552F",
                      }}
                    >
                      <View
                        style={{
                          position: "absolute",
                          left,
                          top: -2,
                          width: 5,
                          height: 6,
                          borderRadius: 2,
                          borderWidth: 1.5,
                          borderColor: "#07552F",
                          backgroundColor: "#FAF8F1",
                        }}
                      />
                    </View>
                  ))}
                </View>
              </Pressable>
            </View>
          </>
        }
        renderItem={({ item }) => renderProduct(item, cardWidth)}
        ListEmptyComponent={
          error ? (
            <View style={s.empty}>
              <Text style={s.emptyText}>{error}</Text>
              <Pressable
                onPress={() => {
                  setError(null);
                  setCatalogue(null);
                  setAttempt((value) => value + 1);
                }}
              >
                <Text style={s.retry}>Try again</Text>
              </Pressable>
            </View>
          ) : catalogue === null ? (
            <ActivityIndicator color="#07552F" style={{ marginTop: 24 }} />
          ) : (
            <View style={s.empty}>
              <Text style={s.emptyText}>
                {query || filter !== "All" || stockOnly
                  ? "No products match these filters."
                  : "This shop has no active products right now."}
              </Text>
            </View>
          )
        }
      />
      {count > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View shop bag"
          onPress={onBag}
          testID="shop-cart"
          style={s.cart}
        >
          <View>
            <Text style={s.cartTotal}>
              {count} {count === 1 ? "item" : "items"} · ₹
              {total.toLocaleString("en-IN")}
            </Text>
            <Text style={s.cartCopy}>
              From {shopCount} neighbourhood{" "}
              {shopCount === 1 ? "shop" : "shops"}
            </Text>
          </View>
          <Text style={s.cartAction}>View bag →</Text>
        </Pressable>
      ) : null}
      <Modal
        visible={sortOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSortOpen(false)}
      >
        <Pressable style={s.backdrop} onPress={() => setSortOpen(false)}>
          <SafeAreaView edges={["bottom"]} style={s.sheet}>
            <Pressable onPress={(event) => event.stopPropagation()}>
              <Text style={s.heading}>Sort & filter</Text>
              {(
                [
                  "Recommended",
                  "Price: low to high",
                  "Price: high to low",
                  "Name",
                ] as Sort[]
              ).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sort === value }}
                  onPress={() => setSort(value)}
                  style={s.option}
                >
                  <Text style={s.optionText}>{value}</Text>
                  <Text style={s.retry}>{sort === value ? "✓" : ""}</Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: stockOnly }}
                onPress={() => setStockOnly(!stockOnly)}
                style={s.option}
              >
                <Text style={s.optionText}>In stock only</Text>
                <Text style={s.retry}>{stockOnly ? "✓" : ""}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSortOpen(false)}
                style={s.apply}
              >
                <Text style={s.applyText}>Show products</Text>
              </Pressable>
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FAF8F1" },
  content: {
    paddingBottom: 12,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  cover: {
    height: 156,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
    backgroundColor: "#EAF0D9",
  },
  coverImage: { width: "100%", height: "100%", resizeMode: "cover" },
  coverFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  circle: {
    position: "absolute",
    top: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  back: { fontSize: 32, lineHeight: 34, color: "#07552F" },
  heart: { fontSize: 26, lineHeight: 30, color: "#07552F" },
  info: {
    marginHorizontal: 20,
    marginTop: -24,
    minHeight: 120,
    padding: 16,
    paddingTop: 12,
    borderRadius: 16,
    backgroundColor: "#fff",
  },
  eyebrow: { color: "#07552F", fontSize: 7, lineHeight: 10, fontWeight: "600" },
  name: {
    color: "#07552F",
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "700",
    marginTop: 3,
  },
  description: { fontSize: 11, lineHeight: 16, color: "#737B6D", marginTop: 4 },
  metadata: { fontSize: 10, lineHeight: 16, color: "#07552F", marginTop: 5 },
  error: { fontSize: 10, color: "#A33B28", marginTop: 4 },
  search: {
    height: 42,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 13,
    backgroundColor: "#EAF0D9",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    padding: 0,
    fontSize: 12,
    color: "#202820",
  },
  filters: { paddingHorizontal: 20, gap: 8, marginTop: 12 },
  pill: {
    height: 30,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: "#fff",
    justifyContent: "center",
  },
  activePill: { backgroundColor: "#07552F" },
  pillText: { fontSize: 10, color: "#737B6D" },
  section: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 12,
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "600",
    color: "#202820",
  },
  sortIcon: { color: "#07552F", fontSize: 23, lineHeight: 24 },
  row: {
    marginHorizontal: 20,
    justifyContent: "space-between",
    marginBottom: 12,
  },
  empty: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 14,
    backgroundColor: "#fff",
  },
  emptyText: { fontSize: 13, lineHeight: 20, color: "#737B6D" },
  retry: {
    color: "#07552F",
    fontSize: 13,
    fontWeight: "600",
    paddingVertical: 6,
  },
  cart: {
    marginHorizontal: 20,
    marginTop: 0,
    marginBottom: 2,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#07552F",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cartTotal: { fontSize: 14, lineHeight: 18, color: "#fff", fontWeight: "600" },
  cartCopy: { fontSize: 10, lineHeight: 14, color: "#EAF0D9", marginTop: 2 },
  cartAction: { fontSize: 12, color: "#fff", fontWeight: "600" },
  backdrop: { flex: 1, backgroundColor: "#0005", justifyContent: "flex-end" },
  sheet: {
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: "#FAF8F1",
  },
  option: {
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optionText: { fontSize: 14, color: "#202820" },
  apply: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#07552F",
    alignItems: "center",
    marginTop: 12,
  },
  applyText: { fontSize: 14, color: "#fff", fontWeight: "600" },
});
