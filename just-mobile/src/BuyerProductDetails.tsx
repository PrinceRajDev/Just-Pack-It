import { theme, themedStyles } from "./theme";
import { BuyerStateCard } from "./BuyerStateCard";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { StyleSheet,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { marketApi, type Category, type Product, type Shop } from "./api";
import { offerForPack, packKey, type DetailProduct } from "./productOffers";
import { resolveImage } from "./images";
import * as storage from "./deviceStorage";

export const BuyerProductContext = createContext<{
  areaId?: string;
  shops: Shop[];
  userId?: string;
  categories?: Category[];
  openShop?: (shop: Shop) => void;
  searchNearby?: (query: string) => void;
  openFavourites?: () => void;
}>({ shops: [] });
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
  const galleryWidth = Math.min(width, 600) - 40;
  const galleryHeight = (galleryWidth * 238) / 350;
  const baseId = item.productId ?? item.id;
  const [fresh, setFresh] = useState<DetailProduct>(item);
  const [verified, setVerified] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [shops, setShops] = useState<Shop[]>([]);
  const knownSellerId = context.shops.find((shop) => shop.id === fresh.shopId)?.id;
  const [requestedPack, setRequestedPack] = useState(item.variantId);
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
      if (
        context.areaId &&
        knownSellerId !== product.shopId
      ) {
        let cursor: string | undefined;
        const seen = new Set<string>();
        do {
          const page = await marketApi
            .searchShops(context.areaId, "", cursor)
            .catch(() => null);
          if (!active || !page) break;
          const seller = page.items.find((shop) => shop.id === product.shopId);
          if (seller) {
            setShops([seller]);
            break;
          }
          if (!page.cursor || seen.has(page.cursor)) break;
          seen.add(page.cursor);
          cursor = page.cursor;
        } while (active);
      }
    })().catch((reason) => {
      if (active) {
        setLoadError(
          reason instanceof Error ? reason.message : "Product is unavailable.",
        );
      }
    });
    return () => {
      active = false;
    };
  }, [baseId, context.areaId, knownSellerId, attempt]);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(false), 2000);
    return () => clearTimeout(timer);
  }, [feedback]);
  const current = fresh;
  const requestedOffer = requestedPack
    ? offerForPack(current, requestedPack)
    : null;
  const defaultVariant =
    current.variants?.find(
      (variant) => variant.stock > 0 && packKey(variant.label) === packKey("1 kg"),
    ) ??
    current.variants?.find((variant) => variant.stock > 0) ??
    current.variants?.[0];
  const pack = requestedOffer
    ? (requestedOffer.variant?.id ?? packKey(current.unit))
    : (defaultVariant?.id ?? packKey(current.unit));
  const offer = offerForPack(current, pack);
  const packOptions = fresh.variants?.length
    ? fresh.variants.map((variant) => ({
        label: variant.label,
        key: variant.id,
      }))
    : [{ label: fresh.unit, key: packKey(fresh.unit) }];
  const seller = [...context.shops, ...shops].find((shop) => shop.id === current.shopId);
  const quantity = offer
    ? (bag.find((line) => line.id === offer.line.id)?.quantity ?? 0)
    : 0;
  const canAdd = verified && !!offer && offer.stock > quantity;
  const images = [
    ...new Set(
      [current.image, ...((current as DetailProduct).images ?? [])]
        .map(resolveImage)
        .filter((value): value is string => !!value),
    ),
  ];
  const categoryName = context.categories?.find(
    (category) => category.slug === current.categorySlug,
  )?.name;
  const taxesIncluded = current.taxInclusive === true;
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
            Product details
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
          {verified && offer && offer.stock <= 0 && <BuyerStateCard title="This pack is out of stock" copy="Try another seller or pack." tone="warning" icon="pack" compact action={context.searchNearby ? "View other sellers" : undefined} onAction={() => { back(); context.searchNearby?.(current.name); }} />}
          {verified && offer && offer.stock > 0 && quantity >= offer.stock && <BuyerStateCard title="You’ve reached the stock limit" copy={`Only ${offer.stock} available from this shop.`} tone="warning" icon="pack" compact />}
          {saved === true && <BuyerStateCard title="Saved to your favourites" copy="This product is saved on your device. Tap the filled heart to unsave." tone="success" icon="heart" compact action={context.openFavourites ? "View favourites" : undefined} onAction={() => { back(); context.openFavourites?.(); }} />}
          {verified && !loadError && offer && offer.stock > quantity && !saved && !!seller && <BuyerStateCard title="Available at one nearby shop" copy={`${seller?.name ?? "This shop"} is the seller for this listing.`} tone="info" icon="pack" compact />}
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
          <View style={s.summary}>
            {categoryName ? (
              <Text style={s.description}>
                {categoryName}
                {seller ? "  ·  " : ""}
              </Text>
            ) : null}
            {seller ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Visit ${seller.name}`}
                onPress={() => {
                  back();
                  context.openShop?.(seller);
                }}
              >
                <Text style={s.description}>Sold by {seller.name}</Text>
              </Pressable>
            ) : null}
          </View>
          {current.description && !categoryName && !seller ? (
            <Text style={s.description}>{current.description}</Text>
          ) : null}
          <Text style={s.price}>
            {offer ? `₹${offer.price.toLocaleString("en-IN")}` : "—"}
          </Text>
          {taxesIncluded ? (
            <Text style={s.tax}>Inclusive of all taxes</Text>
          ) : null}
          <Text style={s.packLabel}>Choose a pack</Text>
          <View style={s.packs}>
            {packOptions.map((option) => {
              const row = offerForPack(current, option.key);
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="radio"
                  accessibilityLabel={`Pack ${option.label}`}
                  aria-checked={pack === option.key}
                  accessibilityState={{
                    checked: pack === option.key,
                    disabled: !row,
                  }}
                  disabled={!row}
                  onPress={() => {
                    setRequestedPack(option.key);
                    setFeedback(false);
                  }}
                  style={[
                    s.pack,
                    pack === option.key && s.packActive,
                    !row && { opacity: 0.45 },
                  ]}
                >
                  <Text style={s.packText}>
                    {option.label} · ₹
                    {(row?.price ?? 0).toLocaleString("en-IN")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {verified && offer ? (
            <Text accessibilityLiveRegion="polite" style={[s.stock, offer.stock <= 0 && s.stockUnavailable]}>
              {offer.stock > 0
                ? `In stock · ${offer.stock} ${offer.stock === 1 ? "pack" : "packs"} available`
                : "Out of stock"}
            </Text>
          ) : null}
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
            style={[s.cta, !canAdd && s.ctaDisabled]}
          >
            <Text accessibilityLiveRegion="polite" style={[s.ctaText, !canAdd && s.ctaDisabledText]}>
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
                        : "Add to Bag"}
              {offer ? ` · ₹${offer.price.toLocaleString("en-IN")}` : ""}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const s = themedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.canvas },
  header: {
    height: 60,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  headerButton: {
    width: 24,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  back: { fontSize: 30, lineHeight: 34, color: theme.accentInk },
  heart: { fontSize: 26, color: theme.accentInk },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 21,
    lineHeight: 28,
    color: theme.accentInk,
    fontWeight: "600",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  gallery: {
    aspectRatio: 350 / 238,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: theme.selected,
  },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  imageFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  secondary: { fontSize: 13, color: theme.muted },
  dots: {
    height: 10,
    marginTop: 24,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: theme.accentInk,
  },
  dotActive: { backgroundColor: theme.primary },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    color: theme.ink,
    marginTop: 26,
  },
  summary: { flexDirection: "row", flexWrap: "wrap", marginTop: 22 },
  description: { fontSize: 12, lineHeight: 18, color: theme.muted },
  price: {
    marginTop: 22,
    fontSize: 30,
    lineHeight: 37,
    fontWeight: "700",
    color: theme.accentInk,
  },
  tax: { marginTop: 22, fontSize: 11, lineHeight: 16, color: theme.muted },
  packLabel: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
    color: theme.ink,
    marginTop: 20,
  },
  packs: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 20 },
  pack: {
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 51,
    padding: 10,
    borderRadius: 14,
    backgroundColor: theme.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  packActive: { backgroundColor: theme.selected },
  packText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: theme.accentInk,
    textAlign: "center",
  },
  stock: {
    marginTop: 18,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: theme.accentInk,
  },
  stockUnavailable: { color: theme.ink },
  ctaDisabled: { backgroundColor: theme.closed },
  ctaDisabledText: { color: theme.ink },
  error: { fontSize: 11, lineHeight: 17, color: theme.error, marginTop: 10 },
  ctaArea: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    backgroundColor: theme.surface,
  },
  cta: {
    minHeight: 50,
    padding: 12,
    borderRadius: 14,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 15,
    lineHeight: 20,
    color: theme.onPrimary,
    fontWeight: "600",
    textAlign: "center",
  },
}));
