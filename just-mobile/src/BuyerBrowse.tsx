import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { marketApi, type Category, type Product, type Shop } from "./api";
import { MarketIcon } from "./MarketIcon";
import { ReferenceArtwork } from "./ReferenceArtwork";
import { useAndroidBack } from "./useAndroidBack";

const cards = [
  {
    slug: "fruits-vegetables",
    name: "Vegetables & Fruits",
    copy: "Fresh from nearby",
  },
  {
    slug: "grocery-kirana",
    name: "Atta, Grains & Dal",
    copy: "Pantry, sorted",
  },
  { slug: "fashion", name: "Fashion", copy: "Made for every day" },
  { slug: "dairy-eggs", name: "Dairy & Eggs", copy: "Your morning staples" },
  {
    slug: "kitchen-home-goods",
    name: "Home & Living",
    copy: "Little home upgrades",
  },
  {
    slug: "fast-food-snacks",
    name: "Snacks & More",
    copy: "A little pick-me-up",
  },
];
type Tab = "Categories" | "Shops" | "Brands";
type Page = {
  key: string;
  products: Product[];
  shops: Shop[];
  productCursor: string | null;
  shopCursor: string | null;
};
type BrandProduct = Product & {
  brand?: string;
  attributes?: { label: string; value: string }[];
};
function brandName(product: Product): string | undefined {
  const item = product as BrandProduct;
  return (
    (
      item.brand ||
      item.attributes?.find((attribute) =>
        /^(brand|ब्रांड)$/i.test(attribute.label.trim()),
      )?.value
    )?.trim() || undefined
  );
}

