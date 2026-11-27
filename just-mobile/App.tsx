import { StartupScreen } from "./src/StartupScreen";
import { theme, themedStyles } from "./src/theme";
import { BuyerStateCard, BuyerStateSkeleton } from "./src/BuyerStateCard";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "./src/deviceStorage";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
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
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  marketApi,
  buyerApi,
  ApiError,
  onSessionExpired,
  type Address,
  type Category,
  type BuyerOrder,
  type Product,
  type ServiceArea,
  type Session,
  type Shop,
} from "./src/api";
import { BuyerAccount, BuyerOrders } from "./src/BuyerAccount";
import { BuyerAddresses } from "./src/BuyerAddresses";
import { BuyerCheckout } from "./src/BuyerCheckout";
import { BuyerOrderConfirmation } from "./src/BuyerOrderConfirmation";
import { BuyerOrderDetails } from "./src/BuyerOrderDetails";
import { mergeGuestBag, useBuyerBag } from "./src/useBuyerBag";
import { useAndroidBack } from "./src/useAndroidBack";
import { resolveImage } from "./src/images";
import { MarketIcon } from "./src/MarketIcon";
import { HomeNotifications, BuyAgain } from "./src/HomeExtras";
import { BuyerBrowse, browseCategoryPhotos } from "./src/BuyerBrowse";

import { BuyerShopPage } from "./src/BuyerShopPage";
import {
  BuyerProductContext,
  BuyerProductDetails,
} from "./src/BuyerProductDetails";

type Screen =
  "home" | "browse" | "bag" | "shop" | "account" | "orders" | "checkout" | "confirmation" | "tracking";
