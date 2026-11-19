import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { marketApi, type Product, type Shop } from "./api";
import {
  equivalentProduct,
  offerForPack,
  packKey,
  type DetailProduct,
} from "./productOffers";
import { resolveImage } from "./images";
import * as storage from "./deviceStorage";

export const BuyerProductContext = createContext<{
  areaId?: string;
  shops: Shop[];
  userId?: string;
}>({ shops: [] });
async function collect<T extends { id: string }>(
  read: (cursor?: string) => Promise<{ items: T[]; cursor: string | null }>,
) {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await read(cursor);
    items.push(
      ...page.items.filter((item) => !items.some((old) => old.id === item.id)),
    );
    if (!page.cursor) break;
    if (seen.has(page.cursor))
      throw new Error("Comparison could not finish loading.");
    seen.add(page.cursor);
    cursor = page.cursor;
  } while (cursor);
  return items;
}
function StoreIcon() {
  return (
    <View
      style={{
        width: 20,
        height: 22,
        alignItems: "center",
        justifyContent: "flex-end",
      }}
    >
      <View
        style={{
          width: 16,
          height: 13,
          borderWidth: 1.5,
          borderColor: "#07552F",
        }}
      >
        <View
          style={{
            width: 5,
            height: 8,
            borderWidth: 1.5,
            borderColor: "#07552F",
            position: "absolute",
            bottom: -1,
            left: 4,
          }}
        />
      </View>
      <View
        style={{
          position: "absolute",
          top: 1,
          width: 18,
          height: 7,
          borderWidth: 1.5,
          borderColor: "#07552F",
          flexDirection: "row",
          justifyContent: "space-evenly",
          backgroundColor: "#fff",
        }}
      >
        {[0, 1].map((index) => (
          <View
            key={index}
            style={{ width: 1, height: 5, backgroundColor: "#07552F" }}
          />
        ))}
      </View>
    </View>
  );
}
export function BuyerProductDetails({
  item,
  bag,
  onAdd,
  back,
}: {
  item: Product;
  bag: (Product & { quantity: number })[];
  onAdd: (item: Product) => void;
  back: () => void;
}) {
  const context = useContext(BuyerProductContext);
  const { width } = useWindowDimensions();
  const galleryWidth = Math.min(width, 600) - 48;
  const galleryHeight = (galleryWidth * 254) / 392;
  const baseId = item.productId ?? item.id;
  const [fresh, setFresh] = useState<DetailProduct>(item);
  const [verified, setVerified] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [compareError, setCompareError] = useState(false);
  const [comparing, setComparing] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [pool, setPool] = useState<DetailProduct[]>([]);
  const [shops, setShops] = useState<Shop[]>(context.shops);
  const [sellerId, setSellerId] = useState(baseId);
  const defaultPack =
    item.variants?.find((option) => option.stock > 0)?.label ??
    item.variants?.[0]?.label ??
    item.unit;
  const [pack, setPack] = useState(packKey(defaultPack));
  const [index, setIndex] = useState(0);
  const gallery = useRef<FlatList<string>>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<boolean | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const favouriteKey = `jpi.favourite.product.${context.userId ?? "guest"}.${baseId}`;
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
  useEffect(() => {
    let active = true;
    void (async () => {
      const product = (await marketApi.product(baseId)) as DetailProduct;
      if (!active) return;
      setFresh(product);
      setVerified(true);
      setLoadError(null);
      try {
        if (context.areaId) {
          const [products, nearbyShops] = await Promise.all([
            collect((cursor) =>
              marketApi.searchProducts(context.areaId!, "", cursor),
            ),
            collect((cursor) =>
              marketApi.searchShops(context.areaId!, "", cursor),
            ),
          ]);
          if (!active) return;
          setPool(
            products.filter((candidate) =>
              equivalentProduct(product, candidate),
            ),
          );
          setShops(nearbyShops);
          setCompareError(false);
        }
      } catch {
        if (active) setCompareError(true);
      } finally {
        if (active) setComparing(false);
      }
    })().catch((reason) => {
      if (active) {
        setLoadError(
          reason instanceof Error ? reason.message : "Product is unavailable.",
        );
        setComparing(false);
      }
    });
    return () => {
      active = false;
    };
  }, [baseId, context.areaId, attempt]);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(false), 2000);
    return () => clearTimeout(timer);
  }, [feedback]);
  const candidates = useMemo(
    () => [fresh, ...pool.filter((product) => product.id !== fresh.id)],
    [fresh, pool],
  );
  const current =
    candidates.find((product) => product.id === sellerId) ?? fresh;
  const offer = offerForPack(current, pack);
  const packOptions = fresh.variants?.length
    ? fresh.variants.map((variant) => ({
        label: variant.label,
        key: packKey(variant.label),
      }))
    : [{ label: fresh.unit, key: packKey(fresh.unit) }];
  const offers = candidates.flatMap((product) => {
    const row = offerForPack(product, pack);
    return row ? [row] : [];
  });
  const seller = shops.find((shop) => shop.id === current.shopId);
  const quantity = offer
    ? (bag.find((line) => line.id === offer.line.id)?.quantity ?? 0)
    : 0;
  const canAdd = verified && !!offer && offer.stock > quantity;
  const cheapest = offers
    .filter(
      (row) =>
        row.stock > 0 &&
        shops.find((shop) => shop.id === row.product.shopId)?.isOpen,
    )
    .reduce((price, row) => Math.min(price, row.price), Infinity);
  const images = [
    ...new Set(
      [current.image, ...((current as DetailProduct).images ?? [])]
        .map(resolveImage)
        .filter((value): value is string => !!value),
    ),
  ];
  const mrp = offer?.mrp;
  const discount =
    offer && mrp && mrp > offer.price
      ? Math.round((1 - offer.price / mrp) * 100)
      : null;
  const storageCopy = current.attributes?.find((attribute) =>
    /^(storage|storage instructions|care instructions)$/i.test(attribute.label),
  )?.value;
  const footerCopy =
    storageCopy ||
    seller?.description ||
    seller?.tagline ||
    (seller
      ? `Available from ${seller.name}.`
      : "Availability is checked at checkout.");
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
  const retry = () => {
    setLoadError(null);
    setVerified(false);
    setComparing(true);
    setAttempt((value) => value + 1);
  };
  return (
    <SafeAreaProvider>
      <SafeAreaView testID="product-safe" style={s.safe}>
        <View style={s.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back from product"
            style={s.headerButton}
            hitSlop={8}
            onPress={back}
          >
            <Text style={s.back}>‹</Text>
          </Pressable>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={s.headerTitle}
          >
            A fresher kind of local
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              saved
                ? "Remove product from favourites"
                : "Save product to favourites"
            }
            disabled={saved === null || saveBusy}
            style={s.headerButton}
            onPress={() => void toggleFavourite()}
            hitSlop={8}
          >
            <Text style={s.heart}>{saved ? "♥" : "♡"}</Text>
          </Pressable>
        </View>
        <ScrollView
          testID="product-scroll"
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
        >
          {saveError ? (
            <Text style={s.error}>
              Favourite could not be saved. Tap the heart to retry.
            </Text>
          ) : null}
          <View testID="product-gallery" style={s.gallery}>
            {images.length ? (
              <FlatList
                ref={gallery}
                style={{ height: galleryHeight }}
                data={images}
                horizontal
                pagingEnabled
                onContentSizeChange={() =>
                  gallery.current?.scrollToOffset({
                    offset: index * galleryWidth,
                    animated: false,
                  })
                }
                showsHorizontalScrollIndicator={false}
                keyExtractor={(uri) => uri}
                onMomentumScrollEnd={(event) =>
                  setIndex(
                    Math.round(
                      event.nativeEvent.contentOffset.x / galleryWidth,
                    ),
                  )
                }
                renderItem={({ item: uri }) => (
                  <View style={{ width: galleryWidth, height: galleryHeight }}>
                    {failedImages.has(uri) ? (
                      <View style={s.imageFallback}>
                        <Text style={s.secondary}>Image unavailable</Text>
                      </View>
                    ) : (
                      <Image
                        source={{ uri }}
                        style={s.image}
                        onError={() =>
                          setFailedImages((old) => new Set([...old, uri]))
                        }
                      />
                    )}
                  </View>
                )}
              />
            ) : (
              <View style={s.imageFallback}>
                <Text style={s.secondary}>Image unavailable</Text>
              </View>
            )}
            <View style={s.badge}>
              <Text style={s.badgeText}>
                {current.tags?.some((tag) => /^picked[- ]today$/i.test(tag))
                  ? "PICKED TODAY"
                  : offer && offer.stock > 0
                    ? "IN STOCK"
                    : "OUT OF STOCK"}
              </Text>
            </View>
          </View>
          <View style={s.dots}>
            {images.map((uri, number) => (
              <Pressable
                key={uri}
                accessibilityRole="button"
                accessibilityLabel={`Image ${number + 1} of ${images.length}`}
                accessibilityState={{ selected: index === number }}
                onPress={() => {
                  setIndex(number);
                  gallery.current?.scrollToOffset({
                    offset: number * galleryWidth,
                    animated: true,
                  });
                }}
                hitSlop={6}
                style={[s.dot, index === number && s.dotActive]}
              />
            ))}
          </View>
          <Text style={s.title}>{current.name}</Text>
          <Text style={s.description}>
            {current.description || current.unit}
          </Text>
          <View style={s.prices}>
            <Text style={s.price}>
              {offer ? `₹${offer.price.toLocaleString("en-IN")}` : "—"}
            </Text>
            {discount !== null && mrp ? (
              <>
                <Text style={s.mrp}>₹{mrp.toLocaleString("en-IN")}</Text>
                <Text style={s.discount}>{discount}% less than MRP</Text>
              </>
            ) : null}
          </View>
          <Text style={s.packLabel}>Choose a pack</Text>
          <View style={s.packs}>
            {packOptions.map((option) => {
              const row = offerForPack(current, option.key);
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="radio"
                  accessibilityLabel={`Pack ${option.label}`}
                  accessibilityState={{
                    checked: pack === option.key,
                    disabled: !row,
                  }}
                  disabled={!row}
                  onPress={() => {
                    setPack(option.key);
                    setFeedback(false);
                  }}
                  style={[
                    s.pack,
                    pack === option.key && s.packActive,
                    !row && { opacity: 0.45 },
                  ]}
                >
                  <Text
                    style={[
                      s.packText,
                      pack === option.key && s.packTextActive,
                    ]}
                  >
                    {option.label} · ₹
                    {(row?.price ?? 0).toLocaleString("en-IN")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.compareTitle}>Compare nearby shops</Text>
          <Text style={s.compareCopy}>
            Same {offer?.label ?? defaultPack} pack. Your choice of neighbour.
          </Text>
          <View style={s.compareCard}>
            {offers.map((row, number) => {
              const shop = shops.find(
                (candidate) => candidate.id === row.product.shopId,
              );
              const selected = current.id === row.product.id;
              const details = shop as
                | (Shop & { deliveryEstimate?: string; scheduleLabel?: string })
                | undefined;
              const info = [
                typeof shop?.distanceKm === "number"
                  ? `${shop.distanceKm.toFixed(1)} km`
                  : null,
                details?.deliveryEstimate ||
                  details?.scheduleLabel ||
                  (shop
                    ? shop.isOpen
                      ? "Open now"
                      : "Currently closed"
                    : null),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <View key={row.product.id}>
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityLabel={`Shop ${shop?.name ?? "Current seller"}`}
                    accessibilityState={{
                      checked: selected,
                      disabled: row.stock <= 0,
                    }}
                    disabled={row.stock <= 0}
                    onPress={() => {
                      setSellerId(row.product.id);
                      setFeedback(false);
                      setIndex(0);
                      gallery.current?.scrollToOffset({
                        offset: 0,
                        animated: false,
                      });
                    }}
                    style={s.shopRow}
                  >
                    <StoreIcon />
                    <View style={s.shopInfo}>
                      <Text numberOfLines={1} style={s.shopName}>
                        {shop?.name ?? "Current seller"}
                      </Text>
                      <Text numberOfLines={2} style={s.shopMeta}>
                        {row.stock <= 0
                          ? "Out of stock"
                          : info || "Delivery checked at checkout"}
                      </Text>
                      {offers.length > 1 &&
                      !comparing &&
                      !compareError &&
                      row.stock > 0 &&
                      shop?.isOpen &&
                      row.price === cheapest ? (
                        <View style={s.best}>
                          <Text style={s.bestText}>BEST NEARBY PRICE</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={[s.shopPrice, selected && { color: "#07552F" }]}
                    >
                      ₹{row.price.toLocaleString("en-IN")}
                    </Text>
                    <View style={[s.check, selected && s.checked]}>
                      {selected ? <Text style={s.checkText}>✓</Text> : null}
                    </View>
                  </Pressable>
                  {number < offers.length - 1 ? (
                    <View style={s.divider} />
                  ) : null}
                </View>
              );
            })}
          </View>
          {comparing ? (
            <ActivityIndicator style={{ marginTop: 12 }} color="#07552F" />
          ) : compareError ? (
            <Pressable onPress={retry}>
              <Text style={s.error}>
                Nearby offers could not load. Tap to retry.
              </Text>
            </Pressable>
          ) : offers.length <= 1 ? (
            <Text style={s.comparisonNote}>
              No other verified equivalent offers are available.
            </Text>
          ) : null}
          <Text style={s.footerTitle}>From their shop to your kitchen.</Text>
          <Text style={s.footerCopy}>{footerCopy}</Text>
          {loadError ? (
            <Pressable onPress={retry}>
              <Text style={s.error}>{loadError} Tap to retry.</Text>
            </Pressable>
          ) : null}
        </ScrollView>
        <View style={s.ctaArea}>
          <Pressable
            testID="product-add"
            accessibilityRole="button"
            accessibilityLabel="Add selected product to bag"
            disabled={!canAdd}
            onPress={() => {
              if (offer && canAdd) {
                onAdd(offer.line);
                setFeedback(true);
              }
            }}
            style={[s.cta, !canAdd && { opacity: 0.55 }]}
          >
            <Text accessibilityLiveRegion="polite" style={s.ctaText}>
              {feedback
                ? "Added to bag"
                : !verified
                  ? loadError
                    ? "Product unavailable"
                    : "Checking availability…"
                  : !offer
                    ? "Pack unavailable"
                    : offer.stock <= 0
                      ? "Out of stock"
                      : quantity >= offer.stock
                        ? "Stock limit reached"
                        : "Add to bag"}
              {offer ? ` · ₹${offer.price.toLocaleString("en-IN")}` : ""}
            </Text>
            <Text style={s.ctaArrow}>→</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  headerButton: {
    width: 24,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  safe: { flex: 1, backgroundColor: "#FAF8F1" },
  header: {
    height: 64,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  back: { fontSize: 32, lineHeight: 34, color: "#07552F" },
  heart: { fontSize: 26, color: "#07552F" },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 24,
    lineHeight: 30,
    color: "#07552F",
    fontWeight: "600",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 15,
    paddingBottom: 24,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  gallery: {
    aspectRatio: 392 / 254,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#EAF0D9",
  },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  imageFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: 15,
    left: 15,
    paddingHorizontal: 12,
    height: 26,
    minWidth: 104,
    borderRadius: 14,
    backgroundColor: "#fff",
    justifyContent: "center",
  },
  badgeText: { fontSize: 8, color: "#07552F", fontWeight: "600" },
  secondary: { fontSize: 13, color: "#777D72" },
  dots: {
    height: 8,
    marginTop: 12,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    alignItems: "center",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#07552F",
  },
  dotActive: { backgroundColor: "#07552F" },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    color: "#202820",
    marginTop: 20,
  },
  description: { fontSize: 13, lineHeight: 18, color: "#777D72", marginTop: 4 },
  prices: {
    marginTop: 18,
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  price: { fontSize: 32, lineHeight: 38, fontWeight: "700", color: "#07552F" },
  mrp: { fontSize: 13, color: "#777D72", textDecorationLine: "line-through" },
  discount: { fontSize: 11, color: "#07552F", flexShrink: 1 },
  packLabel: { fontSize: 12, lineHeight: 16, color: "#777D72", marginTop: 12 },
  packs: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  pack: {
    minWidth: 102,
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#fff",
    justifyContent: "center",
  },
  packActive: { backgroundColor: "#EAF0D9" },
  packText: { fontSize: 12, lineHeight: 18, color: "#202820" },
  packTextActive: { fontWeight: "600", color: "#07552F" },
  compareTitle: {
    fontSize: 20,
    lineHeight: 26,
    color: "#202820",
    fontWeight: "600",
    marginTop: 30,
  },
  compareCopy: { fontSize: 12, lineHeight: 16, color: "#777D72", marginTop: 4 },
  compareCard: {
    marginTop: 15,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  shopRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  shopInfo: { flex: 1, minWidth: 0 },
  shopName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    color: "#202820",
  },
  shopMeta: { fontSize: 11, lineHeight: 16, color: "#777D72", marginTop: 3 },
  shopPrice: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "600",
    color: "#202820",
    marginLeft: 4,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#E4E8DB",
    marginLeft: 26,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  checked: { borderColor: "#07552F", backgroundColor: "#07552F" },
  checkText: { color: "#fff", fontSize: 12, lineHeight: 14, fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#E4E8DB", marginHorizontal: 17 },
  best: {
    alignSelf: "flex-start",
    marginTop: 6,
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "#EAF0D9",
    justifyContent: "center",
  },
  bestText: { fontSize: 7, color: "#07552F", fontWeight: "600" },
  comparisonNote: {
    fontSize: 11,
    lineHeight: 16,
    color: "#777D72",
    marginTop: 10,
  },
  footerTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    color: "#07552F",
    marginTop: 24,
  },
  footerCopy: { fontSize: 11, lineHeight: 16, color: "#777D72", marginTop: 6 },
  error: { fontSize: 11, lineHeight: 17, color: "#A33B28", marginTop: 10 },
  ctaArea: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 10,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  cta: {
    minHeight: 56,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: "#07552F",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  ctaText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#fff",
    fontWeight: "600",
    flexShrink: 1,
  },
  ctaArrow: { fontSize: 26, color: "#fff", lineHeight: 28 },
});
