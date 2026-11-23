import { theme, themedStyles } from "./theme";
import { BuyerStateCard, BuyerStateSkeleton } from "./BuyerStateCard";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
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
type ShopInfo = Shop & {
  scheduleLabel?: string;
  ratingCount?: number;
  address?: string;
};
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
      ...slugs
        .sort((a, b) => {
          const rank = (slug?: string) =>
            slug === "grocery-kirana"
              ? 0
              : slug === "fruits-vegetables"
                ? 1
                : 2;
          return rank(a) - rank(b);
        })
        .map((slug) => ({
          id: slug!,
          name:
            slug === "grocery-kirana"
              ? "Groceries"
              : slug === "fruits-vegetables"
                ? "Produce"
                : (categories.find((category) => category.slug === slug)
                    ?.name ?? slug!),
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

  const info = shop as ShopInfo;
  const shopCategory = categories.find((category) =>
    shop.categories?.includes(category.slug),
  )?.name;
  const availability = [
    shop.isOpen ? "Open" : "Closed",
    info.scheduleLabel?.split(" · ")[0],
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={s.page}>
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back from shop"
          onPress={onBack}
          style={s.headerButton}
        >
          <Text style={s.back}>‹</Text>
        </Pressable>
        <Text numberOfLines={1} style={s.headerTitle}>
          {shop.name}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            saved ? "Remove shop from favourites" : "Save shop to favourites"
          }
          accessibilityState={{
            selected: !!saved,
            disabled: saved === null || saveBusy,
          }}
          disabled={saved === null || saveBusy}
          onPress={() => void toggleFavourite()}
          style={s.headerButton}
        >
          <Text style={s.heart}>{saved ? "♥" : "♡"}</Text>
        </Pressable>
      </View>

      <FlatList
        testID="shop-catalogue"
        data={products}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={s.row}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
        ListHeaderComponent={
          <>
            {!shop.isOpen && <View style={{margin:20}}><BuyerStateCard title="Closed for now" copy={`${shop.name} is currently closed. Ordering is unavailable while the shop is closed.`} tone="warning" icon="clock" compact /></View>}
            <View style={s.cover}>
              {resolveImage(shop.coverImage) && !coverFailed ? (
                <Image
                  source={{ uri: resolveImage(shop.coverImage) }}
                  style={s.coverImage}
                  onError={() => setCoverFailed(true)}
                />
              ) : (
                <View style={s.coverFallback}>
                  <Text style={s.emptyText}>Shop photo unavailable</Text>
                </View>
              )}
            </View>
            <View testID="shop-info" style={s.info}>
              <Text numberOfLines={2} style={s.name}>
                {shop.name}
              </Text>
              <Text numberOfLines={1} style={s.description}>
                {shop.tagline ||
                  shop.description ||
                  shopCategory ||
                  shop.locality}
              </Text>
              <Text style={s.metadata}>
                {[
                  availability,
                  typeof shop.distanceKm === "number"
                    ? `${shop.distanceKm.toFixed(1)} km`
                    : null,
                ]
                  .filter(Boolean)
                  .join("  |  ")}
                {typeof shop.rating === "number" && Number.isFinite(shop.rating) ? (
                  <Text style={{ color: theme.successInk }}>
                    {"  |  "}★ {shop.rating.toFixed(1)}
                    {typeof info.ratingCount === "number" ? ` (${info.ratingCount})` : ""}
                  </Text>
                ) : null}
              </Text>
              {info.address || shop.locality ? (
                <Text style={s.address}>{info.address || shop.locality}</Text>
              ) : null}
              {saveError ? (
                <Text style={s.error}>
                  Favourite could not be saved. Tap the heart to retry.
                </Text>
              ) : null}
            </View>
            <View style={s.search}>
              <View style={{ transform: [{ scale: 0.75 }] }}>
                <MarketIcon name="search" color={theme.muted} />
              </View>
              <TextInput
                accessibilityLabel="Search this shop"
                value={query}
                onChangeText={setQuery}
                placeholder="Search this shop"
                placeholderTextColor={theme.muted}
                style={s.input}
                returnKeyType="search"
                clearButtonMode="never"
              />
              {query ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear shop search"
                  hitSlop={8}
                  onPress={() => setQuery("")}
                >
                  <Text style={s.clearSearch}>×</Text>
                </Pressable>
              ) : null}
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
                  style={[
                    s.pill,
                    { width: (Math.min(width, 600) - 56) / 3 },
                    filter === item.id && s.activePill,
                  ]}
                >
                  <Text
                    style={[
                      s.pillText,
                      filter === item.id && { fontWeight: "700" },
                    ]}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={s.section}>
              <Text style={s.heading}>All products</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sort and filter products"
                onPress={() => setSortOpen(true)}
                style={{ padding: 4 }}
              >
                <Text style={s.sortIcon}>Sort ⌄</Text>
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
            <BuyerStateSkeleton />
          ) : (
            <View style={{paddingHorizontal:20}}>
              {query || filter !== "All" || stockOnly
                ? <BuyerStateCard title="No products match these filters." icon="search" />
                : <BuyerStateCard title="The shelves are being stocked." copy={`${shop.name} hasn’t listed any products yet. Explore other nearby shops.`} icon="shop" action="Browse nearby shops" onAction={onBack} />}
            </View>
          )
        }
      />
      {count > 0 ? (
        <View style={s.cartShell}>
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
            </View>
            <Text style={s.cartAction}>View Bag →</Text>
          </Pressable>
        </View>
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
                  <Text style={s.optionText}>
                    {value === "Recommended"
                      ? "Popular"
                      : value === "Name"
                        ? "Name: A to Z"
                        : value}
                  </Text>
                  <Text style={s.retry}>{sort === value ? "✓" : ""}</Text>
                </Pressable>
              ))}
              <Text style={s.emptyText}>
                Newest is unavailable for this catalogue.
              </Text>
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
const s = themedStyles(() => StyleSheet.create({
  clearSearch: { fontSize: 18, color: theme.muted },
  header: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 6,
  },
  headerTitle: { flex: 1, fontSize: 21, fontWeight: "600", color: theme.accentInk },
  headerButton: {
    minWidth: 28,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  address: { fontSize: 12, lineHeight: 17, color: theme.muted, marginTop: 6 },
  cartShell: {
    backgroundColor: theme.surface,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  page: { flex: 1, backgroundColor: theme.canvas },
  content: {
    paddingBottom: 12,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  cover: {
    height: 176,

    overflow: "hidden",
    backgroundColor: theme.selected,
  },
  coverImage: { width: "100%", height: "100%", resizeMode: "cover" },
  coverFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  circle: {
    position: "absolute",
    top: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  back: { fontSize: 32, lineHeight: 34, color: theme.accentInk },
  heart: { fontSize: 26, lineHeight: 30, color: theme.accentInk },
  info: {
    marginHorizontal: 20,
    marginTop: -32,
    minHeight: 144,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    paddingTop: 16,
    borderRadius: 16,
    backgroundColor: theme.surface,
  },
  eyebrow: { color: theme.accentInk, fontSize: 7, lineHeight: 10, fontWeight: "600" },
  name: {
    color: theme.ink,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "700",
    marginTop: 3,
  },
  description: { fontSize: 13, lineHeight: 18, color: theme.muted, marginTop: 8 },
  metadata: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.accentInk,
    marginTop: 8,
    fontWeight: "600",
  },
  error: { fontSize: 10, color: theme.error, marginTop: 4 },
  search: {
    height: 48,
    marginHorizontal: 20,
    marginTop: 58,
    borderRadius: 12,
    backgroundColor: theme.surface,
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
    color: theme.ink,
  },
  filters: { paddingHorizontal: 20, gap: 8, marginTop: 16 },
  pill: {
    height: 36,
    paddingHorizontal: 6,
    borderRadius: 18,
    backgroundColor: theme.selected,
    alignItems: "center",
    justifyContent: "center",
  },
  activePill: { backgroundColor: theme.selected },
  pillText: {
    fontSize: 12,
    color: theme.accentInk,
    fontWeight: "600",
    textAlign: "center",
  },
  section: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 17,
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
    color: theme.ink,
  },
  sortIcon: { color: theme.accentInk, fontSize: 12, fontWeight: "600" },
  row: {
    marginHorizontal: 20,
    justifyContent: "space-between",
    marginBottom: 12,
  },
  empty: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 14,
    backgroundColor: theme.surface,
  },
  emptyText: { fontSize: 13, lineHeight: 20, color: theme.muted },
  retry: {
    color: theme.accentInk,
    fontSize: 13,
    fontWeight: "600",
    paddingVertical: 6,
  },
  cart: {
    minHeight: 50,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: theme.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    gap: 12,
  },
  cartTotal: { fontSize: 14, lineHeight: 18, color: theme.onPrimary, fontWeight: "600" },
  cartCopy: { fontSize: 10, lineHeight: 14, color: theme.onPrimary, marginTop: 2 },
  cartAction: { fontSize: 14, color: theme.onPrimary, fontWeight: "600" },
  backdrop: { flex: 1, backgroundColor: theme.overlay, justifyContent: "flex-end" },
  sheet: {
    borderTopWidth: 1,
    borderColor: theme.border,
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: theme.canvas,
  },
  option: {
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optionText: { fontSize: 14, color: theme.ink },
  apply: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: theme.primary,
    alignItems: "center",
    marginTop: 12,
  },
  applyText: { fontSize: 14, color: theme.onPrimary, fontWeight: "600" },
}));