export function BuyerBrowse({
  areaId,
  categories,
  query,
  setQuery,
  renderProduct,
  renderShop,
  hasBag,
}: {
  areaId?: string;
  categories: Category[];
  query: string;
  setQuery: (text: string) => void;
  renderProduct: (item: Product) => ReactNode;
  renderShop: (item: Shop) => ReactNode;
  hasBag: boolean;
}) {
  const [tab, setTab] = useState<Tab>("Categories");
  const [category, setCategory] = useState<(typeof cards)[number] | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [result, setResult] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const lock = useRef(false);
  const [catalogue, setCatalogue] = useState<{
    area: string;
    items: Product[];
  } | null>(null);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const search = query.trim();
  const key = `${areaId ?? ""}:${category?.slug ?? ""}:${search}`;
  const discovery = tab === "Categories" && !category && !search;
  const needsBrands = tab === "Brands" || !!search;
  const reset = () => {
    setCategory(null);
    setBrand(null);
    setQuery("");
  };
  useAndroidBack(() => {
    if (!category && !brand && !search && tab === "Categories") return false;
    reset();
    setTab("Categories");
    return true;
  });
  useEffect(() => {
    if (!areaId || discovery || tab === "Brands") return;
    let active = true;
    const timer = setTimeout(
      () => {
        setError(null);
        const request = category
          ? marketApi
              .categoryPage(areaId, category.slug, undefined, search)
              .then((page) => ({
                products: page.items,
                shops: [],
                productCursor: page.cursor,
                shopCursor: null,
              }))
          : marketApi.search(areaId, search);
        void request
          .then((page) => {
            if (active) setResult({ key, ...page });
          })
          .catch((reason) => {
            if (active)
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Results could not load.",
              );
          });
      },
      search ? 300 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [areaId, discovery, category, search, key, attempt, tab]);
  useEffect(() => {
    if (!areaId || !needsBrands) return;
    let active = true;
    void (async () => {
      const items: Product[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await marketApi.searchProducts(areaId, "", cursor);
        if (!active) return;
        setCatalogueError(null);
        items.push(
          ...page.items.filter(
            (item) => !items.some((old) => old.id === item.id),
          ),
        );
        if (!page.cursor) break;
        if (seen.has(page.cursor))
          throw new Error("More brands could not load. Please retry.");
        seen.add(page.cursor);
        cursor = page.cursor;
      } while (active);
      if (active) setCatalogue({ area: areaId, items });
    })().catch((reason) => {
      if (active)
        setCatalogueError(
          reason instanceof Error ? reason.message : "Brands could not load.",
        );
    });
    return () => {
      active = false;
    };
  }, [areaId, needsBrands, attempt]);
  const brandProducts =
    catalogue && catalogue.area === areaId ? catalogue.items : [];
  const brands = [
    ...new Set(
      brandProducts.map(brandName).filter((name): name is string => !!name),
    ),
  ].filter(
    (name) =>
      !search || name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const productItems = useMemo(() => {
    if (brand)
      return (
        catalogue && catalogue.area === areaId ? catalogue.items : []
      ).filter((item) => brandName(item) === brand);
    const matches = result?.key === key ? result.products : [];
    const brandMatches =
      !category && search && catalogue && catalogue.area === areaId
        ? catalogue.items.filter((item) =>
            brandName(item)
              ?.toLocaleLowerCase()
              .includes(search.toLocaleLowerCase()),
          )
        : [];
    return [
      ...matches,
      ...brandMatches.filter(
        (item) => !matches.some((old) => old.id === item.id),
      ),
    ];
  }, [brand, catalogue, areaId, result, key, category, search]);
  const pending = !areaId
    ? false
    : tab === "Brands"
      ? catalogue?.area !== areaId
      : result?.key !== key;
  const failure = tab === "Brands" ? catalogueError : error;
  const more = async (kind: "products" | "shops") => {
    if (!areaId || !result || result.key !== key || lock.current) return;
    const cursor =
      kind === "products" ? result.productCursor : result.shopCursor;
    if (!cursor) return;
    lock.current = true;
    setMoreBusy(true);
    setMoreError(false);
    try {
      const page =
        kind === "shops"
          ? await marketApi.searchShops(areaId, search, cursor)
          : category
            ? await marketApi.categoryPage(
                areaId,
                category.slug,
                cursor,
                search,
              )
            : await marketApi.searchProducts(areaId, search, cursor);
      setResult((old) => {
        if (old?.key !== key) return old;
        return kind === "products"
          ? {
              ...old,
              productCursor: page.cursor,
              products: [
                ...old.products,
                ...(page.items as Product[]).filter(
                  (item) =>
                    !old.products.some((existing) => existing.id === item.id),
                ),
              ],
            }
          : {
              ...old,
              shopCursor: page.cursor,
              shops: [
                ...old.shops,
                ...(page.items as Shop[]).filter(
                  (item) =>
                    !old.shops.some((existing) => existing.id === item.id),
                ),
              ],
            };
      });
    } catch {
      setMoreError(true);
    } finally {
      lock.current = false;
      setMoreBusy(false);
    }
  };
  const empty = (copy: string) => (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{copy}</Text>
    </View>
  );
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, hasBag && { paddingBottom: 96 }]}
    >
      <Text style={styles.heading}>Find your everyday.</Text>
      <Text style={styles.subtitle}>
        A whole neighbourhood of possibilities.
      </Text>
      <View style={styles.search}>
        <View style={{ transform: [{ scale: 0.8 }] }}>
          <MarketIcon name="search" />
        </View>
        <TextInput
          accessibilityLabel="Search products, shops and brands"
          value={query}
          onChangeText={setQuery}
          placeholder={'Try "cotton kurta" or "fresh milk"'}
          placeholderTextColor="#737B6D"
          style={styles.input}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {(["Categories", "Shops", "Brands"] as const).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="tab"
            aria-selected={tab === item}
            accessibilityState={{ selected: tab === item }}
            onPress={() => {
              setTab(item);
              setCategory(null);
              setBrand(null);
            }}
            style={[
              styles.tab,
              item === "Categories" && {
                width: 108,
                paddingHorizontal: 0,
                alignItems: "center",
              },
              tab === item && styles.activeTab,
            ]}
          >
            <Text style={[styles.tabText, tab === item && { color: "#fff" }]}>
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      {category || brand ? (
        <View style={styles.selection}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Browse categories"
            onPress={reset}
          >
            <Text style={styles.back}>←</Text>
          </Pressable>
          <Text style={styles.selectionTitle}>{category?.name ?? brand}</Text>
        </View>
      ) : null}
      {discovery ? (
        <>
          <View style={styles.grid}>
            {cards.map((item, index) => (
              <Pressable
                key={item.slug}
                accessibilityRole="button"
                accessibilityLabel={item.name}
                onPress={() => {
                  setCategory(item);
                  setBrand(null);
                  setQuery("");
                }}
                style={styles.card}
              >
                <ReferenceArtwork
                  source={require("../assets/browse-figma-artwork.png")}
                  sourceSize={[390, 844]}
                  crop={[
                    index % 2 === 0 ? 20 : 201,
                    228 + Math.floor(index / 2) * 142,
                    169,
                    82,
                  ]}
                  style={{ width: "100%" }}
                />
                <View style={styles.cardBody}>
                  <Text numberOfLines={1} style={styles.cardName}>
                    {item.name}
                  </Text>
                  <Text numberOfLines={1} style={styles.cardCopy}>
                    {item.copy}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Meet nearby shops"
            onPress={() => {
              reset();
              setTab("Shops");
            }}
            style={styles.promo}
          >
            <View>
              <Text style={styles.promoTitle}>
                Not just products.{"\n"}People you can trust.
              </Text>
              <Text style={styles.promoCopy}>
                Meet the shops around your corner
              </Text>
            </View>
            <Text style={styles.promoArrow}>→</Text>
          </Pressable>
        </>
      ) : !areaId ? (
        empty("Choose a delivery area from Home to browse nearby listings.")
      ) : category &&
        !categories.some((item) => item.slug === category.slug) ? (
        empty("This category is not available in your area yet.")
      ) : failure ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{failure}</Text>
          <Pressable
            onPress={() => {
              setError(null);
              setCatalogueError(null);
              setResult(null);
              setCatalogue(null);
              setAttempt((value) => value + 1);
            }}
          >
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      ) : pending ? (
        <ActivityIndicator style={{ marginTop: 36 }} color="#07552F" />
      ) : (
        <>
          {tab === "Brands" && !brand ? (
            brands.length ? (
              <View style={styles.grid}>
                {brands.map((name) => (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    onPress={() => setBrand(name)}
                    style={styles.brand}
                  >
                    <Text style={styles.brandName}>{name}</Text>
                    <Text style={styles.cardCopy}>View products →</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              empty("No brands have been added in this area yet.")
            )
          ) : null}
          {tab === "Shops" ? (
            <View style={{ gap: 12 }}>
              {result?.shops.length
                ? result.shops.map((item) => (
                    <View key={item.id}>{renderShop(item)}</View>
                  ))
                : empty("No matching shops in this area.")}
            </View>
          ) : null}
          {tab === "Categories" &&
          search &&
          !category &&
          result?.shops.length ? (
            <View style={{ gap: 12, marginBottom: 16 }}>
              {result.shops.map((item) => (
                <View key={item.id}>{renderShop(item)}</View>
              ))}
            </View>
          ) : null}
          {tab === "Categories" && search && !category && brands.length ? (
            <View style={styles.brandSearch}>
              {brands.map((name) => (
                <Pressable
                  key={name}
                  onPress={() => {
                    setBrand(name);
                    setTab("Brands");
                  }}
                >
                  <Text style={styles.retry}>{name} →</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {tab === "Categories" || brand ? (
            productItems.length ? (
              <View style={styles.products}>
                {productItems.map((item) => renderProduct(item))}
              </View>
            ) : (
              empty(
                category
                  ? "No products are available in this category yet."
                  : "No matching products found.",
              )
            )
          ) : null}
          {moreError ? (
            <Text style={styles.emptyText}>
              More results could not load. Please retry.
            </Text>
          ) : null}
          {!brand &&
          tab !== "Brands" &&
          result?.key === key &&
          (tab === "Shops" ? result.shopCursor : result.productCursor) ? (
            <Pressable
              disabled={moreBusy}
              onPress={() => void more(tab === "Shops" ? "shops" : "products")}
              style={styles.more}
            >
              <Text style={styles.retry}>
                {moreBusy ? "Loading…" : "Load more"}
              </Text>
            </Pressable>
          ) : null}
          {tab === "Categories" && search && catalogueError ? (
            <Text style={styles.emptyText}>
              Brand search unavailable. Switch to Brands to retry.
            </Text>
          ) : null}
          {tab === "Categories" &&
          search &&
          !category &&
          result?.key === key &&
          result.shopCursor ? (
            <Pressable
              disabled={moreBusy}
              onPress={() => void more("shops")}
              style={styles.more}
            >
              <Text style={styles.retry}>
                {moreBusy ? "Loading…" : "More shops"}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  heading: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: "#07552F",
  },
  subtitle: { fontSize: 12, lineHeight: 16, color: "#737B6D", marginTop: 2 },
  search: {
    height: 46,
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: "#EAF0D9",
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    color: "#202820",
    height: "100%",
    padding: 0,
  },
  tabs: { flexDirection: "row", gap: 8, marginTop: 14, marginBottom: 14 },
  tab: {
    height: 34,
    paddingHorizontal: 24,
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#fff",
  },
  activeTab: { backgroundColor: "#07552F" },
  tabText: { fontSize: 11, color: "#5F6859" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  card: {
    width: "48.3%",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  cardBody: { height: 48, paddingHorizontal: 10, paddingTop: 8 },
  cardName: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: "#202820",
  },
  cardCopy: { fontSize: 10, lineHeight: 14, marginTop: 2, color: "#7A8373" },
  promo: {
    minHeight: 94,
    padding: 16,
    paddingVertical: 14,
    marginTop: 14,
    borderRadius: 16,
    backgroundColor: "#07552F",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  promoTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "600",
    color: "#fff",
  },
  promoCopy: { fontSize: 10, lineHeight: 14, color: "#EAF0D9", marginTop: 8 },
  promoArrow: { fontSize: 28, color: "#E8C94A" },
  selection: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  back: { fontSize: 24, color: "#07552F", paddingVertical: 8 },
  selectionTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "600",
    color: "#202820",
  },
  products: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  empty: {
    padding: 20,
    borderRadius: 14,
    backgroundColor: "#fff",
    marginTop: 8,
  },
  emptyText: { fontSize: 13, lineHeight: 20, color: "#737B6D" },
  retry: {
    fontSize: 13,
    fontWeight: "600",
    color: "#07552F",
    paddingVertical: 12,
  },
  more: { alignItems: "center", marginTop: 16 },
  brand: {
    width: "48%",
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#fff",
  },
  brandName: { fontSize: 18, fontWeight: "600", color: "#07552F" },
  brandSearch: { marginBottom: 12 },
});