type BagLine = Product & { quantity: number };
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
  const [shopOrigin, setShopOrigin] = useState<"home" | "browse" | "bag">("home");
  const [loading, setLoading] = useState(true);
  const [startupComplete, setStartupComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [homeVisit, setHomeVisit] = useState(0);
  const [confirmation, setConfirmation] = useState<{ order: BuyerOrder; contact: string; userId: string } | null>(null);
  const currentConfirmation = session && confirmation?.userId === session.userId ? confirmation : null;
  const [bagOrigin, setBagOrigin] = useState<Screen>("home");
  const [hindi, setHindi] = useState(false);
  const [accountOrigin, setAccountOrigin] = useState<Screen>("home");
  const [ordersOrigin, setOrdersOrigin] = useState<Screen>("home");
  const [signInFromBag, setSignInFromBag] = useState(false);
  const openBag = () => {
    if (screen !== "bag" && screen !== "checkout") setBagOrigin(screen);
    setScreen("bag");
  };
  const [accountFavourites, setAccountFavourites] = useState(false);
  const [accountMode, setAccountMode] = useState<"hub" | "auth" | "hub-auth">("hub");
  const openAccountHub = () => {
    setAccountFavourites(false);
    if (screen === "account") return;
    setAccountOrigin(screen);
    setSignInFromBag(false);
    setAccountMode("hub");
    setScreen("account");
  };
  const openAccount = () => {
    setAccountFavourites(false);
    if (screen === "account") return;
    setAccountOrigin(screen);
    setAccountMode("auth");
    setSignInFromBag(screen === "bag" || screen === "checkout");
    setScreen("account");
  };
  const goHome = () => {
    setConfirmation(null);
    setPicked(null);
    setQuery("");
    setShop(null);
    setHomeVisit((visit) => visit + 1);
    setScreen("home");
  };
  const openOrders = () => {
    if (screen === "orders") return;
    setOrdersOrigin(screen);
    setScreen("orders");
  };
  const leaveOrders = () => {
    if (ordersOrigin === "home") goHome();
    else setScreen(ordersOrigin);
  };
  const leaveSignIn = () => {
    if (!session && accountMode === "hub-auth") {
      setAccountMode("hub");
      return;
    }
    setSignInFromBag(false);
    if (accountOrigin === "home") goHome();
    else setScreen(accountOrigin);
  };
  const browseAsGuest = () => {
    const origin = signInFromBag ? bagOrigin : accountOrigin;
    setSignInFromBag(false);
    if (origin === "browse" || origin === "shop") setScreen(origin);
    else goHome();
  };
  useAndroidBack(() => {
    if (screen === "home") {
      if (!picked) return false;
      goHome();
      return true;
    }
    if (screen === "shop" && shopOrigin !== "home") setScreen(shopOrigin);
    else if (screen === "checkout") setScreen("bag");
    else if (screen === "tracking" && currentConfirmation) setScreen("confirmation");
    else if (screen === "confirmation") { setConfirmation(null); setScreen("orders"); }
    else if (screen === "bag") setScreen(bagOrigin);
    else if (screen === "account") leaveSignIn();
    else if (screen === "orders") leaveOrders();
    else goHome();
    return true;
  });
  const {
    bag,
    setBag,
    clearAfterOrder,
    ready: bagReady,
    error: bagError,
  } = useBuyerBag(session?.userId);
  const marketRequest = useRef(0);
  const [refreshingMarket, setRefreshingMarket] = useState(false);
  const [marketRefreshFailed, setMarketRefreshFailed] = useState(false);
  const load = async (wanted?: ServiceArea | null, refresh = false) => {
    const request = ++marketRequest.current;
    setRefreshingMarket(refresh);
    setMarketRefreshFailed(false);
    if (!refresh) {
      setLoading(true);
      setError(null);
    }
    try {
      const savedAreaId = wanted
        ? wanted.id
        : await SecureStore.getItemAsync("jpi.shopping.area").catch(() => null);
      const availableAreas = await marketApi.areas();
      const active =
        availableAreas.find((x) => x.active && x.id === savedAreaId) ??
        availableAreas.find((x) => x.active) ??
        null;
      const data = await marketApi.loadHome(active?.id);
      if (request !== marketRequest.current) return;
      setAreas(availableAreas);
      setArea(active);
      setCategories(data.categories);
      setShops(data.shops);
      setProducts(data.products);
      if (active)
        await SecureStore.setItemAsync("jpi.shopping.area", active.id).catch(
          () => undefined,
        );
    } catch (e) {
      if (request !== marketRequest.current) return;
      if (refresh) setMarketRefreshFailed(true);
      else setError(
        e instanceof Error ? e.message : "Could not load the marketplace",
      );
    } finally {
      if (request === marketRequest.current) {
        setLoading(false);
        setRefreshingMarket(false);
      }
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
          if (reason instanceof ApiError && (reason.status === 401 || reason.status === 403))
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
        setConfirmation(null);
        setAccountMode("auth");
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
  const add = (item: Product, amount?: number) =>
    setBag((old) => {
      const row = old.find((x) => x.id === item.id);
      if (item.stock <= 0 || (row?.quantity ?? 0) >= item.stock) return old;
      return row
        ? old.map((x) =>
            x.id === item.id ? { ...x, ...(amount === undefined ? {} : item), quantity: Math.min(item.stock, x.quantity + (amount ?? 1)) } : x,
          )
        : [...old, { ...item, quantity: Math.min(item.stock, amount ?? 1) }];
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
    if (!next && !session) return;
    if (next && next.role !== "buyer") throw new Error("Buyer account required.");
    if (next && !session) await mergeGuestBag(next.userId);
    if (next)
      await SecureStore.setItemAsync("jpi.buyer.session", JSON.stringify(next));
    else await SecureStore.deleteItemAsync("jpi.buyer.session");
    setSession(next);
    if (session?.userId !== next?.userId) setConfirmation(null);
    if (next && signInFromBag) {
      setSignInFromBag(false);
      setScreen("bag");
    }
    if (next && !session && accountMode === "auth" && accountOrigin === "orders") setScreen("orders");
  };
  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync("jpi.account.language").then(value => { if (active) setHindi(value === "hi"); }).catch(() => undefined);
    return () => { active = false; };
  }, [screen]);
  const starting = !sessionReady || (!bagError && (!bagReady || loading));
  const showStartup = starting && !startupComplete;
  if (!starting && !startupComplete) setStartupComplete(true);
  const body = showStartup ? (
    <StartupScreen hindi={hindi} />
  ) : starting ? (
    <State
      title={hindi ? "JustPackIt लोड हो रहा है…" : "Loading JustPackIt…"}
      copy={hindi ? "दुकानें और उत्पाद तैयार हो रहे हैं।" : "Getting shops and products ready."}
      loading
    />
  ) : bagError ? (
    <State title="Bag unavailable" copy={bagError} />
  ) : error ? (
    <State
      title="Could not load the market"
      copy={error}
      action="Try again"
      onAction={() => void load(area)}
    />
  ) : screen === "home" ? (
    <Home
      onArea={() => setPicker(true)}
      onRefreshMarket={() => void load(area, true)}
      refreshingMarket={refreshingMarket}
      marketRefreshFailed={marketRefreshFailed}
      canChooseArea={areas.some(item => item.active && item.id !== area?.id) || !area}
      hindi={hindi}
      key={homeVisit}
      header={
        <HomeHeader
          session={session}
          area={area}
          hindi={hindi}
          onSignIn={openAccount}
          onArea={() => setPicker(true)}
          onSearch={() => {
            setQuery("");
            setScreen("browse");
          }}
        />
      }
      session={session}
      onBag={() => {
        setPicked(null);
        openBag();
      }}
      onAccount={openAccount}
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
      onChangeArea={() => setPicker(true)}
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
          onQuantity={quantity}
          browseLayout
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
      onBack={() => (shopOrigin === "home" ? goHome() : setScreen(shopOrigin))}
      onBag={openBag}
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
      key={session?.userId ?? "guest"}
      session={session}
      save={saveSession}
      openOrders={openOrders}
      fromBag={signInFromBag}
      initialFavourites={accountFavourites}
      signInOpen={accountMode !== "hub"}
      startSignIn={() => setAccountMode("hub-auth")}
      area={area?.name}
      shops={shops}
      products={products}
      browse={() => setScreen("browse")}
      openShop={(item) => {
        setShopOrigin("browse");
        setShop(item);
        setScreen("shop");
      }}
      add={add}
      back={leaveSignIn}
      browseAsGuest={browseAsGuest}
    />
  ) : screen === "orders" ? (
    <BuyerOrders key={session?.userId ?? "guest"} session={session} back={leaveOrders} signIn={openAccount} browse={goHome} reorder={area ? {areaId:area.id,bag,add,openBag} : undefined} />
  ) : screen === "confirmation" || screen === "tracking" ? (
    currentConfirmation && session ? (
      screen === "tracking" ? (
        <BuyerOrderDetails token={session.token} id={currentConfirmation.order.id} back={() => setScreen("confirmation")} reorder={area ? {areaId:area.id,bag,add,openBag} : undefined} />
      ) : (
        <BuyerOrderConfirmation
          order={currentConfirmation.order}
          contact={currentConfirmation.contact}
          back={() => { setConfirmation(null); setScreen("orders"); }}
          track={() => setScreen("tracking")}
          shop={goHome}
        />
      )
    ) : (
      <State title="Order confirmation unavailable" copy="Open Your orders to check your order status." action="Your orders" onAction={() => setScreen("orders")} />
    )
  ) : (
    <BuyerCheckout
      key={session?.userId ?? "guest"}
      session={session}
      areaId={area?.id}
      bag={bag}
      shops={shops}
      inBag={screen === "bag"}
      hindi={hindi}
      openCheckout={() => setScreen("checkout")}
      openOrders={() => { setOrdersOrigin("bag"); setScreen("orders"); }}
      acceptPrice={(id, price) => setBag(items => items.map(item => item.id === id ? { ...item, price } : item))}
      openShop={(item) => { setShopOrigin("bag"); setShop(item); setScreen("shop"); }}
      bagActions={{
        onBack: () => setScreen(bagOrigin),
        onSignIn: openAccount,
        onChange: quantity,
        onBrowse: goHome,
      }}
      back={() => setScreen("bag")}
      account={openAccount}
      onConfirmed={async (order, contact) => {
        if (!session) return;
        await clearAfterOrder();
        setConfirmation({ order, contact, userId: session.userId });
        setScreen("confirmation");
      }}
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
        <BuyerProductContext.Provider
          value={{
            areaId: area?.id,
            shops: shop
              ? [shop, ...shops.filter((item) => item.id !== shop.id)]
              : shops,
            userId: session?.userId,
            categories,
            searchNearby: (value) => { setQuery(value); setScreen("browse"); },
            openFavourites: () => { openAccountHub(); setAccountFavourites(true); },
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
        {!showStartup && (screen === "home" || screen === "browse") && count > 0 ? (
          <Pressable style={s.bagBar} onPress={openBag}>
            <View>
              <Text style={s.bagBarTitle}>
                {count} item{count === 1 ? "" : "s"} in bag
              </Text>
              <Text style={s.bagBarCopy}>{money(total)} before delivery</Text>
            </View>
            <Text style={s.bagBarAction}>View bag</Text>
          </Pressable>
        ) : null}
        {!showStartup && screen !== "shop" && screen !== "checkout" && screen !== "confirmation" && screen !== "tracking" && !(screen === "account" && !session && accountMode !== "hub") && (
          <Nav
            hindi={hindi}
            screen={screen}
            count={count}
            home={goHome}
            browse={() => setScreen("browse")}
            bag={openBag}
            account={openAccountHub}
            orders={openOrders}
          />
        )}
        <AreaSheet
          open={picker}
          areas={areas}
          selected={area}
          close={() => setPicker(false)}
          choose={(x) => {
            setPicker(false);
            if (x.id === area?.id) return;
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

function HomeHeader({
  session,
  area,
  hindi,
  onSignIn,
  onArea,
  onSearch,
}: {
  session: Session | null;
  area: ServiceArea | null;
  hindi: boolean;
  onSignIn: () => void;
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
          <Image
            testID="home-logo"
            source={require("./assets/just-pack-it-icon.png")}
            accessible={false}
            resizeMode="contain"
            style={{ width: 40, height: 40, borderRadius: 10 }}
          />
          <Text style={{ color: theme.accentInk, fontSize: 21, fontWeight: "700", flexShrink: 1 }}>
            JustPackIt
          </Text>
        </View>
        <HomeNotifications key={session?.userId ?? "guest"} session={session} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hindi ? "खरीदारी का क्षेत्र बदलें" : "Change browsing area"}
        onPress={onArea}
        style={{
          marginTop: 17,
          minHeight: 42,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
        }}
      >
        <MarketIcon name="location" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, color: theme.muted, fontWeight: "600" }}>
            {hindi ? "खरीदारी का क्षेत्र" : "BROWSING AREA"}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontSize: 15, color: theme.ink, fontWeight: "700" }}
          >
            {area
              ? [area.name, area.city].filter(Boolean).join(", ")
              : hindi ? "खरीदारी का क्षेत्र चुनें" : "Choose browsing area"}{" "}
            ⌄
          </Text>
        </View>
      </Pressable>
      <HomeSavedAddress key={session?.userId} session={session} area={area} hindi={hindi} onSignIn={onSignIn} />
      <Pressable
        accessibilityRole="button"
        onPress={onSearch}
        style={{
          marginTop: 17,
          minHeight: 48,
          borderWidth: 1,
          borderColor: theme.controlBorder,
          borderRadius: 12,
          backgroundColor: theme.surface,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          gap: 10,
        }}
      >
        <MarketIcon name="search" />
        <Text style={{ fontSize: 13, color: theme.muted, flex: 1 }}>
          Search products, shops &amp; brands
        </Text>
      </Pressable>
    </View>
  );
}
function HomeSavedAddress({ session, area, hindi, onSignIn }: {
  session: Session | null;
  area: ServiceArea | null;
  hindi: boolean;
  onSignIn: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<{ address?: Address; count: number }>();
  const token = session?.token;
  const userId = session?.userId;
  useEffect(() => {
    if (!token || !userId || open) return;
    let active = true;
    void Promise.all([
      buyerApi.addresses(token),
      SecureStore.getItemAsync(`jpi.address.default.${userId}`).catch(() => null),
    ]).then(([addresses, defaultId]) => {
      if (!active) return;
      const address = addresses.find(item => item.id === defaultId) ??
        (addresses.length === 1 ? addresses[0] : undefined);
      setSaved({ address, count: addresses.length });
    }).catch(() => {
      if (active) setSaved(undefined);
    });
    return () => { active = false; };
  }, [open, token, userId]);

  const label = hindi ? "सहेजा गया डिलीवरी पता" : "SAVED DELIVERY ADDRESS";
  const address = saved?.address;
  const summary = address
    ? [address.label, address.locality, address.city].filter(Boolean).join(" · ")
    : !session
      ? (hindi ? "पते के लिए साइन इन करें" : "Sign in to access addresses")
      : saved?.count === 0
        ? (hindi ? "डिलीवरी पता जोड़ें" : "Add a delivery address")
        : (hindi ? "सहेजे गए पते देखें" : "View saved addresses");
  return (
    <>
      <Pressable
        testID="home-saved-address"
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${summary}`}
        onPress={session ? () => setOpen(true) : onSignIn}
        style={{ minHeight: 44, marginTop: 8, flexDirection: "row", alignItems: "center", gap: 14 }}
      >
        <MarketIcon name="location" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, color: theme.muted, fontWeight: "600" }}>{label}</Text>
          <Text numberOfLines={1} style={{ fontSize: 14, color: theme.ink, fontWeight: "600" }}>{summary}</Text>
        </View>
        <Text style={{ color: theme.accentInk, fontSize: 18 }}>›</Text>
      </Pressable>
      {session && open && (
        <Modal onRequestClose={() => setOpen(false)}>
          <SafeAreaProvider>
            <SafeAreaView style={s.safe}>
              <BuyerAddresses token={session.token} userId={session.userId} area={area?.name} fromHome back={() => setOpen(false)} />
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      )}
    </>
  );
}
const homeCategories = [
  { slug: "grocery-kirana", label: "Groceries", photo: require("./assets/home-categories/grocery.webp") },
  { slug: "fruits-vegetables", label: "Vegetables", photo: require("./assets/home-categories/vegetables.webp") },
  { slug: "fruits-vegetables", label: "Fruits", photo: require("./assets/home-categories/fruits.webp") },
  { slug: "dairy-eggs", label: "Dairy", photo: require("./assets/home-categories/dairy.webp") },
  { slug: "sweets-bakery", label: "Bakery", photo: require("./assets/home-categories/bakery.webp") },
  { slug: "personal-care-household", label: "Personal care", photo: require("./assets/home-categories/personal-care.webp") },
  { slug: "personal-care-household", label: "Home care", photo: require("./assets/home-categories/home-care.webp") },
  { slug: "fast-food-snacks", label: "Snacks", photo: require("./assets/home-categories/snacks.webp") },
];
function HomeSection({
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
      <Text style={{ fontSize: 18, fontWeight: "600", color: theme.ink }}>
        {title}
      </Text>
      <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6}>
        <Text style={{ color: theme.accentInk, fontSize: 12, fontWeight: "600" }}>
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
  onArea,
  onRefreshMarket,
  refreshingMarket,
  marketRefreshFailed,
  canChooseArea,
  hindi,
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
  onArea: () => void;
  onRefreshMarket: () => void;
  refreshingMarket: boolean;
  marketRefreshFailed: boolean;
  canChooseArea: boolean;
  hindi: boolean;
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
  const emptyShops = (
    <BuyerStateCard
      title={hindi ? "यहाँ अभी कोई दुकान नहीं है।" : "No shops available in this area yet"}
      copy={marketRefreshFailed ? (hindi ? "दुकानें लोड नहीं हो सकीं। फिर से कोशिश करें।" : "Couldn’t refresh shops. Try again.") : (hindi ? "दुकानें उपलब्ध होने पर यहाँ दिखेंगी।" : "Shops will appear here when they become available.")}
      icon="shop"
      action={refreshingMarket ? undefined : canChooseArea ? (hindi ? "खरीदारी का क्षेत्र बदलें" : "Change browsing area") : (hindi ? "फिर से देखें" : "Refresh shops")}
      busyLabel={refreshingMarket ? (hindi ? "दुकानें लोड हो रही हैं…" : "Refreshing shops…") : undefined}
      onAction={canChooseArea ? onArea : onRefreshMarket}
    />
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
  const { width } = useWindowDimensions();
  const categoryCardWidth = (Math.min(width, 600) - 52) / 2;
  const [showShops, setShowShops] = useState(false);
  const [allShops, setAllShops] = useState<Shop[]>([]);
  const [shopFilter, setShopFilter] = useState("");
  const shopTerm = shopFilter.trim().toLowerCase();
  const visibleShops = shopTerm
    ? allShops.filter(item => `${item.name} ${item.locality ?? ""}`.toLowerCase().includes(shopTerm))
    : allShops;
  const [shopsBusy, setShopsBusy] = useState(false);
  const [shopsError, setShopsError] = useState<string | null>(null);
  const [shopCursor, setShopCursor] = useState<string | null>(null);
  const [shopsMoreBusy, setShopsMoreBusy] = useState(false);
  const [shopsMoreError, setShopsMoreError] = useState(false);
  const shopsRequestPending = useRef(false);
  const openShops = async (refresh = false) => {
    setShowShops(true);
    if (shopsRequestPending.current) return;
    shopsRequestPending.current = true;
    if (!refresh) {
      setAllShops([]);
      setShopCursor(null);
      setShopFilter("");
    }
    setShopsBusy(true);
    setShopsError(null);
    setShopsMoreError(false);
    try {
      const page = area ? await marketApi.searchShops(area.id, "") : { items: [], cursor: null };
      setAllShops(page.items);
      setShopCursor(page.cursor);
    } catch (error) {
      setShopsError(
        error instanceof Error ? error.message : "Shops could not load",
      );
    } finally {
      shopsRequestPending.current = false;
      setShopsBusy(false);
    }
  };
  const loadMoreShops = async () => {
    if (!area || !shopCursor || shopsRequestPending.current) return;
    shopsRequestPending.current = true;
    setShopsMoreBusy(true);
    setShopsMoreError(false);
    try {
      const page = await marketApi.searchShops(area.id, "", shopCursor);
      setAllShops(previous => {
        const merged = new Map(previous.map(item => [item.id, item]));
        page.items.forEach(item => merged.set(item.id, item));
        return [...merged.values()];
      });
      setShopCursor(page.cursor === shopCursor ? null : page.cursor);
    } catch {
      setShopsMoreError(true);
    } finally {
      shopsRequestPending.current = false;
      setShopsMoreBusy(false);
    }
  };
  const retryCategory = () => {
    setCategoryFailure(null);
    setCategoryResult(null);
    setMoreError(null);
    setCategoryAttempt(value => value + 1);
  };
  const productResults = (
    <>
      {picked && categoryFailure?.key === categoryKey ? (
        <View style={s.categoryStatus}>
          <BuyerStateCard
            title="Category could not load"
            copy={categoryFailure.message}
            tone="error"
            icon="network"
            action="Try again"
            onAction={retryCategory}
          />
        </View>
      ) : picked && area && categoryResult?.key !== categoryKey ? (
        <View style={s.categoryStatus}>
          <BuyerStateCard title="Loading products…" tone="info" loading compact />
          <BuyerStateSkeleton />
        </View>
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
      ) : picked && area ? (
        <BuyerStateCard
          title="No active products are available in this category"
          icon="bag"
          action="Refresh products"
          onAction={retryCategory}
        />
      ) : (
        <Empty copy={picked ? "Choose a delivery area to see products." : "No products are available in this area yet."} />
      )}
      {picked &&
      categoryResult?.key === categoryKey &&
      categoryResult.cursor ? (
        <View style={{ padding: 16 }}>
          {moreError === categoryKey ? (
            <Text style={{ color: theme.error, marginBottom: 8 }}>
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
                  backgroundColor: theme.primary,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    color: theme.onPrimary,
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
      <View testID="home-hero" style={s.referenceHero}>
        <View style={s.referenceHeroCopy}>
          <Text accessibilityRole="header" style={s.referenceHeadline}>
            Your neighbourhood, delivered.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Explore shops"
            onPress={() => void openShops()}
            style={s.referenceCta}
          >
            <Text style={s.referenceCtaText}>Explore shops →</Text>
          </Pressable>
        </View>
        <View style={s.referenceHeroImage}>
          <Image
            testID="home-hero-photo"
            source={require("./assets/home-market-reference.webp")}
            resizeMode="cover"
            style={s.marketPhoto}
          />
        </View>
      </View>
      <View style={{ marginTop: 10 }}>
        <HomeSection
          title="Shop by category"
          action="More →"
          onPress={() => setShowCategories(true)}
        />
      </View>
      <Modal
        visible={showCategories}
        animationType="slide"
        onRequestClose={() => setShowCategories(false)}
      >
        <SafeAreaProvider>
        <SafeAreaView style={s.safe} testID="all-categories">
          <StatusBar style="dark" />
          <View style={s.categoryHeader}>
            <Text accessibilityRole="header" style={s.categoryHeading}>All categories</Text>
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
            contentContainerStyle={s.categoryGrid}
          >
            {categories.map((item) => (
              <CategoryCard
                key={item.slug}
                item={item}
                width={categoryCardWidth}
                active={picked === item.slug}
                onPress={() => {
                  setShowCategories(false);
                  onChoose(item.slug);
                }}
              />
            ))}
          </ScrollView>
        </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
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
        {homeCategories.map((entry) => (
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
            <View style={{ width: "100%", maxWidth: 74, height: 54, borderRadius: 12, borderWidth: 1, borderColor: theme.tileBorder, overflow: "hidden", backgroundColor: theme.surfaceSoft }}>
              <Image
                accessible={false}
                source={entry.photo}
                resizeMode="contain"
                style={{ width: "100%", height: "100%" }}
              />
            </View>
            <Text
              style={{
                fontSize: 10,
                lineHeight: 14,
                fontWeight: "600",
                color: theme.ink,
                marginTop: 7,
                textAlign: "center",
              }}
            >
              {entry.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ marginTop: 14, marginBottom: 8 }}>
        <HomeSection
          title="Shops around you"
          action="See all"
          onPress={() => void openShops()}
        />
      </View>
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
          {allShops.length > 0 && (
            <View style={s.shopPanelSearch}>
              <MarketIcon name="search" />
              <TextInput
                accessibilityLabel="Filter shops"
                value={shopFilter}
                onChangeText={setShopFilter}
                placeholder="Filter by shop name or locality"
                placeholderTextColor={theme.muted}
                autoCorrect={false}
                returnKeyType="search"
                style={s.shopPanelInput}
              />
              {!!shopFilter && <Pressable accessibilityRole="button" accessibilityLabel="Clear shop filter" onPress={() => setShopFilter("")} style={s.areaClose}>
                <Text style={s.areaCloseText}>×</Text>
              </Pressable>}
            </View>
          )}
          {!!shopTerm && !!shopCursor && allShops.length > 0 && (
            <Text accessibilityLiveRegion="polite" style={s.shopFilterSummary}>
              {visibleShops.length} {visibleShops.length === 1 ? "match" : "matches"} in {allShops.length} loaded {allShops.length === 1 ? "shop" : "shops"}
            </Text>
          )}
          {shopsBusy && !allShops.length ? (
            <ScrollView contentContainerStyle={s.shopPanelStatus}>
              <BuyerStateCard title="Loading shops…" copy="Checking your selected area" tone="info" compact loading />
              <BuyerStateSkeleton />
            </ScrollView>
          ) : shopsError && !allShops.length ? (
            <ScrollView contentContainerStyle={s.shopPanelStatus}>
              <BuyerStateCard title="Shops could not load" copy={shopsError} tone="error" icon="network"
                action="Try again" onAction={() => void openShops()} />
            </ScrollView>
          ) : (
            <FlatList
              data={visibleShops}
              keyboardShouldPersistTaps="handled"
              refreshing={shopsBusy}
              onRefresh={() => void openShops(true)}
              ListHeaderComponent={shopsError ? (
                <BuyerStateCard title="Couldn’t refresh shops" copy={shopsError} tone="error" compact
                  action="Try again" onAction={() => void openShops(true)} />
              ) : undefined}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, gap: 12 }}
              ListEmptyComponent={shopTerm && allShops.length > 0 ? (
                <BuyerStateCard
                  title={shopCursor ? "No matches in loaded shops" : "No matching shops"}
                  copy={shopCursor ? "Load more shops below to keep looking with this filter." : undefined}
                  icon="shop"
                  action="Clear filter"
                  onAction={() => setShopFilter("")}
                />
              ) : (
                <BuyerStateCard
                  title={hindi ? "यहाँ अभी कोई दुकान नहीं है।" : "No shops available in this area yet"}
                  icon="shop"
                  action={canChooseArea ? (hindi ? "खरीदारी का क्षेत्र बदलें" : "Change browsing area") : (hindi ? "फिर से देखें" : "Refresh shops")}
                  onAction={() => {
                    if (canChooseArea) {
                      setShowShops(false);
                      onArea();
                    } else {
                      void openShops();
                    }
                  }}
                />
              )}
              ListFooterComponent={shopCursor ? (
                <View style={s.shopPanelStatus}>
                  {shopsMoreError && <Text style={s.emptyText}>More shops couldn’t load.</Text>}
                  <Pressable accessibilityRole="button" disabled={shopsMoreBusy || shopsBusy} onPress={() => void loadMoreShops()} style={s.secondary}>
                    <Text style={s.secondaryText}>{shopsMoreBusy ? "Loading more shops…" : shopsMoreError ? "Retry loading more shops" : "Load more shops"}</Text>
                  </Pressable>
                </View>
              ) : undefined}
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
        <View style={{ paddingHorizontal: 20 }}>{emptyShops}</View>
      )}

      <View style={s.popularHeading}>
        <Text style={s.popularTitle}>
          {picked ? "Available products" : "Popular in Your\nNeighbourhood"}
        </Text>
        <Text style={s.popularSubtitle}>
          Local favourites, across your everyday.
        </Text>
      </View>
      {!picked && productResults}
      {session && (
          <BuyAgain
            onBrowseAlternatives={onQuickSearch}
            onAdd={onAdd}
            key={session.userId}
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
      )}
    </ScrollView>
  );
}
function Nav({
  hindi,
  screen,
  count,
  home,
  browse,
  bag,
  account,
  orders,
}: {
  hindi: boolean;
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
        (screen === "home" || screen === "browse" || screen === "bag" || screen === "orders") && {
          height: 70,
          paddingHorizontal: 8,
        },
      ]}
    >
      <NavButton hindi={hindi}
        label="Home"
        guestHighlight={screen === "home"}
        active={screen === "home" || screen === "shop"}
        onPress={home}
      />
      <NavButton hindi={hindi}
        label="Browse"
        guestHighlight={screen === "browse"}
        active={screen === "browse"}
        onPress={browse}
      />
      <NavButton hindi={hindi}
        label={count && screen !== "bag" ? `Bag · ${count}` : "Bag"}
        guestHighlight={screen === "bag"}
        active={screen === "bag"}
        onPress={bag}
      />
      <NavButton hindi={hindi} label="Orders" active={screen === "orders"} onPress={orders} />
      <NavButton hindi={hindi}
        label="Account"
        active={screen === "account"}
        onPress={account}
      />
    </View>
  );
}
const navIcons = {
  Home: require("./assets/nav-icons/home.png"),
  Browse: require("./assets/nav-icons/browse.png"),
  Bag: require("./assets/nav-icons/bag.png"),
  Orders: require("./assets/nav-icons/orders.png"),
  Account: require("./assets/nav-icons/account.png"),
};

function NavButton({
  hindi,
  guestHighlight = false,
  label,
  active,
  onPress,
}: {
  guestHighlight?: boolean;
  hindi: boolean;
  label: keyof typeof navIcons | `Bag · ${number}`;
  active: boolean;
  onPress: () => void;
}) {
  const translated = { Home:"होम", Browse:"खोजें", Bag:"बैग", Orders:"ऑर्डर", Account:"खाता" };
  const text = !hindi ? label : label.startsWith("Bag ·") ? label.replace("Bag", translated.Bag) : translated[label as keyof typeof translated];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        s.navButton,
        active && s.navActive,
        guestHighlight && { width: 75, height: 54 },
      ]}
    >
      <Image
        accessible={false}
        source={navIcons[label in navIcons ? (label as keyof typeof navIcons) : "Bag"]}
        resizeMode="contain"
        style={[s.navIcon, active && s.navIconActive]}
      />
      <Text style={[s.navText, active && s.navTextActive]}>{text}</Text>
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
function CategoryCard({
  item,
  width,
  active,
  onPress,
}: {
  item: Category;
  width: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.name}
      testID="all-category-card"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[s.category, { width }, active && s.categoryActive]}
    >
      <CategoryPicture item={item} height={Math.round(width / 1.55)} />
      <Text style={s.categoryName}>
        {item.name}
      </Text>
    </Pressable>
  );
}
function CategoryPicture({ item, height }: { item: Category; height: number }) {
  const style = [s.categoryImage, { height }];
  const [failed, setFailed] = useState(false);
  const [useBundled, setUseBundled] = useState(false);
  const artwork = `https://justpackit.vercel.app/categories/${item.slug}-v1.webp`;
  return failed ? (
    <View style={[style, s.fallback]}>
      <Text style={s.fallbackText}>{item.name.slice(0, 1)}</Text>
    </View>
  ) : (
    <Image
      source={browseCategoryPhotos[item.slug] ?? { uri: useBundled ? artwork : categoryImage(item) }}
      resizeMode="cover"
      style={style}
      testID="all-category-photo"
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
        backgroundColor: theme.surface,
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
            backgroundColor: theme.selected,
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
          backgroundColor: item.isOpen ? theme.selected : theme.closed,
          color: item.isOpen ? theme.accentInk : theme.ink,
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
            color: theme.ink,
          }}
        >
          {item.name}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 11, color: theme.secondary }}>
          {categoryLabel || item.tagline || item.locality}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: 11, lineHeight: 16, color: theme.accentInk }}
        >
          {typeof item.rating === "number"
            ? <Text style={{ color: theme.successInk }}>★ {item.rating.toFixed(1)} · </Text>
            : ""}
          {typeof item.distanceKm === "number"
            ? `${item.distanceKm.toFixed(1)} km`
            : item.locality}
        </Text>
        <Text style={{ fontSize: 11, color: theme.accentInk, marginTop: 4 }}>
          {item.isOpen ? "Open now" : "Currently closed"}
        </Text>
        <View
          style={{
            height: 30,
            borderRadius: 10,
            backgroundColor: theme.selected,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 2,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: theme.accentInk }}>
            View Shop
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
function ProductCard({
  categoryLayout = false,
  browseLayout = false,
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
  browseLayout?: boolean;
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
  const [packOpen, setPackOpen] = useState(false);
  const [variantId, setVariantId] = useState(
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
          backgroundColor: theme.surface,
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
        <Thumb item={item} shopImage={compact} categoryImage={categoryLayout} neutralFallback={browseLayout} />
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
      {(!compact && !categoryLayout || browseLayout && !!shopName) && (
        <Text
          numberOfLines={1}
          style={{
            color: theme.secondary,
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
            categoryLayout && { color: theme.accentInk },
          ]}
        >
          {money(categoryLayout ? selected.price : item.price)}
        </Text>
        {(compact || browseLayout) && selectedQuantity > 0 && onQuantity ? (
          <View
            style={{
              height: browseLayout ? 44 : 28,
              width: browseLayout ? "100%" : 76,
              borderRadius: 8,
              backgroundColor: theme.selected,
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
              <Text style={{ color: theme.accentInk, fontWeight: "600" }}>−</Text>
            </Pressable>
            <Text
              accessibilityLabel={`${selectedQuantity} in bag`}
              style={{ fontSize: 11, color: theme.accentInk, fontWeight: "600" }}
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
              <Text style={{ color: theme.accentInk, fontWeight: "600" }}>+</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={compact ? `Add ${item.name}` : undefined}
            disabled={
              browseLayout && variant ? !item.variants?.some(pack => pack.stock > 0) :
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
              browseLayout && variant ? setPackOpen(true) :
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
              {browseLayout && variant
                ? item.variants?.some(pack => pack.stock > 0) ? "Choose pack" : "Unavailable"
                : categoryLayout
                ? selected.stock <= 0
                  ? browseLayout ? "Unavailable" : "Out of stock"
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
      {browseLayout && variant && (
        <Modal transparent visible={packOpen} animationType="slide" onRequestClose={() => setPackOpen(false)}>
          <View style={s.packBackdrop}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close pack picker" style={StyleSheet.absoluteFill} onPress={() => setPackOpen(false)} />
            <SafeAreaView edges={["bottom"]} style={s.packSheet}>
              <Text style={s.packTitle}>Choose your pack</Text>
              <Text style={s.packTitle}>{item.name}</Text>
              {shopName && <Text style={s.unit}>Sold by {shopName}</Text>}
              <ScrollView style={{ maxHeight: 310 }}>
                {item.variants?.map(pack => (
                  <Pressable key={pack.id} accessibilityRole="radio" accessibilityState={{checked: variantId === pack.id}} aria-checked={variantId === pack.id}
                    disabled={pack.stock <= 0} onPress={() => setVariantId(pack.id)} style={[s.packOption, pack.stock <= 0 && s.addDisabled]}>
                    <Text style={[s.addText, pack.stock <= 0 && s.addTextDisabled]}>{variantId === pack.id ? "◉" : "○"} {pack.label} · {money(pack.price)}{pack.stock <= 0 ? " · Unavailable" : ""}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable accessibilityRole="button" disabled={unavailable} style={[s.packOption, unavailable && s.addDisabled]} onPress={() => { onAdd(selected); setPackOpen(false); }}>
                <Text style={[s.addText, unavailable && s.addTextDisabled]}>{unavailable ? "Unavailable" : `Add ${selected.unit} · ${money(selected.price)}`}</Text>
              </Pressable>
            </SafeAreaView>
          </View>
        </Modal>
      )}
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
  neutralFallback = false,
}: {
  item: Product;
  categoryImage?: boolean;
  compact?: boolean;
  shopImage?: boolean;
  neutralFallback?: boolean;
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
      {neutralFallback ? (
        <>
          <MarketIcon name="bag" color={theme.muted} />
          <Text style={s.unit}>Photo unavailable</Text>
        </>
      ) : <Text style={s.fallbackText}>{item.name.slice(0, 1)}</Text>}
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
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 36, gap: 16 }}>
      <BuyerStateCard title={title} copy={copy} tone={loading ? "info" : "error"} icon="network" loading={loading} compact={loading} action={action} onAction={onAction} />
      {loading && <BuyerStateSkeleton />}
    </ScrollView>
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
  const available = areas.filter(item => item.active);
  return (
    <Modal transparent visible={open} animationType="slide" onRequestClose={close}>
      <SafeAreaProvider>
        <View style={s.backdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss delivery area picker" style={StyleSheet.absoluteFill} onPress={close} />
          <SafeAreaView edges={["bottom", "left", "right"]} style={s.sheet} testID="delivery-area-sheet">
            <View style={s.handle} />
            <View style={s.areaHeading}>
              <View style={s.areaIcon}><MarketIcon name="home" /></View>
              <Text accessibilityRole="header" style={s.sheetTitle}>Choose browsing area</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close delivery area picker" onPress={close} style={s.areaClose}>
                <Text style={s.areaCloseText}>×</Text>
              </Pressable>
            </View>
            <Text style={s.sheetCopy}>
              {available.length === 1 && selected?.id === available[0].id
                ? `${selected.name} is currently the only available browsing area.`
                : "See nearby shops and products for the area you choose."}
            </Text>
            <ScrollView bounces={false} contentContainerStyle={s.areaOptions}>
              {!available.length && <BuyerStateCard title="We’re not here yet." copy="Shops aren’t available in this browsing area." tone="warning" icon="location" action="Back to marketplace" onAction={close} />}
              {available.map(item => {
                const checked = selected?.id === item.id;
                return <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked }} aria-checked={checked} accessibilityLabel={item.name} onPress={() => choose(item)} style={[s.areaRow, checked && s.areaSelected]}>
                  <View style={[s.areaRadio, checked && s.areaRadioChecked]}>{checked && <Text style={s.areaCheck}>✓</Text>}</View>
                  <View style={s.areaInfo}>
                    <Text style={s.areaName}>{item.name}</Text>
                    <Text style={s.areaMeta}>{[item.city, item.pincodes.length ? `PIN ${item.pincodes.join(", ")}` : null].filter(Boolean).join(" · ")}</Text>
                  </View>
                  {checked && <Text style={s.selected}>Selected</Text>}
                </Pressable>;
              })}
            </ScrollView>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const s = themedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.canvas },
  app: { flex: 1, backgroundColor: theme.canvas },
  content: {
    paddingBottom: 24,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  referenceHero: {
    marginHorizontal: 20,
    marginTop: 18,
    minHeight: 184,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor:theme.hero,
    flexDirection: "row",
  },
  referenceHeroCopy: {
    width: "54%",
    padding: 16,
    paddingRight: 8,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  referenceHeadline: {
    color: theme.ink,
    fontSize: 22,
    lineHeight: 25,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  referenceCta: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    marginTop: 12,
    backgroundColor:theme.primary,
    borderRadius: 11,
  },
  referenceCtaText: { color: theme.onPrimary, fontSize: 13, fontWeight: "700" },
  referenceHeroImage: {
    flex: 1,
    overflow: "hidden",
  },
  marketPhoto: {
    position: "absolute",
    right: "-15%",
    width: "205%",
    height: "100%",
  },
  popularHeading: { marginHorizontal: 20, marginTop: 28, marginBottom: 16 },
  popularTitle: {
    color: theme.ink,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "600",
  },
  popularSubtitle: {
    color: theme.muted,
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
    backgroundColor:theme.hero,
  },
  marketLabel: { color:theme.accentInk, fontSize: 12, fontWeight: "500" },
  marketTitle: {
    maxWidth: 205,
    color: theme.ink,
    marginTop: 8,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "500",
  },
  marketCopy: {
    maxWidth: 200,
    color:theme.secondary,
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
    backgroundColor: theme.selected,
  },
  rail: { paddingHorizontal: 16, gap: 12 },
  categoryHeader: { width: "100%", maxWidth: 600, alignSelf: "center", minHeight: 68, paddingHorizontal: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  categoryHeading: { fontSize: 24, color: theme.accentInk, fontWeight: "600", flexShrink: 1 },
  categoryGrid: { width: "100%", maxWidth: 600, alignSelf: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, gap: 12, flexDirection: "row", flexWrap: "wrap" },
  category: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.canvas,
  },
  categoryActive: { borderColor: theme.accentInk, borderWidth: 2 },
  shopPanelSearch: { marginHorizontal: 16, marginTop: 8, paddingHorizontal: 12, gap: 8, minHeight: 48, borderWidth: 1, borderColor: theme.controlBorder, borderRadius: 12, backgroundColor: theme.surface, flexDirection: "row", alignItems: "center" },
  shopPanelInput: { flex: 1, minWidth: 0, minHeight: 48, color: theme.ink, fontSize: 14 },
  shopFilterSummary: { marginHorizontal: 16, marginTop: 8, color: theme.secondary, fontSize: 13 },
  shopPanelStatus: { padding: 16, gap: 12 },
  categoryStatus: { paddingHorizontal: 20, gap: 12 },
  categoryImage: { width: "100%", backgroundColor: theme.surfaceSoft },
  categoryName: {
    minHeight: 52,
    padding: 10,
    color: theme.ink,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.selected,
  },
  fallbackText: { color: theme.accentInk, fontSize: 22, fontWeight: "500" },
  filter: {
    height: 40,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.selected,
  },
  filterText: { color: theme.secondary, fontSize: 12 },
  clear: { color: theme.accentInk, fontSize: 12, fontWeight: "600" },
  shopList: { paddingHorizontal: 16, gap: 8 },
  shopRow: {
    minHeight: 88,
    padding: 8,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.canvas,
  },
  shopThumb: {
    width: 70,
    height: 70,
    borderRadius: 8,
    backgroundColor: theme.surfaceSoft,
  },
  shopInfo: { flex: 1, marginLeft: 12 },
  shopName: { color: theme.ink, fontSize: 15, fontWeight: "600" },
  shopMeta: { color: theme.accentInk, marginTop: 4, fontSize: 12 },
  shopTagline: { color: theme.secondary, marginTop: 5, fontSize: 12 },
  arrow: {
    color: theme.secondary,
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
    backgroundColor: theme.surface,
  },
  productImage: {
    width: "100%",
    height: 107,
    borderRadius: 8,
    backgroundColor: theme.surfaceSoft,
    resizeMode: "cover",
  },
  productFallback: {
    height: 116,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.selected,
  },
  productName: {
    minHeight: 18,
    color: theme.ink,
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  unit: { color: theme.muted, marginTop: 2, fontSize: 11 },
  productBottom: {
    marginTop: "auto",
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  price: { color: theme.ink, fontSize: 16, fontWeight: "600" },
  add: {
    minWidth: 64,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.selected,
  },
  addDisabled: { backgroundColor: theme.closed },
  addText: { color: theme.accentInk, fontSize: 12, fontWeight: "600" },
  addTextDisabled: { color: theme.ink },
  title: {
    minHeight: 72,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.canvas,
  },
  back: { color: theme.accentInk, fontSize: 28, lineHeight: 32 },
  pageTitle: { color: theme.ink, fontSize: 22, lineHeight: 27, fontWeight: "500" },
  pageCopy: { color: theme.secondary, marginTop: 2, fontSize: 12 },
  searchPage: { padding: 16, paddingBottom: 4 },
  searchInput: {
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.controlBorder,
    borderRadius: 10,
    backgroundColor: theme.canvas,
    color: theme.ink,
    fontSize: 15,
  },
  intro: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: theme.selected,
  },
  introTitle: { color: theme.ink, fontSize: 16, fontWeight: "600" },
  introCopy: { color: theme.secondary, marginTop: 6, fontSize: 13, lineHeight: 19 },
  minimum: { color: theme.accentInk, marginTop: 10, fontSize: 12, fontWeight: "600" },
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
    backgroundColor: theme.primary,
  },
  bagBarTitle: { color: theme.onPrimary, fontSize: 14, fontWeight: "600" },
  bagBarCopy: { color: theme.onPrimary, marginTop: 2, fontSize: 11 },
  bagBarAction: { color: theme.onPrimary, fontSize: 13, fontWeight: "600" },
  nav: {
    height: 62,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.canvas,
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
  packBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: theme.overlayStrong },
  packSheet: { borderTopWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 },
  packTitle: { color: theme.accentInk, fontSize: 16, fontWeight: "600" },
  packOption: { minHeight: 44, borderRadius: 12, padding: 10, marginTop: 8, backgroundColor: theme.selected, alignItems: "center", justifyContent: "center" },
  navIcon: { width: 24, height: 24, flexShrink: 0, tintColor: theme.muted },
  navIconActive: { tintColor: theme.primary },
  navActive: { backgroundColor: theme.selected, borderWidth: 1, borderColor: theme.accentInk },
  navText: { color: theme.secondary, fontSize: 10, fontWeight: "500" },
  navTextActive: { color: theme.accentInk, fontWeight: "600" },
  state: {
    flex: 1,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  stateTitle: { color: theme.ink, marginTop: 16, fontSize: 20, fontWeight: "500" },
  stateCopy: {
    color: theme.secondary,
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
    borderColor: theme.accentInk,
    borderRadius: 8,
    justifyContent: "center",
  },
  secondaryText: { color: theme.accentInk, fontSize: 14, fontWeight: "600" },
  empty: {
    minHeight: 88,
    padding: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    justifyContent: "center",
    backgroundColor: theme.canvas,
  },
  emptyText: {
    color: theme.secondary,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: theme.overlay,
  },
  sheet: {
    borderTopWidth: 1,
    borderColor: theme.border,
    maxHeight: "82%",
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: theme.canvas,
  },
  handle: { alignSelf: "center", width: 32, height: 4, borderRadius: 2, backgroundColor: theme.border, marginTop: 10, marginBottom: 18 },
  areaHeading: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20 },
  areaIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.selected, alignItems: "center", justifyContent: "center" },
  sheetTitle: { flex: 1, color: theme.accentInk, fontSize: 21, lineHeight: 28, fontWeight: "600" },
  areaClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  areaCloseText: { color: theme.accentInk, fontSize: 27 },
  sheetCopy: { paddingHorizontal: 20, color: theme.secondary, marginTop: 8, fontSize: 14, lineHeight: 20 },
  areaOptions: { padding: 20, gap: 10 },
  areaRow: { minHeight: 72, padding: 14, borderWidth: 1, borderColor: theme.border, borderRadius: 16, backgroundColor: theme.surface, flexDirection: "row", alignItems: "center", gap: 12 },
  areaSelected: { borderColor: theme.accentInk, backgroundColor: theme.selected },
  areaInfo: { flex: 1, minWidth: 0 },
  areaRadio: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.muted },
  areaRadioChecked: { backgroundColor: theme.primary, borderColor: theme.accentInk },
  areaCheck: { color: theme.onPrimary, fontSize: 13 },
  areaName: { color: theme.ink, fontSize: 16, fontWeight: "600" },
  areaMeta: { color: theme.secondary, marginTop: 4, fontSize: 12, lineHeight: 16 },
  selected: { color: theme.accentInk, fontSize: 12, fontWeight: "600" },
}));
