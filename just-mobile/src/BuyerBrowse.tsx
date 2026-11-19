import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  marketApi,
  type Category,
  type Product,
  type Shop,
  type Session,
} from "./api";
import { HomeNotifications } from "./HomeExtras";
import { resolveImage } from "./images";
import { MarketIcon } from "./MarketIcon";
import { ReferenceArtwork } from "./ReferenceArtwork";
import { useAndroidBack } from "./useAndroidBack";
import { BrowseShopCard } from "./BrowseShopCard";

const cards = [
  { slug: "grocery-kirana", name: "Groceries & staples" },
  { slug: "fruits-vegetables", name: "Fruits & vegetables" },
  { slug: "dairy-eggs", name: "Dairy & eggs" },
  { slug: "sweets-bakery", name: "Bakery" },
];
type Tab = "Categories" | "Shops" | "Brands";
const searchTabs = ["Products", "Shops", "Brands"] as const;
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
  session,
  areaId,
  areaName,
  onShop,
  categories,
  query,
  setQuery,
  renderProduct,
  renderShop,
  hasBag,
}: {
  session: Session | null;
  areaId?: string;
  areaName?: string;
  onShop: (item: Shop) => void;
  categories: Category[];
  query: string;
  setQuery: (text: string) => void;
  renderProduct: (item: Product, categoryLayout?: boolean) => ReactNode;
  renderShop: (item: Shop) => ReactNode;
  hasBag: boolean;
}) {
  const [tab, setTab] = useState<Tab>("Categories");
  const [resultTab, setResultTab] =
    useState<(typeof searchTabs)[number]>("Products");
  const [category, setCategory] = useState<(typeof cards)[number] | null>(null);
  const [sort, setSort] = useState<
    "price_asc" | "price_desc" | "name" | undefined
  >();
  const [subcategory, setSubcategory] = useState<string>();
  const [menu, setMenu] = useState<"sort" | "filter" | null>(null);
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
  const globalSearch = tab === "Categories" && !category && !!search;
  const groceries = category?.slug === "grocery-kirana";
  const categoryLabel = groceries ? "groceries" : category?.name.toLowerCase();
  const subcategories =
    categories.find((item) => item.slug === category?.slug)?.subcategories ??
    [];
  const key = JSON.stringify([
    areaId,
    category?.slug,
    search,
    sort,
    subcategory,
  ]);
  const sortOptions = [
    { name: "Popular", value: undefined },
    { name: "Price: Low to High", value: "price_asc" },
    { name: "Price: High to Low", value: "price_desc" },
    { name: "Name: A to Z", value: "name" },
  ] as const;
  const discovery = tab === "Categories" && !category && !search;
  const needsBrands = tab === "Brands" || !!search;
  const reset = () => {
    setCategory(null);
    setSort(undefined);
    setSubcategory(undefined);
    setMenu(null);
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
              .categoryPage(areaId, category.slug, undefined, search, {
                sort,
                subcategory,
              })
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
  }, [
    areaId,
    discovery,
    category,
    search,
    key,
    attempt,
    tab,
    sort,
    subcategory,
  ]);
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
  const productItems = (() => {
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
  })();
  const selectedBrandItems = brandProducts.filter(
    (item) => brandName(item) === brand,
  );
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
                { sort, subcategory },
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
      <View style={styles.header}>
        {category ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Browse categories"
            onPress={reset}
            style={{ flexShrink: 1 }}
          >
            <Text numberOfLines={1} style={styles.heading}>
              {category.name}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.heading}>
            {globalSearch ? "Search" : "Browse"}
          </Text>
        )}
        <HomeNotifications session={session} />
      </View>
      <View style={styles.search}>
        <View style={{ transform: [{ scale: 0.8 }] }}>
          <MarketIcon name="search" color="#777D72" />
        </View>
        <TextInput
          accessibilityLabel={
            category
              ? `Search in ${categoryLabel}`
              : "Search products, shops and brands"
          }
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            if (!value.trim() || !search) setResultTab("Products");
            if (globalSearch) setBrand(null);
          }}
          placeholder={
            category
              ? `Search in ${categoryLabel}`
              : "Search products, shops & brands"
          }
          placeholderTextColor="#737B6D"
          style={[styles.input, globalSearch && { color: "#777D72" }]}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {globalSearch && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
            onPress={() => {
              setQuery("");
              setBrand(null);
              setResultTab("Products");
            }}
          >
            <Text style={styles.clearSearch}>×</Text>
          </Pressable>
        )}
      </View>
      {globalSearch ? (
        <Text accessibilityRole="header" style={styles.resultsHeading}>
          Results for “{search}”
        </Text>
      ) : category ? (
        <>
          <View style={styles.categoryControls}>
            <Pressable
              accessibilityRole="button"
              style={styles.tab}
              onPress={() => {
                setSubcategory(undefined);
                setMenu(
                  subcategories.length && menu !== "filter" ? "filter" : null,
                );
              }}
            >
              <Text style={styles.tabText}>
                {subcategories.find((item) => item.slug === subcategory)
                  ?.name ?? `All ${categoryLabel}`}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={{ flex: 1, justifyContent: "center" }}
              onPress={() => setMenu(menu === "sort" ? null : "sort")}
            >
              <Text style={styles.categoryControlText}>
                Sort:{" "}
                {sortOptions.find((option) => option.value === sort)?.name} ⌄
              </Text>
            </Pressable>
          </View>
          {menu === "sort" && (
            <View style={styles.empty}>
              {sortOptions.map((option) => (
                <Pressable
                  accessibilityRole="button"
                  key={option.name}
                  onPress={() => {
                    setSort(option.value);
                    setMenu(null);
                  }}
                >
                  <Text style={styles.retry}>{option.name}</Text>
                </Pressable>
              ))}
              <Text style={styles.emptyText}>
                Newest is unavailable for this catalogue.
              </Text>
            </View>
          )}
          {menu === "filter" && (
            <View style={styles.empty}>
              {subcategories.map((option) => (
                <Pressable
                  accessibilityRole="button"
                  key={option.slug}
                  onPress={() => {
                    setSubcategory(option.slug);
                    setMenu(null);
                  }}
                >
                  <Text style={styles.retry}>{option.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Text style={styles.categoryHeading}>
            {groceries ? "Everyday essentials, nearby." : category.name}
          </Text>
        </>
      ) : (
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
              style={styles.tab}
            >
              <Text
                style={[styles.tabText, tab === item && { fontWeight: "700" }]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {brand && !globalSearch ? (
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
      {discovery || tab === "Shops" || (tab === "Brands" && !brand) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Explore nearby shops"
          onPress={() => {
            reset();
            setTab("Shops");
          }}
          style={styles.promo}
        >
          <Text style={styles.promoTitle}>
            Your neighbourhood is full of good finds.
          </Text>
          <Text style={styles.explore}>Explore nearby shops →</Text>
        </Pressable>
      ) : null}
      {tab === "Brands" && !brand ? (
        <View style={styles.brandIntro}>
          <Text accessibilityRole="header" style={styles.brandHeading}>
            Shop brands you know
          </Text>
          <Text style={styles.brandNote}>
            Brand names shown as supplied by sellers.
          </Text>
        </View>
      ) : null}
      {discovery ? (
        <View style={styles.grid}>
          {[
            ...cards.filter((card) =>
              categories.some((category) => category.slug === card.slug),
            ),
            ...categories.filter(
              (category) => !cards.some((card) => card.slug === category.slug),
            ),
          ].map((item) => {
            const index = cards.findIndex((card) => card.slug === item.slug);
            const backendImage = categories.find(
              (category) => category.slug === item.slug,
            )?.image;
            return (
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
                {index >= 0 ? (
                  <ReferenceArtwork
                    source={require("../assets/browse-category-photos.png")}
                    sourceSize={[270, 200]}
                    crop={[
                      (index % 2) * 135,
                      Math.floor(index / 2) * 100,
                      135,
                      100,
                    ]}
                    style={styles.cardImage}
                  />
                ) : (
                  <Image
                    source={{
                      uri:
                        resolveImage(backendImage) ??
                        resolveImage("/categories/" + item.slug + "-v1.webp"),
                    }}
                    style={styles.cardImage}
                    resizeMode="cover"
                  />
                )}
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.explore}>Explore →</Text>
              </Pressable>
            );
          })}
        </View>
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
      ) : globalSearch ? (
        <>
          <View accessibilityRole="tablist" style={styles.resultTabs}>
            {searchTabs.map((name) => {
              const matched = result?.key === key ? result : null;
              const brandCountReady = catalogue?.area === areaId;
              const count =
                name === "Brands"
                  ? brandCountReady
                    ? brands.length
                    : null
                  : matched
                    ? name === "Products"
                      ? productItems.length
                      : matched.shops.length
                    : null;
              const hasMore =
                name === "Products"
                  ? matched?.productCursor
                  : name === "Shops"
                    ? matched?.shopCursor
                    : false;
              return (
                <Pressable
                  key={name}
                  accessibilityRole="tab"
                  aria-selected={resultTab === name}
                  onPress={() => {
                    setResultTab(name);
                    setBrand(null);
                  }}
                  style={[
                    styles.tab,
                    resultTab === name && styles.selectedResult,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabText,
                      resultTab === name && { fontWeight: "700" },
                    ]}
                  >
                    {name}
                    {count === null ? "" : ` ${count}${hasMore ? "+" : ""}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {resultTab === "Brands" ? (
            catalogueError ? (
              <Pressable
                onPress={() => {
                  setCatalogueError(null);
                  setAttempt((value) => value + 1);
                }}
                style={styles.empty}
              >
                <Text style={styles.emptyText}>
                  Brand search failed. Try again.
                </Text>
              </Pressable>
            ) : catalogue?.area !== areaId ? (
              <ActivityIndicator color="#07552F" />
            ) : brand ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setBrand(null)}
                >
                  <Text style={styles.retry}>← {brand}</Text>
                </Pressable>
                {selectedBrandItems.length ? (
                  <View style={styles.searchProducts}>
                    {selectedBrandItems.map((item) =>
                      renderProduct(item, true),
                    )}
                  </View>
                ) : (
                  empty("No products found.")
                )}
              </>
            ) : brands.length ? (
              <View style={styles.brandList}>
                {brands.map((name) => (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    style={styles.brand}
                    onPress={() => setBrand(name)}
                  >
                    <Text style={styles.brandName}>{name}</Text>
                    <Text style={styles.brandLink}>
                      View matching products →
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              empty("No brands found.")
            )
          ) : pending ? (
            <ActivityIndicator color="#07552F" />
          ) : resultTab === "Shops" ? (
            result?.shops.length ? (
              <View style={{ gap: 20 }}>
                {result.shops.map((item) => (
                  <BrowseShopCard
                    key={item.id}
                    item={item}
                    categoryLabel={item.locality}
                    actionLabel="View shop →"
                    onPress={() => onShop(item)}
                  />
                ))}
              </View>
            ) : (
              empty("No shops found.")
            )
          ) : productItems.length ? (
            <View style={styles.searchProducts}>
              {productItems.map((item) => renderProduct(item, true))}
            </View>
          ) : catalogue?.area !== areaId && !catalogueError ? (
            <ActivityIndicator color="#07552F" />
          ) : (
            empty("No products found.")
          )}
          {result?.key === key &&
          (resultTab === "Products"
            ? result.productCursor
            : resultTab === "Shops"
              ? result.shopCursor
              : null) ? (
            <Pressable
              accessibilityRole="button"
              disabled={moreBusy}
              style={styles.more}
              onPress={() =>
                void more(resultTab === "Shops" ? "shops" : "products")
              }
            >
              <Text style={styles.retry}>
                {moreBusy
                  ? "Loading…"
                  : moreError
                    ? "Try loading more again"
                    : `More ${resultTab.toLowerCase()}`}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : pending ? (
        <ActivityIndicator style={{ marginTop: 36 }} color="#07552F" />
      ) : (
        <>
          {tab === "Brands" && !brand ? (
            brands.length ? (
              <View style={styles.brandList}>
                {brands.map((name) => (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    onPress={() => setBrand(name)}
                    style={styles.brand}
                  >
                    <Text style={styles.brandName}>{name}</Text>
                    <Text style={styles.brandLink}>
                      View matching products →
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              empty("No brands have been added in this area yet.")
            )
          ) : null}
          {tab === "Shops" ? (
            <View style={{ gap: 20 }}>
              <View style={styles.shopHeading}>
                <Text style={styles.shopHeadingTitle}>
                  {search
                    ? "Matching shops"
                    : areaName
                      ? `Shops near ${areaName}`
                      : "Nearby shops"}
                </Text>
                <Text style={styles.shopCount}>
                  {result?.shops.length ?? 0}
                  {result?.shopCursor ? "+" : ""}{" "}
                  {result?.shops.length === 1 && !result.shopCursor
                    ? "shop"
                    : "shops"}
                </Text>
              </View>
              {result?.shops.length
                ? result.shops.map((item) => (
                    <BrowseShopCard
                      key={item.id}
                      item={item}
                      categoryLabel={
                        categories.find((category) =>
                          item.categories?.includes(category.slug),
                        )?.name
                      }
                      onPress={() => onShop(item)}
                    />
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
            (brand ? selectedBrandItems : productItems).length ? (
              <View style={styles.products}>
                {(brand ? selectedBrandItems : productItems).map((item) =>
                  renderProduct(item, !!category),
                )}
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
  clearSearch: { fontSize: 18, color: "#777D72", paddingHorizontal: 4 },
  resultsHeading: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    color: "#202820",
    marginTop: 22,
  },
  resultTabs: {
    flexDirection: "row",
    gap: 12,
    marginTop: 21,
    marginBottom: 20,
  },
  selectedResult: { backgroundColor: "#E3EDD1" },
  searchProducts: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 20,
  },
  categoryControls: { flexDirection: "row", gap: 12, marginTop: 20 },
  categoryControlText: { fontSize: 12, fontWeight: "600", color: "#202820" },
  categoryHeading: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    color: "#202820",
    marginTop: 22,
    marginBottom: 20,
  },
  shopHeading: {
    minHeight: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  shopHeadingTitle: {
    flex: 1,
    color: "#202820",
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "600",
  },
  shopCount: { color: "#07552F", fontSize: 12, fontWeight: "600" },
  content: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 12,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  header: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginRight: -12,
  },
  heading: { fontSize: 21, fontWeight: "700", color: "#07552F" },
  search: {
    height: 48,
    marginTop: 22,
    borderRadius: 12,
    backgroundColor: "#fff",
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: "#202820",
    height: "100%",
    padding: 0,
  },
  tabs: { flexDirection: "row", gap: 8, marginTop: 20, marginBottom: 20 },
  tab: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#EAF0D9",
  },
  tabText: { fontSize: 12, color: "#07552F", fontWeight: "600" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 20,
  },
  card: {
    width: "48.3%",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E4D9",
    backgroundColor: "#fff",
  },
  cardImage: {
    width: "100%",
    aspectRatio: 1.35,
    borderRadius: 12,
    backgroundColor: "#FAF8F1",
  },
  cardName: {
    fontSize: 14,
    lineHeight: 18,
    marginTop: 9,
    fontWeight: "600",
    color: "#202820",
  },
  cardCopy: { fontSize: 10, lineHeight: 14, marginTop: 2, color: "#7A8373" },
  promo: {
    minHeight: 108,
    padding: 16,
    marginBottom: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E4D9",
    backgroundColor: "#EAF0D9",
  },
  promoTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
    color: "#07552F",
  },
  explore: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    fontWeight: "600",
    color: "#07552F",
  },
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
  brandIntro: { paddingTop: 2, marginBottom: 20 },
  brandHeading: {
    fontSize: 22,
    lineHeight: 28,
    color: "#202820",
    fontWeight: "700",
  },
  brandNote: { marginTop: 21, fontSize: 13, lineHeight: 18, color: "#777D72" },
  brandList: { gap: 20 },
  brand: {
    minHeight: 88,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E4D9",
    backgroundColor: "#fff",
  },
  brandName: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600",
    color: "#07552F",
  },
  brandLink: { marginTop: 10, fontSize: 13, lineHeight: 18, color: "#777D72" },
  brandSearch: { marginBottom: 12 },
});
