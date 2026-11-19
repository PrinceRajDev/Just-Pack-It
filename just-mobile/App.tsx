import { StatusBar } from "expo-status-bar";
import * as SecureStore from "./src/deviceStorage";
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
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  marketApi,
  buyerApi,
  ApiError,
  onSessionExpired,
  type Category,
  type Product,
  type ServiceArea,
  type Session,
  type Shop,
} from "./src/api";
import { BuyerAccount, BuyerOrders } from "./src/BuyerAccount";
import { BuyerCheckout } from "./src/BuyerCheckout";
import { useBuyerBag } from "./src/useBuyerBag";
import { useAndroidBack } from "./src/useAndroidBack";
import { resolveImage } from "./src/images";
import { MarketIcon, type MarketIconName } from "./src/MarketIcon";
import { HomeNotifications, BuyAgain } from "./src/HomeExtras";
import { ReferenceArtwork } from "./src/ReferenceArtwork";
import { BuyerBrowse } from "./src/BuyerBrowse";
import { BuyerShopPage } from "./src/BuyerShopPage";
import {
  BuyerProductContext,
  BuyerProductDetails,
} from "./src/BuyerProductDetails";

type Screen =
  "home" | "browse" | "bag" | "shop" | "account" | "orders" | "checkout";
type BagLine = Product & { quantity: number };
const c = {
  paper: "#FAF8F1",
  card: "#FDFBF7",
  raised: "#EFE9DF",
  ink: "#202820",
  secondary: "#5E554A",
  muted: "#7B7266",
  line: "#DDD6C9",
  green: "#07552F",
  lime: "#E8C94A",
  pale: "#EAF0D9",
};
const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const categoryImage = (x: Category) =>
  resolveImage(x.image) ||
  `https://justpackit.vercel.app/categories/${x.slug}-v1.webp`;

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [area, setArea] = useState<ServiceArea | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [shopOrigin, setShopOrigin] = useState<"home" | "browse">("home");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [homeVisit, setHomeVisit] = useState(0);
  const goHome = () => {
    setPicked(null);
    setQuery("");
    setShop(null);
    setHomeVisit((visit) => visit + 1);
    setScreen("home");
  };
  useAndroidBack(() => {
    if (screen === "home") {
      if (!picked) return false;
      goHome();
      return true;
    }
    if (screen === "shop" && shopOrigin === "browse") setScreen("browse");
    else if (screen === "checkout") setScreen("bag");
    else if (screen === "orders") setScreen("account");
    else goHome();
    return true;
  });
  const {
    bag,
    setBag,
    ready: bagReady,
    error: bagError,
  } = useBuyerBag(session?.userId);
  const load = async (wanted?: ServiceArea | null) => {
    setLoading(true);
    setError(null);
    try {
      const savedAreaId = wanted
        ? wanted.id
        : await SecureStore.getItemAsync("jpi.shopping.area").catch(() => null);
      const first = await marketApi.loadHome(wanted?.id);
      const active =
        first.areas.find((x) => x.active && x.id === savedAreaId) ??
        first.areas.find((x) => x.active) ??
        null;
      const data =
        active?.id === wanted?.id
          ? first
          : await marketApi.loadHome(active?.id);
      setAreas(data.areas);
      setArea(active);
      setCategories(data.categories);
      setShops(data.shops);
      setProducts(data.products);
      if (active)
        await SecureStore.setItemAsync("jpi.shopping.area", active.id).catch(
          () => undefined,
        );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load the marketplace",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    void (async () => {
      try {
        const saved = await SecureStore.getItemAsync("jpi.buyer.session");
        if (!saved) return;
        const candidate = JSON.parse(saved) as Session;
        if (
          !candidate ||
          typeof candidate.token !== "string" ||
          typeof candidate.userId !== "string" ||
          candidate.role !== "buyer"
        ) {
          await SecureStore.deleteItemAsync("jpi.buyer.session");
          return;
        }
        try {
          const verified = await buyerApi.me(candidate.token);
          if (verified.role === "buyer" && verified.userId === candidate.userId)
            setSession({ ...verified, token: candidate.token });
          else await SecureStore.deleteItemAsync("jpi.buyer.session");
        } catch (reason) {
          if (reason instanceof ApiError && reason.status === 401)
            await SecureStore.deleteItemAsync("jpi.buyer.session");
          else setSession(candidate);
        }
      } catch {
        /* An unreadable session requires a new sign-in. */
      } finally {
        setSessionReady(true);
      }
    })();
    return () => clearTimeout(id);
  }, []);
  useEffect(
    () =>
      onSessionExpired((token) => {
        if (session?.token !== token) return;
        setSession(null);
        setScreen("account");
        void SecureStore.deleteItemAsync("jpi.buyer.session").catch(
          () => undefined,
        );
      }),
    [session],
  );
  const displayed = useMemo(
    () => products.filter((x) => !picked || x.categorySlug === picked),
    [products, picked],
  );
  const count = bag.reduce((sum, x) => sum + x.quantity, 0);
  const total = bag.reduce((sum, x) => sum + x.price * x.quantity, 0);
  const add = (item: Product) =>
    setBag((old) => {
      const row = old.find((x) => x.id === item.id);
      if (item.stock <= 0 || (row?.quantity ?? 0) >= item.stock) return old;
      return row
        ? old.map((x) =>
            x.id === item.id ? { ...x, quantity: x.quantity + 1 } : x,
          )
        : [...old, { ...item, quantity: 1 }];
    });
  const quantity = (id: string, delta: number) =>
    setBag((old) =>
      old.flatMap((x) =>
        x.id !== id
          ? [x]
          : x.quantity + delta > 0
            ? [{ ...x, quantity: Math.min(x.stock, x.quantity + delta) }]
            : [],
      ),
    );
  const choose = (slug: string) => {
    setPicked((old) => (old === slug ? null : slug));
    setScreen("home");
  };
  const saveSession = async (next: Session | null) => {
    setSession(next);
    if (next)
      await SecureStore.setItemAsync("jpi.buyer.session", JSON.stringify(next));
    else await SecureStore.deleteItemAsync("jpi.buyer.session");
  };
  const body = !sessionReady ? (
    <State title="Opening your account" copy="Restoring your session" loading />
  ) : bagError ? (
    <State title="Bag unavailable" copy={bagError} />
  ) : !bagReady ? (
    <State title="Loading your bag" copy="Restoring your saved items" loading />
  ) : loading ? (
    <State
      title="Loading Raiyam"
      copy="Finding nearby shops and fresh stock"
      loading
    />
  ) : error ? (
    <State
      title="Could not load the market"
      copy={error}
      action="Try again"
      onAction={() => void load(area)}
    />
  ) : screen === "home" ? (
    <Home
      key={homeVisit}
      header={
        !session ? (
          <GuestHomeHeader
            area={area}
            onArea={() => setPicker(true)}
            onSearch={() => {
              setQuery("");
              setScreen("browse");
            }}
          />
        ) : (
          <Header
            session={session}
            area={area}
            count={count}
            onArea={() => setPicker(true)}
            onBrowse={() => setScreen("browse")}
            onBag={() => setScreen("bag")}
          />
        )
      }
      session={session}
      onBag={() => {
        setPicked(null);
        setScreen("bag");
      }}
      onAccount={() => setScreen("account")}
      onQuickSearch={(value) => {
        setQuery(value);
        setScreen("browse");
      }}
      area={area}
      categories={categories}
      shops={shops}
      products={displayed}
      bag={bag}
      picked={picked}
      onChoose={choose}
      onBrowse={() => setScreen("browse")}
      onShop={(x) => {
        setShopOrigin("home");
        setShop(x);
        setScreen("shop");
      }}
      onAdd={add}
      onClear={() => setPicked(null)}
    />
  ) : screen === "browse" ? (
    <BuyerBrowse
      session={session}
      areaName={area?.name}
      onShop={(item) => {
        setShopOrigin("browse");
        setShop(item);
        setScreen("shop");
      }}
      areaId={area?.id}
      categories={categories}
      hasBag={count > 0}
      query={query}
      setQuery={setQuery}
      renderProduct={(item, categoryLayout) => (
        <ProductCard
          categoryLayout={categoryLayout}
          key={item.id}
          item={item}
          shopName={shops.find((shop) => shop.id === item.shopId)?.name}
          bag={bag}
          quantity={bag.find((line) => line.id === item.id)?.quantity ?? 0}
          onAdd={add}
        />
      )}
      renderShop={(item) => (
        <ShopRow
          key={item.id}
          item={item}
          onPress={() => {
            setShopOrigin("browse");
            setShop(item);
            setScreen("shop");
          }}
        />
      )}
    />
  ) : screen === "shop" && shop ? (
    <BuyerShopPage
      key={shop.id}
      shop={shop}
      categories={categories}
      userId={session?.userId}
      bag={bag}
      onBack={() => (shopOrigin === "home" ? goHome() : setScreen("browse"))}
      onBag={() => setScreen("bag")}
      renderProduct={(item, cardWidth) => (
        <ProductCard
          key={item.id}
          item={item}
          compact
          categoryLayout
          cardWidth={cardWidth}
          bag={bag}
          quantity={bag.find((line) => line.id === item.id)?.quantity ?? 0}
          onAdd={add}
          onQuantity={quantity}
        />
      )}
    />
  ) : screen === "account" ? (
    <BuyerAccount
      session={session}
      save={saveSession}
      openOrders={() => setScreen("orders")}
    />
  ) : screen === "orders" ? (
    <BuyerOrders session={session} back={() => setScreen("account")} />
  ) : screen === "checkout" ? (
    <BuyerCheckout
      session={session}
      areaId={area?.id}
      bag={bag}
      back={() => setScreen("bag")}
      account={() => setScreen("account")}
      onConfirmed={() => {
        setBag([]);
        setScreen("orders");
      }}
    />
  ) : (
    <Bag
      bag={bag}
      total={total}
      onChange={quantity}
      onCheckout={() => setScreen("checkout")}
      onBrowse={goHome}
    />
  );
  return (
    <SafeAreaView
      testID="buyer-shell"
      style={s.safe}
      edges={["top", "left", "right", "bottom"]}
    >
      <StatusBar style="dark" />
      <View style={s.app}>
        {screen !== "home" && screen !== "browse" && screen !== "shop" && (
          <Header
            session={session}
            area={area}
            count={count}
            onArea={() => setPicker(true)}
            onBrowse={() => setScreen("browse")}
            onBag={() => setScreen("bag")}
          />
        )}
        <BuyerProductContext.Provider
          value={{
            areaId: area?.id,
            shops: shop
              ? [shop, ...shops.filter((item) => item.id !== shop.id)]
              : shops,
            userId: session?.userId,
            categories,
            openShop: (item) => {
              if (screen === "shop" && shop?.id === item.id) return;
              setShopOrigin(screen === "home" ? "home" : "browse");
              setShop(item);
              setScreen("shop");
            },
          }}
        >
          {body}
        </BuyerProductContext.Provider>
        {(screen === "home" || screen === "browse") && count > 0 ? (
          <Pressable style={s.bagBar} onPress={() => setScreen("bag")}>
            <View>
              <Text style={s.bagBarTitle}>
                {count} item{count === 1 ? "" : "s"} in bag
              </Text>
              <Text style={s.bagBarCopy}>{money(total)} before delivery</Text>
            </View>
            <Text style={s.bagBarAction}>View bag</Text>
          </Pressable>
        ) : null}
        {screen !== "shop" && (
          <Nav
            guestHome={screen === "home" && !session}
            screen={screen}
            count={count}
            home={goHome}
            browse={() => setScreen("browse")}
            bag={() => setScreen("bag")}
            account={() => setScreen("account")}
            orders={() => setScreen("orders")}
          />
        )}
        <AreaSheet
          open={picker}
          areas={areas}
          selected={area}
          close={() => setPicker(false)}
          choose={(x) => {
            setPicker(false);
            setPicked(null);
            setQuery("");
            setShop(null);
            setScreen("home");
            void load(x);
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function Header({
  session,
  area,
  count,
  onArea,
  onBrowse,
  onBag,
}: {
  session: Session | null;
  area: ServiceArea | null;
  count: number;
  onArea: () => void;
  onBrowse: () => void;
  onBag: () => void;
}) {
  return (
    <View style={s.header}>
      <View style={s.top}>
        <View style={s.brandBlock}>
          <ReferenceArtwork crop={[20, 47, 46, 46]} style={s.logo} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={s.brand}>
              JustPackIt
            </Text>
            <Text numberOfLines={1} style={s.tagline}>
              Your Neighbourhood, Delivered.
            </Text>
          </View>
        </View>
        <HomeNotifications session={session} />
        <Pressable onPress={onBag} style={s.bagTop}>
          <MarketIcon name="bag" color={c.green} />
          <Text style={s.bagCount}>{count}</Text>
        </Pressable>
      </View>
      <Pressable onPress={onArea} style={s.location}>
        <View style={s.pin}>
          <ReferenceArtwork crop={[22, 120, 16, 20]} style={{ width: 16 }} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.locationLabel}>DELIVERING TO</Text>
          <Text numberOfLines={1} style={s.locationName}>
            {area ? `${area.name}, ${area.city}` : "Choose area"} ⌄
          </Text>
        </View>
        <Text style={s.change}>Change</Text>
      </Pressable>
      <Pressable onPress={onBrowse} style={s.search}>
        <MarketIcon name="search" />
        <Text style={s.searchText}>Search products, shops & brands</Text>
      </Pressable>
    </View>
  );
}
function GuestHomeHeader({
  area,
  onArea,
  onSearch,
}: {
  area: ServiceArea | null;
  onArea: () => void;
  onSearch: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          height: 58,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginRight: -12,
        }}
      >
        <Text style={{ color: c.green, fontSize: 21, fontWeight: "700" }}>
          JustPackIt
        </Text>
        <HomeNotifications session={null} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change delivery area"
        onPress={onArea}
        style={{
          marginTop: 17,
          minHeight: 42,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
        }}
      >
        <ReferenceArtwork crop={[22, 120, 16, 20]} style={{ width: 20 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, color: "#777D72", fontWeight: "600" }}>
            DELIVERING IN
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontSize: 15, color: c.ink, fontWeight: "700" }}
          >
            {area
              ? [area.name, area.city].filter(Boolean).join(", ")
              : "Choose delivery area"}{" "}
            ⌄
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onSearch}
        style={{
          marginTop: 17,
          minHeight: 48,
          borderRadius: 12,
          backgroundColor: "#fff",
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          gap: 10,
        }}
      >
        <MarketIcon name="search" color="#777D72" />
        <Text style={{ fontSize: 13, color: "#777D72", flex: 1 }}>
          Search products, shops &amp; brands
        </Text>
      </Pressable>
    </View>
  );
}
const guestCategories = [
  { slug: "grocery-kirana", label: "Groceries" },
  { slug: "fruits-vegetables", label: "Vegetables" },
  { slug: "fruits-vegetables", label: "Fruits" },
  { slug: "dairy-eggs", label: "Dairy" },
  { slug: "sweets-bakery", label: "Bakery" },
  { slug: "personal-care-household", label: "Personal care" },
  { slug: "personal-care-household", label: "Home care" },
  { slug: "fast-food-snacks", label: "Snacks" },
];
function GuestSection({
  title,
  action,
  onPress,
}: {
  title: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View
      style={{
        marginHorizontal: 20,
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: "600", color: c.ink }}>
        {title}
      </Text>
      <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6}>
        <Text style={{ color: c.green, fontSize: 12, fontWeight: "600" }}>
          {action}
        </Text>
      </Pressable>
    </View>
  );
}
function Home({
  header,
  onBag,
  onQuickSearch,
  session,
  onAccount,
  area,
  categories,
  shops,
  products,
  bag,
  picked,
  onChoose,
  onShop,
  onAdd,
  onClear,
}: {
  header: ReactNode;
  onBag: () => void;
  onQuickSearch: (query: string) => void;
  session: Session | null;
  onAccount: () => void;
  area: ServiceArea | null;
  categories: Category[];
  shops: Shop[];
  products: Product[];
  bag: BagLine[];
  picked: string | null;
  onChoose: (x: string) => void;
  onBrowse: () => void;
  onShop: (x: Shop) => void;
  onAdd: (x: Product) => void;
  onClear: () => void;
}) {
  const { width } = useWindowDimensions();
  const heroFontSize = Math.min(
    25,
    Math.max(18, ((Math.min(width, 600) - 40) / 350) * 25),
  );
  const [categoryResult, setCategoryResult] = useState<{
    key: string;
    items: Product[];
    cursor: string | null;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [categoryFailure, setCategoryFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [categoryAttempt, setCategoryAttempt] = useState(0);
  const categoryKey = `${area?.id ?? ""}:${picked ?? ""}`;
  useEffect(() => {
    if (!area || !picked) return;
    let active = true;
    void marketApi
      .categoryPage(area.id, picked)
      .then((page) => {
        if (active) {
          setCategoryResult({ key: categoryKey, ...page });
          setCategoryFailure(null);
        }
      })
      .catch((reason: unknown) => {
        if (active)
          setCategoryFailure({
            key: categoryKey,
            message:
              reason instanceof Error
                ? reason.message
                : "Category could not load",
          });
      });
    return () => {
      active = false;
    };
  }, [area, picked, categoryKey, categoryAttempt]);
  const categoryProducts = picked
    ? categoryResult?.key === categoryKey
      ? categoryResult.items
      : []
    : products;
  const categoryBagCount = bag.reduce((sum, line) => sum + line.quantity, 0);
  const loadMore = async () => {
    if (!area || !picked || !categoryResult?.cursor || loadingMore) return;
    const snapshot = categoryResult;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await marketApi.categoryPage(
        area.id,
        picked,
        snapshot.cursor ?? undefined,
      );
      setCategoryResult((current) =>
        current?.key === snapshot.key && current.cursor === snapshot.cursor
          ? {
              key: snapshot.key,
              cursor: page.cursor,
              items: [
                ...current.items,
                ...page.items.filter(
                  (item) => !current.items.some((old) => old.id === item.id),
                ),
              ],
            }
          : current,
      );
    } catch {
      setMoreError(snapshot.key);
    } finally {
      setLoadingMore(false);
    }
  };
  const [showCategories, setShowCategories] = useState(false);
  const [showShops, setShowShops] = useState(false);
  const [allShops, setAllShops] = useState<Shop[]>([]);
  const [shopsBusy, setShopsBusy] = useState(false);
  const [shopsError, setShopsError] = useState<string | null>(null);
  const openShops = async () => {
    setShowShops(true);
    setShopsBusy(true);
    setShopsError(null);
    try {
      setAllShops(area ? await marketApi.shops(area.id) : []);
    } catch (error) {
      setShopsError(
        error instanceof Error ? error.message : "Shops could not load",
      );
    } finally {
      setShopsBusy(false);
    }
  };
  const productResults = (
    <>
      {picked && categoryFailure?.key === categoryKey ? (
        <State
          title="Category could not load"
          copy={categoryFailure.message}
          action="Try again"
          onAction={() => {
            setCategoryFailure(null);
            setCategoryAttempt((value) => value + 1);
          }}
        />
      ) : picked && categoryResult?.key !== categoryKey ? (
        <ActivityIndicator color={c.green} />
      ) : categoryProducts.length ? (
        <View style={s.grid}>
          {categoryProducts.slice(0, picked ? undefined : 12).map((x) => (
            <ProductCard
              key={x.id}
              item={x}
              shopName={shops.find((shop) => shop.id === x.shopId)?.name}
              bag={bag}
              quantity={bag.find((line) => line.id === x.id)?.quantity ?? 0}
              onAdd={onAdd}
            />
          ))}
        </View>
      ) : (
        <Empty
          copy={
            picked
              ? "No active products are available in this category"
              : "No products are available in this area yet. Try another delivery area."
          }
        />
      )}
      {picked &&
      categoryResult?.key === categoryKey &&
      categoryResult.cursor ? (
        <View style={{ padding: 16 }}>
          {moreError === categoryKey ? (
            <Text style={{ color: "#B3432B", marginBottom: 8 }}>
              More products could not load. Try again.
            </Text>
          ) : null}
          <Pressable
            disabled={loadingMore}
            onPress={() => void loadMore()}
            style={s.secondary}
          >
            <Text style={s.secondaryText}>
              {loadingMore ? "Loading…" : "Load more products"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
  return (
    <ScrollView
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {header}
      {picked && (
        <Modal visible animationType="slide" onRequestClose={onClear}>
          <SafeAreaView style={s.safe}>
            <View
              style={{
                padding: 20,
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to Home"
                onPress={onClear}
                style={{ paddingVertical: 12, paddingRight: 8 }}
              >
                <Text style={s.back}>←</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={s.pageTitle}>
                  {categories.find((item) => item.slug === picked)?.name ??
                    "Category"}
                </Text>
                <Text style={s.pageCopy}>
                  {area?.name} · Products in this category
                </Text>
              </View>
            </View>
            <ScrollView
              contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}
            >
              {productResults}
              {categoryResult?.key === categoryKey &&
                categoryProducts.length === 0 && (
                  <Pressable
                    onPress={onClear}
                    style={[s.secondary, { marginHorizontal: 20 }]}
                  >
                    <Text style={s.secondaryText}>Browse other categories</Text>
                  </Pressable>
                )}
            </ScrollView>
            {bag.length > 0 && (
              <Pressable
                accessibilityRole="button"
                onPress={onBag}
                style={{
                  margin: 20,
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: c.green,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    color: "#fff",
                    fontWeight: "600",
                  }}
                >
                  View bag · {categoryBagCount}{" "}
                  {categoryBagCount === 1 ? "item" : "items"}
                </Text>
              </Pressable>
            )}
          </SafeAreaView>
        </Modal>
      )}
      {!session ? (
        <View
          testID="home-hero"
          style={{
            marginHorizontal: 20,
            marginTop: 20,
            padding: 16,
            minHeight: 210,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#DCE3D2",
            backgroundColor: c.pale,
          }}
        >
          <Text
            style={{
              fontSize: 28,
              lineHeight: 38,
              fontWeight: "700",
              color: c.green,
            }}
          >
            Good things.{"\n"}Closer to home.
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontSize: 12,
              lineHeight: 17,
              color: c.green,
            }}
          >
            Shop your neighbourhood favourites.{"\n"}Packed by shops. Delivered
            by riders.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void openShops()}
            style={{
              marginTop: 8,
              minHeight: 50,
              borderRadius: 14,
              backgroundColor: c.green,
              alignItems: "center",
              justifyContent: "center",
              padding: 8,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontWeight: "700",
                fontSize: 15,
                textAlign: "center",
              }}
            >
              Explore nearby shops
            </Text>
          </Pressable>
        </View>
      ) : (
        <View testID="home-hero" style={s.referenceHero}>
          <View style={s.referenceHeroCopy}>
            <Text style={s.referenceEyebrow}>DISCOVER LOCAL. LOVE LOCAL.</Text>
            <View style={{ marginTop: 16 }}>
              {["Your Local", "Market,", "Just a Tap Away"].map((line) => (
                <Text
                  key={line}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={[
                    s.referenceHeadline,
                    {
                      fontSize: heroFontSize,
                      lineHeight: Math.ceil(heroFontSize * 1.16),
                    },
                  ]}
                >
                  {line}
                </Text>
              ))}
            </View>
            <Text style={s.referenceSupport}>
              From the shops you know & love.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Explore shops"
              onPress={() => void openShops()}
              style={s.referenceCta}
            >
              <Text style={s.referenceCtaText}>Explore shops</Text>
              <Text style={s.referenceCtaArrow}>→</Text>
            </Pressable>
          </View>
          <ReferenceArtwork
            crop={[235, 225, 135, 220]}
            style={s.referenceHeroImage}
          />
        </View>
      )}
      {!session ? (
        <View style={{ marginTop: 10 }}>
          <GuestSection
            title="Shop by category"
            action="More →"
            onPress={() => setShowCategories(true)}
          />
        </View>
      ) : (
        <Section
          title="A little of everything"
          action="View all"
          onPress={() => setShowCategories(true)}
        />
      )}
      <Modal
        visible={showCategories}
        animationType="slide"
        onRequestClose={() => setShowCategories(false)}
      >
        <SafeAreaView style={s.safe}>
          <View
            style={{
              padding: 16,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={s.pageTitle}>All categories</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close categories"
              onPress={() => setShowCategories(false)}
              style={{ padding: 12 }}
            >
              <Text style={s.clear}>Close</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{
              padding: 16,
              gap: 12,
              flexDirection: "row",
              flexWrap: "wrap",
            }}
          >
            {categories.map((item) => (
              <CategoryCard
                key={item.slug}
                item={item}
                active={picked === item.slug}
                onPress={() => {
                  setShowCategories(false);
                  onChoose(item.slug);
                }}
              />
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
      {!session ? (
        <View
          style={{
            marginHorizontal: 20,
            marginTop: 15,
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            rowGap: 27,
          }}
        >
          {guestCategories.map((entry, index) => (
            <Pressable
              key={entry.label}
              accessibilityRole="button"
              accessibilityLabel={entry.label}
              onPress={() =>
                categories.some((category) => category.slug === entry.slug)
                  ? onChoose(entry.slug)
                  : onQuickSearch(entry.label)
              }
              style={{ width: "23%", alignItems: "center" }}
            >
              <ReferenceArtwork
                source={require("./assets/guest-categories.png")}
                sourceSize={[296, 108]}
                crop={[(index % 4) * 74, Math.floor(index / 4) * 54, 74, 54]}
                style={{ width: "100%", maxWidth: 74, borderRadius: 12 }}
              />
              <Text
                style={{
                  fontSize: 10,
                  lineHeight: 14,
                  fontWeight: "600",
                  color: c.ink,
                  marginTop: 7,
                  textAlign: "center",
                }}
              >
                {entry.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            paddingHorizontal: 20,
            justifyContent: "space-between",
            rowGap: 20,
          }}
        >
          {[
            { slug: "fruits-vegetables", label: "Vegetables\n& Fruits" },
            { slug: "grocery-kirana", label: "Grocery" },
            { slug: "fashion", label: "Fashion" },
            { slug: "dairy-eggs", label: "Dairy & Eggs" },
            { slug: "electronics", label: "Electronics" },
            { slug: "stationery-books", label: "Stationery" },
            {
              slug: "personal-care-household",
              label: "Beauty &\nPersonal Care",
            },
            { slug: "more", label: "More" },
          ].map((entry, index) => {
            const item = categories.find(
              (category) => category.slug === entry.slug,
            );
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={entry.label.replace(/\n/g, " ")}
                accessibilityState={{ selected: picked === entry.slug }}
                key={entry.slug}
                onPress={() =>
                  entry.slug === "more"
                    ? setShowCategories(true)
                    : item
                      ? onChoose(item.slug)
                      : onQuickSearch(entry.label)
                }
                style={{ width: "23%" }}
              >
                <View
                  style={{
                    aspectRatio: 1.25,
                    borderRadius: 12,
                    overflow: "hidden",
                    backgroundColor: c.pale,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: picked === entry.slug ? 2 : 0,
                    borderColor: c.green,
                  }}
                >
                  {index < 7 ? (
                    <ReferenceArtwork
                      crop={[
                        20 + (index % 4) * 90,
                        index < 4 ? 510 : 629,
                        80,
                        64,
                      ]}
                      style={{ width: "100%" }}
                    />
                  ) : (
                    <MarketIcon name="browse" color="#747D6E" />
                  )}
                </View>
                <Text
                  numberOfLines={2}
                  style={{
                    textAlign: "center",
                    fontSize: 11,
                    lineHeight: 14,
                    marginTop: 9,
                    minHeight: 28,
                    color: c.ink,
                  }}
                >
                  {entry.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {!session ? (
        <View style={{ marginTop: 14, marginBottom: 8 }}>
          <GuestSection
            title="Shops around you"
            action="See all"
            onPress={() => void openShops()}
          />
        </View>
      ) : (
        <Section
          title="Good shops. Close by."
          action="See all"
          onPress={() => void openShops()}
        />
      )}
      <Modal
        visible={showShops}
        animationType="slide"
        onRequestClose={() => setShowShops(false)}
      >
        <SafeAreaView style={s.safe}>
          <Title
            title={area ? `Shops in ${area.name}` : "Nearby shops"}
            copy="Choose a shop to browse its products"
            onBack={() => setShowShops(false)}
          />
          {shopsBusy ? (
            <State
              title="Loading shops"
              copy="Checking your selected area"
              loading
            />
          ) : shopsError ? (
            <State
              title="Shops could not load"
              copy={shopsError}
              action="Try again"
              onAction={() => void openShops()}
            />
          ) : (
            <FlatList
              data={allShops}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, gap: 12 }}
              ListEmptyComponent={
                <Empty copy="No shops are available in this area yet" />
              }
              renderItem={({ item }) => (
                <ShopRow
                  item={item}
                  onPress={() => {
                    setShowShops(false);
                    onShop(item);
                  }}
                />
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
      {shops.length ? (
        <View style={{ flexDirection: "row", paddingHorizontal: 20, gap: 12 }}>
          {shops.slice(0, 2).map((item) => (
            <View key={item.id} style={{ flex: 1, minWidth: 0 }}>
              <ShopPreview
                categoryLabel={
                  categories.find((category) =>
                    item.categories?.includes(category.slug),
                  )?.name
                }
                item={item}
                onPress={() => onShop(item)}
              />
            </View>
          ))}
        </View>
      ) : (
        <Empty copy="No shops are available in this area yet" />
      )}

      {session && (
        <>
          <View style={s.popularHeading}>
            <Text style={s.popularTitle}>
              {picked ? "Available products" : "Popular in Your\nNeighbourhood"}
            </Text>
            <Text style={s.popularSubtitle}>
              Local favourites, across your everyday.
            </Text>
          </View>
          {!picked && productResults}
          <BuyAgain
            onAdd={onAdd}
            key={session?.userId ?? "guest"}
            session={session}
            onAccount={onAccount}
            renderProduct={(item) => (
              <ProductCard
                fullWidth
                item={item}
                bag={bag}
                quantity={
                  bag.find((line) => line.id === item.id)?.quantity ?? 0
                }
                onAdd={onAdd}
              />
            )}
          />
        </>
      )}
    </ScrollView>
  );
}
function Bag({
  onCheckout,
  bag,
  total,
  onChange,
  onBrowse,
}: {
  bag: BagLine[];
  onCheckout: () => void;
  total: number;
  onChange: (id: string, d: number) => void;
  onBrowse: () => void;
}) {
  return (
    <View style={s.fill}>
      <Title
        title="Your bag"
        copy={
          bag.length
            ? `${bag.length} different item${bag.length === 1 ? "" : "s"}`
            : "Everything selected from local shops"
        }
      />
      {!bag.length ? (
        <State
          title="Your bag is empty"
          copy="Add something useful from a nearby shop"
          action="Browse products"
          onAction={onBrowse}
        />
      ) : (
        <FlatList
          data={bag}
          keyExtractor={(x) => x.id}
          contentContainerStyle={s.bagList}
          renderItem={({ item }) => (
            <View style={s.bagLine}>
              <Thumb item={item} compact />
              <View style={s.bagInfo}>
                <Text numberOfLines={2} style={s.bagName}>
                  {item.name}
                </Text>
                <Text style={s.unit}>{item.unit}</Text>
                <Text style={s.price}>{money(item.price)}</Text>
              </View>
              <View style={s.stepper}>
                <Pressable
                  accessibilityLabel={`Remove one ${item.name}`}
                  hitSlop={8}
                  onPress={() => onChange(item.id, -1)}
                >
                  <Text style={s.step}>−</Text>
                </Pressable>
                <Text style={s.stepCount}>{item.quantity}</Text>
                <Pressable
                  accessibilityLabel={`Add one ${item.name}`}
                  disabled={item.quantity >= item.stock}
                  hitSlop={8}
                  onPress={() => onChange(item.id, 1)}
                >
                  <Text style={s.step}>+</Text>
                </Pressable>
              </View>
            </View>
          )}
          ListFooterComponent={
            <View style={s.checkout}>
              <View style={s.totalRow}>
                <Text style={s.totalText}>Item total</Text>
                <Text style={s.totalValue}>{money(total)}</Text>
              </View>
              <Text style={s.note}>
                Delivery fee and final stock are confirmed at checkout
              </Text>
              <Pressable style={s.checkoutButton} onPress={onCheckout}>
                <Text style={s.checkoutText}>Continue to checkout</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </View>
  );
}
function Nav({
  guestHome = false,
  screen,
  count,
  home,
  browse,
  bag,
  account,
  orders,
}: {
  guestHome?: boolean;
  screen: Screen;
  count: number;
  home: () => void;
  browse: () => void;
  bag: () => void;
  account: () => void;
  orders: () => void;
}) {
  return (
    <View
      style={[
        s.nav,
        (guestHome || screen === "browse") && {
          height: 70,
          paddingHorizontal: 8,
        },
      ]}
    >
      <NavButton
        label="Home"
        guestHighlight={guestHome}
        active={screen === "home" || screen === "shop"}
        onPress={home}
      />
      <NavButton
        label="Browse"
        guestHighlight={screen === "browse"}
        active={screen === "browse"}
        onPress={browse}
      />
      <NavButton
        label={count ? `Bag · ${count}` : "Bag"}
        active={screen === "bag"}
        onPress={bag}
      />
      <NavButton label="Orders" active={screen === "orders"} onPress={orders} />
      <NavButton
        label="Account"
        active={screen === "account"}
        onPress={account}
      />
    </View>
  );
}
function NavButton({
  guestHighlight = false,
  label,
  active,
  onPress,
}: {
  guestHighlight?: boolean;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.navButton,
        active && s.navActive,
        guestHighlight && { width: 75, height: 54 },
      ]}
    >
      <MarketIcon
        name={
          (label.startsWith("Bag")
            ? "bag"
            : label.toLowerCase()) as MarketIconName
        }
        color={active ? c.green : "#7B8275"}
      />
      <Text style={[s.navText, active && s.navTextActive]}>{label}</Text>
    </Pressable>
  );
}
function Title({
  title,
  copy,
  onBack,
}: {
  title: string;
  copy: string;
  onBack?: () => void;
}) {
  return (
    <View style={s.title}>
      <Pressable
        onPress={onBack}
        disabled={!onBack}
        style={!onBack ? { display: "none" } : undefined}
      >
        <Text style={s.back}>←</Text>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={s.pageTitle}>
          {title}
        </Text>
        <Text numberOfLines={1} style={s.pageCopy}>
          {copy}
        </Text>
      </View>
    </View>
  );
}
function Section({
  title,
  action,
  onPress,
}: {
  title: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Pressable onPress={onPress}>
        <Text style={s.sectionAction}>{action}</Text>
      </Pressable>
    </View>
  );
}
function CategoryCard({
  item,
  active,
  onPress,
}: {
  item: Category;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.category, active && s.categoryActive]}
    >
      <CategoryPicture item={item} style={s.categoryImage} />
      <Text numberOfLines={2} style={s.categoryName}>
        {item.name}
      </Text>
    </Pressable>
  );
}
function CategoryPicture({ item, style }: { item: Category; style: object }) {
  const [failed, setFailed] = useState(false);
  const [useBundled, setUseBundled] = useState(false);
  const artwork = `https://justpackit.vercel.app/categories/${item.slug}-v1.webp`;
  return failed ? (
    <View style={[style, s.fallback]}>
      <Text style={s.fallbackText}>{item.name.slice(0, 1)}</Text>
    </View>
  ) : (
    <Image
      source={{ uri: useBundled ? artwork : categoryImage(item) }}
      style={style}
      onError={() => {
        if (!useBundled && categoryImage(item) !== artwork) setUseBundled(true);
        else setFailed(true);
      }}
    />
  );
}
function ShopRow({ item, onPress }: { item: Shop; onPress: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <Pressable onPress={onPress} style={s.shopRow}>
      {resolveImage(item.coverImage) && !failed ? (
        <Image
          source={{ uri: resolveImage(item.coverImage)! }}
          style={s.shopThumb}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={[s.shopThumb, s.fallback]}>
          <Text style={s.fallbackText}>
            {item.initials || item.name.slice(0, 1)}
          </Text>
        </View>
      )}
      <View style={s.shopInfo}>
        <Text numberOfLines={1} style={s.shopName}>
          {item.name}
        </Text>
        <Text numberOfLines={1} style={s.shopMeta}>
          {item.locality} · {item.isOpen ? "Open now" : "Closed"}
        </Text>
        <Text numberOfLines={1} style={s.shopTagline}>
          {item.tagline || "View available items"}
        </Text>
      </View>
      <Text style={s.arrow}>›</Text>
    </Pressable>
  );
}
function ShopPreview({
  item,
  onPress,
  categoryLabel,
}: {
  item: Shop;
  onPress: () => void;
  categoryLabel?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        width: "100%",
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: "#fff",
      }}
    >
      {resolveImage(item.coverImage) && !failed ? (
        <Image
          source={{ uri: resolveImage(item.coverImage)! }}
          onError={() => setFailed(true)}
          style={{ width: "100%", height: 98 }}
        />
      ) : (
        <View
          style={{
            height: 98,
            backgroundColor: c.pale,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={s.fallbackText}>
            {item.initials || item.name.slice(0, 1)}
          </Text>
        </View>
      )}
      <Text
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          paddingHorizontal: 8,
          paddingVertical: 5,
          borderRadius: 6,
          backgroundColor: c.pale,
          color: c.green,
          fontSize: 9,
        }}
      >
        {item.isOpen ? "OPEN" : "CLOSED"}
      </Text>
      <View style={{ padding: 11, gap: 6 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 13,
            lineHeight: 17,
            minHeight: 17,
            fontWeight: "600",
            color: c.ink,
          }}
        >
          {item.name}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 11, color: c.secondary }}>
          {categoryLabel || item.tagline || item.locality}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: 11, lineHeight: 16, color: c.green }}
        >
          {typeof item.rating === "number"
            ? `☆ ${item.rating.toFixed(1)} · `
            : ""}
          {typeof item.distanceKm === "number"
            ? `${item.distanceKm.toFixed(1)} km`
            : item.locality}
        </Text>
        <Text style={{ fontSize: 11, color: c.green, marginTop: 4 }}>
          {item.isOpen ? "Open now" : "Currently closed"}
        </Text>
        <View
          style={{
            height: 30,
            borderRadius: 10,
            backgroundColor: c.pale,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 2,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: c.green }}>
            View Shop
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
function ProductCard({
  categoryLayout = false,
  compact = false,
  cardWidth,
  onQuantity,
  shopName,
  fullWidth = false,
  item,
  quantity,
  bag = [],
  onAdd,
}: {
  item: Product;
  categoryLayout?: boolean;
  compact?: boolean;
  cardWidth?: number;
  onQuantity?: (id: string, delta: number) => void;
  shopName?: string;
  fullWidth?: boolean;
  quantity: number;
  bag?: BagLine[];
  onAdd: (x: Product) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [variantId] = useState(
    item.variants?.find((variant) => variant.stock > 0)?.id ??
      item.variants?.[0]?.id,
  );
  const variant = item.variants?.find((option) => option.id === variantId);
  const selected: Product = variant
    ? {
        ...item,
        id: `${item.id}:${variant.id}`,
        productId: item.id,
        variantId: variant.id,
        unit: variant.label,
        price: variant.price,
        stock: variant.stock,
        variants: undefined,
      }
    : item;
  const selectedQuantity = variant
    ? (bag.find((line) => line.id === selected.id)?.quantity ?? 0)
    : quantity;
  const unavailable = selected.stock <= 0 || selectedQuantity >= selected.stock;
  return (
    <View
      style={[
        s.product,
        categoryLayout && {
          width: "48.3%",
          minHeight: 240,
          padding: 10,
          backgroundColor: "#FFFFFF",
        },
        fullWidth && { width: "100%" },
        compact && {
          width: cardWidth ?? "48.3%",
          minHeight: categoryLayout ? 240 : 153,
          padding: categoryLayout ? 10 : 0,
          overflow: "hidden",
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${item.name}`}
        onPress={() => setDetailsOpen(true)}
      >
        <Thumb item={item} shopImage={compact} categoryImage={categoryLayout} />
      </Pressable>
      <Text
        onPress={() => setDetailsOpen(true)}
        numberOfLines={compact ? 1 : 2}
        style={[
          s.productName,
          categoryLayout && { fontSize: 13, marginTop: 8 },
          compact &&
            !categoryLayout && {
              fontSize: 11,
              lineHeight: 14,
              minHeight: 14,
              marginHorizontal: 10,
              marginTop: 8,
            },
        ]}
      >
        {item.name}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          s.unit,
          { minHeight: 16, lineHeight: 16 },
          compact &&
            !categoryLayout && {
              marginHorizontal: 10,
              fontSize: 10,
              minHeight: 12,
              lineHeight: 12,
            },
        ]}
      >
        {categoryLayout ? selected.unit : item.unit}
      </Text>
      {!compact && !categoryLayout && (
        <Text
          numberOfLines={1}
          style={{
            color: c.secondary,
            fontSize: 10,
            lineHeight: 16,
            minHeight: 16,
            marginTop: 2,
          }}
        >
          {shopName ?? ""}
        </Text>
      )}
      <View
        style={[
          s.productBottom,
          categoryLayout && {
            flexDirection: "column",
            alignItems: "stretch",
            gap: 8,
          },
          compact &&
            !categoryLayout && {
              marginHorizontal: 10,
              marginBottom: 10,
              paddingTop: 2,
            },
        ]}
      >
        <Text
          style={[
            s.price,
            compact && { fontSize: 14 },
            categoryLayout && { color: c.green },
          ]}
        >
          {money(categoryLayout ? selected.price : item.price)}
        </Text>
        {compact && selectedQuantity > 0 && onQuantity ? (
          <View
            style={{
              height: 28,
              width: 76,
              borderRadius: 8,
              backgroundColor: c.pale,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Decrease ${item.name}`}
              hitSlop={6}
              onPress={() => onQuantity(selected.id, -1)}
              style={{
                width: 28,
                height: 28,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: c.green, fontWeight: "600" }}>−</Text>
            </Pressable>
            <Text
              accessibilityLabel={`${selectedQuantity} in bag`}
              style={{ fontSize: 11, color: c.green, fontWeight: "600" }}
            >
              {selectedQuantity}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Increase ${item.name}`}
              hitSlop={6}
              disabled={unavailable}
              onPress={() => onQuantity(selected.id, 1)}
              style={{
                width: 28,
                height: 28,
                alignItems: "center",
                justifyContent: "center",
                opacity: unavailable ? 0.4 : 1,
              }}
            >
              <Text style={{ color: c.green, fontWeight: "600" }}>+</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={compact ? `Add ${item.name}` : undefined}
            disabled={
              categoryLayout
                ? unavailable
                : variant
                  ? item.stock <= 0
                  : unavailable
            }
            style={[
              s.add,
              categoryLayout && { height: 40, borderRadius: 13 },
              unavailable && s.addDisabled,
              compact &&
                !categoryLayout && {
                  height: 28,
                  minWidth: 76,
                  borderRadius: 8,
                },
            ]}
            onPress={() =>
              categoryLayout
                ? onAdd(selected)
                : variant
                  ? setDetailsOpen(true)
                  : onAdd(item)
            }
          >
            <Text
              style={[
                s.addText,
                categoryLayout && { fontSize: 14 },
                unavailable && s.addTextDisabled,
                compact && !categoryLayout && { fontSize: 10 },
              ]}
            >
              {categoryLayout
                ? selected.stock <= 0
                  ? "Out of stock"
                  : unavailable
                    ? "Stock limit"
                    : selectedQuantity
                      ? `+ Add · ${selectedQuantity}`
                      : "+ Add"
                : variant
                  ? "Options"
                  : item.stock <= 0
                    ? "Out"
                    : unavailable
                      ? "Limit"
                      : quantity
                        ? `Add · ${quantity}`
                        : "+ Add"}
            </Text>
          </Pressable>
        )}
      </View>
      <Modal
        visible={detailsOpen}
        animationType="slide"
        onRequestClose={() => setDetailsOpen(false)}
      >
        {detailsOpen && (
          <BuyerProductDetails
            item={item}
            bag={bag}
            onAdd={onAdd}
            back={() => setDetailsOpen(false)}
          />
        )}
      </Modal>
    </View>
  );
}
function Thumb({
  categoryImage = false,
  item,
  compact = false,
  shopImage = false,
}: {
  item: Product;
  categoryImage?: boolean;
  compact?: boolean;
  shopImage?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return resolveImage(item.image) && !failed ? (
    <Image
      source={{ uri: resolveImage(item.image)! }}
      style={[
        s.productImage,
        categoryImage && { height: 112, borderRadius: 12 },
        compact && { width: 64, height: 64, flexShrink: 0 },
        shopImage &&
          !categoryImage && { width: "100%", height: 76, borderRadius: 0 },
      ]}
      onError={() => setFailed(true)}
    />
  ) : (
    <View
      style={[
        s.productFallback,
        categoryImage && { height: 112, borderRadius: 12 },
        compact && { width: 64, height: 64, flexShrink: 0 },
        shopImage &&
          !categoryImage && { width: "100%", height: 76, borderRadius: 0 },
      ]}
    >
      <Text style={s.fallbackText}>{item.name.slice(0, 1)}</Text>
    </View>
  );
}
function Empty({ copy }: { copy: string }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyText}>{copy}</Text>
    </View>
  );
}
function State({
  title,
  copy,
  action,
  onAction,
  loading,
}: {
  title: string;
  copy: string;
  action?: string;
  onAction?: () => void;
  loading?: boolean;
}) {
  return (
    <View style={s.state}>
      {loading ? <ActivityIndicator color={c.green} size="large" /> : null}
      <Text style={s.stateTitle}>{title}</Text>
      <Text style={s.stateCopy}>{copy}</Text>
      {action ? (
        <Pressable style={s.secondary} onPress={onAction}>
          <Text style={s.secondaryText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
function AreaSheet({
  open,
  areas,
  selected,
  close,
  choose,
}: {
  open: boolean;
  areas: ServiceArea[];
  selected: ServiceArea | null;
  close: () => void;
  choose: (x: ServiceArea) => void;
}) {
  return (
    <Modal
      transparent
      visible={open}
      animationType="slide"
      onRequestClose={close}
    >
      <Pressable style={s.backdrop} onPress={close}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.handle} />
          <Text style={s.sheetTitle}>Choose delivery area</Text>
          <Text style={s.sheetCopy}>
            Shops and products update for the place you choose
          </Text>
          {areas
            .filter((x) => x.active)
            .map((x) => (
              <Pressable
                key={x.id}
                style={[s.areaRow, selected?.id === x.id && s.areaSelected]}
                onPress={() => choose(x)}
              >
                <View>
                  <Text style={s.areaName}>{x.name}</Text>
                  <Text style={s.areaMeta}>
                    {x.city} · PIN {x.pincodes.join(", ")}
                  </Text>
                </View>
                {selected?.id === x.id ? (
                  <Text style={s.selected}>Selected</Text>
                ) : null}
              </Pressable>
            ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.paper },
  app: { flex: 1, backgroundColor: c.paper },
  fill: { flex: 1 },
  header: {
    backgroundColor: c.paper,
    paddingTop: 8,
  },
  top: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  logo: { width: 46, height: 46, marginRight: 11 },
  brand: {
    color: c.green,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  tagline: { color: c.green, marginTop: 0, fontSize: 9 },
  bagTop: {
    height: 36,
    width: 32,
    paddingHorizontal: 4,
    borderRadius: 8,
    gap: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.paper,
  },
  bagTopText: { color: "#FFFDF7", fontSize: 13, fontWeight: "500" },
  bagCount: {
    position: "absolute",
    top: -3,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    textAlign: "center",
    overflow: "hidden",
    backgroundColor: c.lime,
    color: c.green,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  location: {
    height: 55,
    paddingHorizontal: 20,
    borderTopWidth: 0,
    borderTopColor: c.line,
    flexDirection: "row",
    alignItems: "center",
  },
  pin: {
    width: 20,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  pinText: { color: c.green, fontSize: 18 },
  locationLabel: { color: c.secondary, fontSize: 8, lineHeight: 12 },
  locationName: { color: c.ink, marginTop: 2, fontSize: 13, fontWeight: "600" },
  change: { color: c.green, fontSize: 11, fontWeight: "600" },
  search: {
    height: 48,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginBottom: 0,
    marginTop: 9,
    borderRadius: 14,
    gap: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.pale,
  },
  searchIcon: { color: c.secondary, marginRight: 10, fontSize: 22 },
  searchText: { color: c.muted, fontSize: 12, flex: 1, flexShrink: 1 },
  content: {
    paddingBottom: 24,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  referenceHero: {
    marginHorizontal: 20,
    marginTop: 18,
    minHeight: 220,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: c.green,
    flexDirection: "row",
  },
  referenceHeroCopy: {
    width: "61.43%",
    padding: 18,
    paddingBottom: 14,
    paddingRight: 5,
    zIndex: 1,
  },
  referenceEyebrow: { color: "#FFFFFF", fontSize: 8, lineHeight: 10 },
  referenceHeadline: {
    color: "#FFFFFF",
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "600",
    includeFontPadding: false,
    letterSpacing: -0.4,
  },
  referenceSupport: {
    color: "#EAF0D9",
    fontSize: 10,
    lineHeight: 14,
    marginTop: 12,
  },
  referenceCta: {
    width: 132,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginTop: 16,
    backgroundColor: c.lime,
    borderRadius: 10,
  },
  referenceCtaText: { color: c.green, fontSize: 11, fontWeight: "600" },
  referenceCtaArrow: { color: c.green, fontSize: 22, lineHeight: 24 },
  referenceHeroImage: {
    position: "absolute",
    right: 0,
    width: "38.57%",
    height: "100%",
  },
  popularHeading: { marginHorizontal: 20, marginTop: 28, marginBottom: 16 },
  popularTitle: {
    color: c.ink,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "600",
  },
  popularSubtitle: {
    color: "#727A6C",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  market: {
    minHeight: 152,
    padding: 20,
    margin: 16,
    marginBottom: 8,
    borderRadius: 16,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: c.green,
  },
  marketLabel: { color: c.lime, fontSize: 12, fontWeight: "500" },
  marketTitle: {
    maxWidth: 205,
    color: "#FFFDF7",
    marginTop: 8,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "500",
  },
  marketCopy: {
    maxWidth: 200,
    color: "#D9E4D6",
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  marketPicture: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 122,
    height: 122,
    borderTopLeftRadius: 56,
    backgroundColor: c.pale,
  },
  section: {
    minHeight: 65,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 0,
    gap: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: c.ink,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "600",
    flex: 1,
    flexShrink: 1,
  },
  sectionAction: { color: c.green, fontSize: 11, fontWeight: "600" },
  rail: { paddingHorizontal: 16, gap: 12 },
  category: {
    width: 104,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
    backgroundColor: c.card,
  },
  categoryActive: { borderColor: c.green, borderWidth: 2 },
  categoryImage: { width: "100%", height: 76, backgroundColor: c.raised },
  categoryName: {
    minHeight: 44,
    padding: 8,
    color: c.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.pale,
  },
  fallbackText: { color: c.green, fontSize: 22, fontWeight: "500" },
  filter: {
    height: 40,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: c.pale,
  },
  filterText: { color: c.secondary, fontSize: 12 },
  clear: { color: c.green, fontSize: 12, fontWeight: "600" },
  shopList: { paddingHorizontal: 16, gap: 8 },
  shopRow: {
    minHeight: 88,
    padding: 8,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.card,
  },
  shopThumb: {
    width: 70,
    height: 70,
    borderRadius: 8,
    backgroundColor: c.raised,
  },
  shopInfo: { flex: 1, marginLeft: 12 },
  shopName: { color: c.ink, fontSize: 15, fontWeight: "600" },
  shopMeta: { color: c.green, marginTop: 4, fontSize: 12 },
  shopTagline: { color: c.secondary, marginTop: 5, fontSize: 12 },
  arrow: {
    color: c.secondary,
    marginHorizontal: 6,
    fontSize: 28,
    lineHeight: 30,
  },
  grid: {
    paddingHorizontal: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  gridList: { padding: 16, paddingBottom: 108, gap: 12 },
  gridRow: { justifyContent: "space-between" },
  product: {
    width: "48%",
    minHeight: 239,
    padding: 8,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  productImage: {
    width: "100%",
    height: 107,
    borderRadius: 8,
    backgroundColor: c.raised,
    resizeMode: "cover",
  },
  productFallback: {
    height: 116,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.pale,
  },
  productName: {
    minHeight: 18,
    color: c.ink,
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  unit: { color: c.muted, marginTop: 2, fontSize: 11 },
  productBottom: {
    marginTop: "auto",
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  price: { color: c.ink, fontSize: 16, fontWeight: "600" },
  add: {
    minWidth: 64,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.pale,
  },
  addDisabled: { backgroundColor: c.raised },
  addText: { color: c.green, fontSize: 12, fontWeight: "600" },
  addTextDisabled: { color: c.muted },
  title: {
    minHeight: 72,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.card,
  },
  back: { color: c.green, fontSize: 28, lineHeight: 32 },
  pageTitle: { color: c.ink, fontSize: 22, lineHeight: 27, fontWeight: "500" },
  pageCopy: { color: c.secondary, marginTop: 2, fontSize: 12 },
  searchPage: { padding: 16, paddingBottom: 4 },
  searchInput: {
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 10,
    backgroundColor: c.card,
    color: c.ink,
    fontSize: 15,
  },
  intro: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: c.pale,
  },
  introTitle: { color: c.ink, fontSize: 16, fontWeight: "600" },
  introCopy: { color: c.secondary, marginTop: 6, fontSize: 13, lineHeight: 19 },
  minimum: { color: c.green, marginTop: 10, fontSize: 12, fontWeight: "600" },
  bagList: { padding: 16, paddingBottom: 112, gap: 12 },
  bagLine: {
    minHeight: 100,
    padding: 10,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.card,
  },
  bagInfo: { flex: 1, marginLeft: 12 },
  bagName: { color: c.ink, fontSize: 14, lineHeight: 18, fontWeight: "500" },
  stepper: {
    height: 36,
    overflow: "hidden",
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    gap: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  step: { color: c.green, fontSize: 18, lineHeight: 28 },
  stepCount: {
    minWidth: 20,
    color: c.ink,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
  },
  checkout: {
    marginTop: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
    backgroundColor: c.card,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalText: { color: c.ink, fontSize: 16, fontWeight: "500" },
  totalValue: { color: c.ink, fontSize: 20, fontWeight: "600" },
  note: { color: c.secondary, marginTop: 10, fontSize: 12, lineHeight: 18 },
  checkoutButton: {
    height: 48,
    marginTop: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.green,
  },
  checkoutText: { color: "#FFFDF7", fontSize: 14, fontWeight: "600" },
  bagBar: {
    position: "absolute",
    right: 16,
    bottom: 72,
    left: 16,
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: c.green,
  },
  bagBarTitle: { color: "#FFFDF7", fontSize: 14, fontWeight: "600" },
  bagBarCopy: { color: "#D9E4D6", marginTop: 2, fontSize: 11 },
  bagBarAction: { color: c.lime, fontSize: 13, fontWeight: "600" },
  nav: {
    height: 62,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
  },
  navButton: {
    height: 48,
    gap: 4,
    width: 56,
    minWidth: 0,
    paddingHorizontal: 4,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  navActive: { backgroundColor: c.pale },
  navText: { color: c.secondary, fontSize: 10, fontWeight: "500" },
  navTextActive: { color: c.green, fontWeight: "600" },
  state: {
    flex: 1,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  stateTitle: { color: c.ink, marginTop: 16, fontSize: 20, fontWeight: "500" },
  stateCopy: {
    color: c.secondary,
    maxWidth: 280,
    marginTop: 8,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
  secondary: {
    height: 44,
    paddingHorizontal: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: c.green,
    borderRadius: 8,
    justifyContent: "center",
  },
  secondaryText: { color: c.green, fontSize: 14, fontWeight: "600" },
  empty: {
    minHeight: 88,
    padding: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
    justifyContent: "center",
    backgroundColor: c.card,
  },
  emptyText: {
    color: c.secondary,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(31,27,22,.42)",
  },
  sheet: {
    maxHeight: "75%",
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: c.card,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.line,
  },
  sheetTitle: { color: c.ink, marginTop: 16, fontSize: 22, fontWeight: "500" },
  sheetCopy: { color: c.secondary, marginTop: 4, fontSize: 13, lineHeight: 19 },
  areaRow: {
    minHeight: 68,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  areaSelected: { borderColor: "#9AAF8F", backgroundColor: c.pale },
  areaName: { color: c.ink, fontSize: 15, fontWeight: "600" },
  areaMeta: { color: c.secondary, marginTop: 4, fontSize: 12 },
  selected: { color: c.green, fontSize: 12, fontWeight: "600" },
});
