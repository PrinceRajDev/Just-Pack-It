import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { useEffect, useMemo, useState } from "react";
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

type Screen = "home" | "browse" | "bag" | "shop" | "account" | "orders" | "checkout";
type BagLine = Product & { quantity: number };
const c = {
  paper: "#F7F4EE",
  card: "#FDFBF7",
  raised: "#EFE9DF",
  ink: "#1F2A22",
  secondary: "#5E554A",
  muted: "#7B7266",
  line: "#DDD6C9",
  green: "#174B34",
  lime: "#D6ED93",
  pale: "#EDF3DF",
};
const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const categoryImage = (x: Category) =>
  x.image?.trim() ||
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const { bag, setBag, ready: bagReady, error: bagError } = useBuyerBag(session?.userId);
  const load = async (wanted?: ServiceArea | null) => {
    setLoading(true);
    setError(null);
    try {
      const first = await marketApi.loadHome(wanted?.id);
      const active = wanted ?? first.areas.find((x) => x.active) ?? null;
      const data =
        active?.id === wanted?.id
          ? first
          : await marketApi.loadHome(active?.id);
      setAreas(data.areas);
      setArea(active);
      setCategories(data.categories);
      setShops(data.shops);
      setProducts(data.products);
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
        if (!candidate || typeof candidate.token !== "string" || typeof candidate.userId !== "string" || candidate.role !== "buyer") { await SecureStore.deleteItemAsync("jpi.buyer.session"); return; }
        try {
          const verified = await buyerApi.me(candidate.token);
          if (verified.role === "buyer" && verified.userId === candidate.userId) setSession({ ...verified, token: candidate.token });
          else await SecureStore.deleteItemAsync("jpi.buyer.session");
        } catch (reason) {
          if (reason instanceof ApiError && reason.status === 401) await SecureStore.deleteItemAsync("jpi.buyer.session");
          else setSession(candidate);
        }
      } catch { /* An unreadable session requires a new sign-in. */ }
      finally { setSessionReady(true); }
    })();
    return () => clearTimeout(id);
  }, []);
  useEffect(() => onSessionExpired((token) => {
    if (session?.token !== token) return;
    setSession(null); setScreen("account");
    void SecureStore.deleteItemAsync("jpi.buyer.session").catch(() => undefined);
  }), [session]);
  const displayed = useMemo(
    () =>
      products.filter(
        (x) =>
          (!picked || x.categorySlug === picked),
      ),
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
  const body = !sessionReady ? <State title="Opening your account" copy="Restoring your session" loading /> : bagError ? <State title="Bag unavailable" copy={bagError} /> : !bagReady ? <State title="Loading your bag" copy="Restoring your saved items" loading /> : loading ? (
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
      area={area}
      categories={categories}
      shops={shops}
      products={displayed}
      bag={bag}
      picked={picked}
      onChoose={choose}
      onBrowse={() => setScreen("browse")}
      onShop={(x) => {
        setShop(x);
        setScreen("shop");
      }}
      onAdd={add}
      onClear={() => setPicked(null)}
    />
  ) : screen === "browse" ? (
    <Browse
      areaId={area?.id}
      onShop={(next) => {
        setShop(next);
        setScreen("shop");
      }}
      products={displayed}
      bag={bag}
      query={query}
      setQuery={setQuery}
      onBack={() => setScreen("home")}
      onAdd={add}
    />
  ) : screen === "shop" && shop ? (
    <ShopPage
      shop={shop}
      products={products.filter((x) => x.shopId === shop.id)}
      bag={bag}
      onBack={() => setScreen("home")}
      onAdd={add}
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
    <BuyerCheckout session={session} areaId={area?.id} bag={bag} back={() => setScreen("bag")} account={() => setScreen("account")} onConfirmed={() => { setBag([]); setScreen("orders"); }} />
  ) : (
    <Bag
      bag={bag}
      total={total}
      onChange={quantity}
      onCheckout={() => setScreen("checkout")}
      onBrowse={() => setScreen("home")}
    />
  );
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right", "bottom"]}>
      <StatusBar style="dark" />
      <View style={s.app}>
        <Header
          area={area}
          count={count}
          onArea={() => setPicker(true)}
          onBrowse={() => setScreen("browse")}
          onBag={() => setScreen("bag")}
        />
        {body}
        {(screen === "home" || screen === "browse" || screen === "shop") && count > 0 ? (
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
        <Nav
          screen={screen}
          count={count}
          home={() => setScreen("home")}
          browse={() => setScreen("browse")}
          bag={() => setScreen("bag")}
          account={() => setScreen("account")}
        />
        <AreaSheet
          open={picker}
          areas={areas}
          selected={area}
          close={() => setPicker(false)}
          choose={(x) => {
            setPicker(false);
            void load(x);
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function Header({
  area,
  count,
  onArea,
  onBrowse,
  onBag,
}: {
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
          <Image
            source={require("./assets/just-pack-it-icon.png")}
            style={s.logo}
          />
          <View>
            <Text style={s.brand}>just pack it</Text>
            <Text style={s.tagline}>YOUR NEIGHBOURHOOD, DELIVERED</Text>
          </View>
        </View>
        <Pressable onPress={onBag} style={s.bagTop}>
          <Text style={s.bagTopText}>Bag</Text>
          <Text style={s.bagCount}>{count}</Text>
        </Pressable>
      </View>
      <Pressable onPress={onArea} style={s.location}>
        <View style={s.pin}>
          <Text style={s.pinText}>⌖</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.locationLabel}>Delivering to</Text>
          <Text numberOfLines={1} style={s.locationName}>
            {area?.name ?? "Choose area"} ⌄
          </Text>
        </View>
        <Text style={s.change}>Change</Text>
      </Pressable>
      <Pressable onPress={onBrowse} style={s.search}>
        <Text style={s.searchIcon}>⌕</Text>
        <Text style={s.searchText}>Search products and shops</Text>
      </Pressable>
    </View>
  );
}
function Home({
  area,
  categories,
  shops,
  products,
  bag,
  picked,
  onChoose,
  onBrowse,
  onShop,
  onAdd,
  onClear,
}: {
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
  const feature = categories[0];
  const [categoryResult, setCategoryResult] = useState<{ key: string; items: Product[]; cursor: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [categoryFailure, setCategoryFailure] = useState<{ key: string; message: string } | null>(null);
  const [categoryAttempt, setCategoryAttempt] = useState(0);
  const categoryKey = `${area?.id ?? ""}:${picked ?? ""}`;
  useEffect(() => {
    if (!area || !picked) return;
    let active = true;
    void marketApi.categoryPage(area.id, picked).then((page) => { if (active) { setCategoryResult({ key: categoryKey, ...page }); setCategoryFailure(null); } }).catch((reason: unknown) => { if (active) setCategoryFailure({ key: categoryKey, message: reason instanceof Error ? reason.message : "Category could not load" }); });
    return () => { active = false; };
  }, [area, picked, categoryKey, categoryAttempt]);
  const categoryProducts = picked ? categoryResult?.key === categoryKey ? categoryResult.items : [] : products;
  const loadMore = async () => {
    if (!area || !picked || !categoryResult?.cursor || loadingMore) return;
    const snapshot = categoryResult;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await marketApi.categoryPage(area.id, picked, snapshot.cursor ?? undefined);
      setCategoryResult((current) => current?.key === snapshot.key && current.cursor === snapshot.cursor ? { key: snapshot.key, cursor: page.cursor, items: [...current.items, ...page.items.filter((item) => !current.items.some((old) => old.id === item.id))] } : current);
    } catch { setMoreError(snapshot.key); }
    finally { setLoadingMore(false); }
  };
  const [showCategories, setShowCategories] = useState(false);
  const [showShops, setShowShops] = useState(false);
  const [allShops, setAllShops] = useState<Shop[]>([]);
  const [shopsBusy, setShopsBusy] = useState(false);
  const [shopsError, setShopsError] = useState<string | null>(null);
  const openShops = async () => {
    setShowShops(true); setShopsBusy(true); setShopsError(null);
    try { setAllShops(area ? await marketApi.shops(area.id) : []); }
    catch (error) { setShopsError(error instanceof Error ? error.message : "Shops could not load"); }
    finally { setShopsBusy(false); }
  };
  return (
    <ScrollView
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.market}>
        <View style={{ flex: 1 }}>
          <Text style={s.marketLabel}>Your local market</Text>
          <Text style={s.marketTitle}>
            {area
              ? `Shop your neighbourhood in ${area.name}`
              : "Choose an area to begin"}
          </Text>
          <Text style={s.marketCopy}>
            {shops.length
              ? `${shops.filter((shop) => shop.isOpen).length} open now among ${shops.length} shops shown`
              : "Select an area to find nearby shops"}
          </Text>
        </View>
        {feature ? (
          <CategoryPicture item={feature} style={s.marketPicture} />
        ) : (
          <View style={[s.marketPicture, s.fallback]}>
            <Text style={s.fallbackText}>JP</Text>
          </View>
        )}
      </View>
      <Section title="Shop by category" action="More" onPress={() => setShowCategories(true)} />
      <Modal visible={showCategories} animationType="slide" onRequestClose={() => setShowCategories(false)}>
        <SafeAreaView style={s.safe}>
          <View style={{ padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={s.pageTitle}>All categories</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close categories" onPress={() => setShowCategories(false)} style={{ padding: 12 }}><Text style={s.clear}>Close</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, flexDirection: "row", flexWrap: "wrap" }}>
            {categories.map((item) => <CategoryCard key={item.slug} item={item} active={picked === item.slug} onPress={() => { setShowCategories(false); onChoose(item.slug); }} />)}
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <FlatList
        horizontal
        data={categories.slice(0, 6)}
        keyExtractor={(x) => x.slug}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.rail}
        renderItem={({ item }) => (
          <CategoryCard
            item={item}
            active={picked === item.slug}
            onPress={() => onChoose(item.slug)}
          />
        )}
      />
      {picked ? (
        <View style={s.filter}>
          <Text style={s.filterText}>Showing one category</Text>
          <Pressable onPress={onClear}>
            <Text style={s.clear}>Clear filter</Text>
          </Pressable>
        </View>
      ) : null}
      <Section
        title={area ? `Shops in ${area.name}` : "Nearby shops"}
        action="See all"
        onPress={() => void openShops()}
      />
      <Modal visible={showShops} animationType="slide" onRequestClose={() => setShowShops(false)}>
        <SafeAreaView style={s.safe}>
          <Title title={area ? `Shops in ${area.name}` : "Nearby shops"} copy="Choose a shop to browse its products" onBack={() => setShowShops(false)} />
          {shopsBusy ? <State title="Loading shops" copy="Checking your selected area" loading /> : shopsError ? <State title="Shops could not load" copy={shopsError} action="Try again" onAction={() => void openShops()} /> : <FlatList data={allShops} keyExtractor={(item) => item.id} contentContainerStyle={{ padding: 16, gap: 12 }} ListEmptyComponent={<Empty copy="No shops are available in this area yet" />} renderItem={({ item }) => <ShopRow item={item} onPress={() => { setShowShops(false); onShop(item); }} />} />}
        </SafeAreaView>
      </Modal>
      {shops.length ? (
        <View style={s.shopList}>
          {shops.slice(0, 4).map((x) => (
            <ShopRow key={x.id} item={x} onPress={() => onShop(x)} />
          ))}
        </View>
      ) : (
        <Empty copy="No shops are available in this area yet" />
      )}
      <Section
        title={picked ? "Available products" : "Products from nearby shops"}
        action="Search"
        onPress={onBrowse}
      />
      {picked && categoryFailure?.key === categoryKey ? <State title="Category could not load" copy={categoryFailure.message} action="Try again" onAction={() => { setCategoryFailure(null); setCategoryAttempt((value) => value + 1); }} /> : picked && categoryResult?.key !== categoryKey ? <ActivityIndicator color={c.green} /> : categoryProducts.length ? (
        <View style={s.grid}>
          {categoryProducts.slice(0, picked ? undefined : 12).map((x) => (
            <ProductCard
              key={x.id}
              item={x}
            bag={bag}
              quantity={bag.find((line) => line.id === x.id)?.quantity ?? 0}
              onAdd={onAdd}
            />
          ))}
        </View>
      ) : (
        <Empty copy="No active products are available in this category" />
      )}
      {picked && categoryResult?.key === categoryKey && categoryResult.cursor ? <View style={{ padding: 16 }}>{moreError === categoryKey ? <Text style={{ color: "#B3432B", marginBottom: 8 }}>More products could not load. Try again.</Text> : null}<Pressable disabled={loadingMore} onPress={() => void loadMore()} style={s.secondary}><Text style={s.secondaryText}>{loadingMore ? "Loading…" : "Load more products"}</Text></Pressable></View> : null}
    </ScrollView>
  );
}
function Browse({
  areaId,
  onShop,
  products,
  bag,
  query,
  setQuery,
  onBack,
  onAdd,
}: {
  areaId?: string;
  onShop: (shop: Shop) => void;
  products: Product[];
  bag: BagLine[];
  query: string;
  setQuery: (x: string) => void;
  onBack: () => void;
  onAdd: (x: Product) => void;
}) {
  const [result, setResult] = useState<{
    products: Product[];
    shops: Shop[];
    query: string;
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!areaId) return;
    let active = true;
    const timer = setTimeout(() => {
      void marketApi
        .search(areaId, query)
        .then((data) => {
          if (active) {
            setResult({ ...data, query });
            setFailure(null);
          }
        })
        .catch((error: unknown) => {
          if (active)
            setFailure(
              error instanceof Error ? error.message : "Search could not load",
            );
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [areaId, query, retry]);
  const pending = result?.query !== query;
  return (
    <View style={s.fill}>
      <Title
        title="Browse products"
        copy="Search your neighbourhood catalogue"
        onBack={onBack}
      />
      <View style={s.searchPage}>
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Try milk, bread or rice"
          placeholderTextColor={c.muted}
          style={s.searchInput}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
      <FlatList
        data={pending || failure ? [] : (result?.products ?? products)}
        keyExtractor={(x) => x.id}
        numColumns={2}
        columnWrapperStyle={s.gridRow}
        contentContainerStyle={s.gridList}
        ListHeaderComponent={
          !pending && !failure && result?.shops.length ? (
            <View style={{ gap: 8, marginBottom: 16 }}>
              {result.shops.map((item) => (
                <ShopRow
                  key={item.id}
                  item={item}
                  onPress={() => onShop(item)}
                />
              ))}
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          failure ? (
            <State
              title="Search unavailable"
              copy={failure}
              action="Try again"
              onAction={() => {
                setFailure(null);
                setRetry((value) => value + 1);
              }}
            />
          ) : pending ? (
            <ActivityIndicator color={c.green} />
          ) : (
            <Empty copy="No matching products found" />
          )
        }
        renderItem={({ item }) => (
          <ProductCard
            item={item}
            bag={bag}
            quantity={bag.find((x) => x.id === item.id)?.quantity ?? 0}
            onAdd={onAdd}
          />
        )}
      />
    </View>
  );
}
function ShopPage({
  shop,
  products,
  bag,
  onBack,
  onAdd,
}: {
  shop: Shop;
  products: Product[];
  bag: BagLine[];
  onBack: () => void;
  onAdd: (x: Product) => void;
}) {
  const [catalogue, setCatalogue] = useState<Product[] | null>(null);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void marketApi.shopProducts(shop.id).then((items) => { if (active) setCatalogue(items); }).catch((error: unknown) => { if (active) setCatalogueError(error instanceof Error ? error.message : "Products could not load"); });
    return () => { active = false; };
  }, [shop.id, attempt]);
  return (
    <View style={s.fill}>
      <Title
        title={shop.name}
        copy={`${shop.locality} · ${shop.isOpen ? "Open now" : "Currently closed"}`}
        onBack={onBack}
      />
      <FlatList
        data={catalogue ?? []}
        keyExtractor={(x) => x.id}
        numColumns={2}
        columnWrapperStyle={s.gridRow}
        contentContainerStyle={s.gridList}
        ListHeaderComponent={
          <View style={s.intro}>
            <Text style={s.introTitle}>
              {shop.tagline || "Your neighbourhood shop"}
            </Text>
            <Text style={s.introCopy}>
              {shop.description ||
                "Browse what is available from this shop today"}
            </Text>
            {shop.minimumOrderAmount ? (
              <Text style={s.minimum}>
                Minimum order {money(shop.minimumOrderAmount)}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          catalogueError ? <State title="Products could not load" copy={catalogueError} action="Try again" onAction={() => { setCatalogueError(null); setAttempt((value) => value + 1); }} /> : catalogue === null ? <ActivityIndicator color={c.green} /> : <Empty copy="This shop has no active products right now" />
        }
        renderItem={({ item }) => (
          <ProductCard
            item={item}
            bag={bag}
            quantity={bag.find((x) => x.id === item.id)?.quantity ?? 0}
            onAdd={onAdd}
          />
        )}
      />
    </View>
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
              <Thumb item={item} />
              <View style={s.bagInfo}>
                <Text numberOfLines={2} style={s.bagName}>
                  {item.name}
                </Text>
                <Text style={s.unit}>{item.unit}</Text>
                <Text style={s.price}>{money(item.price)}</Text>
              </View>
              <View style={s.stepper}>
                <Pressable onPress={() => onChange(item.id, -1)}>
                  <Text style={s.step}>−</Text>
                </Pressable>
                <Text style={s.stepCount}>{item.quantity}</Text>
                <Pressable onPress={() => onChange(item.id, 1)}>
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
              <Pressable
                style={s.checkoutButton}
                onPress={onCheckout}
              >
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
  screen,
  count,
  home,
  browse,
  bag,
  account,
}: {
  screen: Screen;
  count: number;
  home: () => void;
  browse: () => void;
  bag: () => void;
  account: () => void;
}) {
  return (
    <View style={s.nav}>
      <NavButton
        label="Home"
        active={screen === "home" || screen === "shop"}
        onPress={home}
      />
      <NavButton label="Browse" active={screen === "browse"} onPress={browse} />
      <NavButton
        label={count ? `Bag · ${count}` : "Bag"}
        active={screen === "bag"}
        onPress={bag}
      />
      <NavButton
        label="Account"
        active={screen === "account" || screen === "orders"}
        onPress={account}
      />
    </View>
  );
}
function NavButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[s.navButton, active && s.navActive]}>
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
  return failed ? (
    <View style={[style, s.fallback]}>
      <Text style={s.fallbackText}>{item.name.slice(0, 1)}</Text>
    </View>
  ) : (
    <Image
      source={{ uri: categoryImage(item) }}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
function ShopRow({ item, onPress }: { item: Shop; onPress: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <Pressable onPress={onPress} style={s.shopRow}>
      {item.coverImage && !failed ? (
        <Image
          source={{ uri: item.coverImage }}
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
function ProductCard({
  item,
  quantity,
  bag = [],
  onAdd,
}: {
  item: Product;
  quantity: number;
  bag?: BagLine[];
  onAdd: (x: Product) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [variantId, setVariantId] = useState(item.variants?.find((variant) => variant.stock > 0)?.id ?? item.variants?.[0]?.id);
  const variant = item.variants?.find((option) => option.id === variantId);
  const selected: Product = variant ? { ...item, id: `${item.id}:${variant.id}`, productId: item.id, variantId: variant.id, unit: variant.label, price: variant.price, stock: variant.stock, variants: undefined } : item;
  const selectedQuantity = variant ? bag.find((line) => line.id === selected.id)?.quantity ?? 0 : quantity;
  const unavailable = selected.stock <= 0 || selectedQuantity >= selected.stock;
  return (
    <View style={s.product}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.name}`} onPress={() => setDetailsOpen(true)}><Thumb item={item} /></Pressable>
      <Text onPress={() => setDetailsOpen(true)} numberOfLines={2} style={s.productName}>
        {item.name}
      </Text>
      <Text style={s.unit}>{item.unit}</Text>
      <View style={s.productBottom}>
        <Text style={s.price}>{money(item.price)}</Text>
        <Pressable
          disabled={variant ? item.stock <= 0 : unavailable}
          style={[s.add, unavailable && s.addDisabled]}
          onPress={() => variant ? setDetailsOpen(true) : onAdd(item)}
        >
          <Text style={[s.addText, unavailable && s.addTextDisabled]}>
            {variant ? "Options" : item.stock <= 0 ? "Out" : unavailable ? "Limit" : quantity ? `Add · ${quantity}` : "Add"}
          </Text>
        </Pressable>
      </View>
      <Modal visible={detailsOpen} animationType="slide" onRequestClose={() => setDetailsOpen(false)}>
        <SafeAreaView style={s.safe}>
          <Title title="Product details" copy={item.name} onBack={() => setDetailsOpen(false)} />
          <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
            <Thumb item={item} />
            <Text style={s.pageTitle}>{item.name}</Text>
            <Text style={s.pageCopy}>{item.unit}</Text>
            <Text style={s.totalValue}>{money(selected.price)}</Text>
            {item.variants?.length ? <View style={{ gap: 8 }}><Text style={s.pageTitle}>Choose size or pack</Text>{item.variants.map((option) => <Pressable key={option.id} disabled={option.stock <= 0} onPress={() => setVariantId(option.id)} style={{ padding: 16, borderRadius: 8, borderWidth: 1, borderColor: option.id === variantId ? c.green : c.line, backgroundColor: option.id === variantId ? c.pale : c.card }}><Text style={s.price}>{option.label} · {money(option.price)}</Text><Text style={s.pageCopy}>{option.stock > 0 ? `${option.stock} available` : "Out of stock"}</Text></Pressable>)}</View> : null}
            {item.description ? <Text style={{ color: c.secondary, fontSize: 15, lineHeight: 22 }}>{item.description}</Text> : null}
            <Text style={s.pageCopy}>{selected.stock > 0 ? `${selected.stock} available · ${selectedQuantity} in your bag` : "Currently out of stock"}</Text>
            <Pressable disabled={unavailable} style={[s.checkoutButton, unavailable && s.addDisabled]} onPress={() => onAdd(selected)}><Text style={[s.checkoutText, unavailable && s.addTextDisabled]}>{selected.stock <= 0 ? "Out of stock" : unavailable ? "Stock limit reached" : "Add to bag"}</Text></Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
function Thumb({ item }: { item: Product }) {
  const [failed, setFailed] = useState(false);
  return item.image && !failed ? (
    <Image
      source={{ uri: item.image }}
      style={s.productImage}
      onError={() => setFailed(true)}
    />
  ) : (
    <View style={s.productFallback}>
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
    backgroundColor: c.card,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  top: {
    height: 64,
    paddingHorizontal: 16,
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
  logo: { width: 36, height: 36, borderRadius: 10, marginRight: 8 },
  brand: { color: c.green, fontSize: 18, lineHeight: 20, fontWeight: "600" },
  tagline: { color: c.muted, marginTop: 2, fontSize: 8, letterSpacing: 0.5 },
  bagTop: {
    height: 36,
    minWidth: 68,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.green,
  },
  bagTopText: { color: "#FFFDF7", fontSize: 13, fontWeight: "500" },
  bagCount: {
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
    minHeight: 52,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: c.line,
    flexDirection: "row",
    alignItems: "center",
  },
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.pale,
  },
  pinText: { color: c.green, fontSize: 18 },
  locationLabel: { color: c.secondary, fontSize: 11 },
  locationName: { color: c.ink, marginTop: 1, fontSize: 14, fontWeight: "600" },
  change: { color: c.green, fontSize: 12, fontWeight: "600" },
  search: {
    height: 48,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.raised,
  },
  searchIcon: { color: c.secondary, marginRight: 10, fontSize: 22 },
  searchText: { color: c.muted, fontSize: 15 },
  content: { paddingBottom: 156 },
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
    height: 44,
    paddingHorizontal: 16,
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: c.ink, fontSize: 20, fontWeight: "500" },
  sectionAction: { color: c.green, fontSize: 13, fontWeight: "600" },
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
    paddingHorizontal: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  gridList: { padding: 16, paddingBottom: 108, gap: 12 },
  gridRow: { justifyContent: "space-between" },
  product: {
    width: "48.4%",
    minHeight: 240,
    padding: 8,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
    backgroundColor: c.card,
  },
  productImage: {
    width: "100%",
    height: 116,
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
    minHeight: 38,
    color: c.ink,
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  unit: { color: c.muted, marginTop: 2, fontSize: 11 },
  productBottom: {
    marginTop: "auto",
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  price: { color: c.ink, fontSize: 14, fontWeight: "600" },
  add: {
    minWidth: 48,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 6,
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
    bottom: 76,
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
    height: 64,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: c.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: c.card,
  },
  navButton: {
    height: 40,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  navActive: { backgroundColor: c.pale },
  navText: { color: c.secondary, fontSize: 13, fontWeight: "500" },
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
