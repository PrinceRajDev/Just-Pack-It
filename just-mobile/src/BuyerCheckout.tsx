import { theme, themedStyles } from "./theme";
import { BuyerStateCard } from "./BuyerStateCard";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useAndroidBack } from "./useAndroidBack";
import { BuyerBag, type BuyerBagProps } from "./BuyerBag";
import { PlaceCodOrder } from "./PlaceCodOrder";
import { BuyerAddresses } from "./BuyerAddresses";
import { ChooseDeliveryAddress } from "./ChooseDeliveryAddress";
import * as storage from "./deviceStorage";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  ApiError,
  buyerApi,
  type Address,
  type BuyerOrder,
  type BuyerProfile,
  type CheckoutReview,
  type Product,
  type Session,
  type Shop,
} from "./api";
import { CheckoutHeading, DeliveryAddressContents } from "./CheckoutPresentation";
import { OrderSymbol } from "./BuyerOrderDetails";

export type BagDelivery = {
  address?: Address;
  contact: string;
  total: number | null;
  checking: boolean;
  blocked: boolean;
  unavailable: { id: string; name: string; reason?: string }[];
  error: string | null;
  change: () => void;
  saved: () => void;
  retry: () => void;
  checkout: () => void;
  itemNotices: Map<string, RecoveryNotice>;
  shopNotices: Map<string, RecoveryNotice>;
  addressIssue?: string;
  feeChanges: Map<string, string>;
  acceptFees: () => void;
};
type RecoveryNotice = { title: string; copy: string; action: string; run: () => void };

export function BuyerCheckout({
  session,
  areaId,
  bag,
  shops,
  back,
  account,
  onConfirmed,
  openOrders,
  acceptPrice, openShop,
  hindi, inBag, openCheckout, bagActions,
}: {
  inBag: boolean;
  hindi: boolean;
  openCheckout: () => void;
  bagActions: Pick<BuyerBagProps, "onBack" | "onSignIn" | "onChange" | "onBrowse">;
  session: Session | null;
  areaId?: string;
  bag: (Product & { quantity: number })[];
  shops: Shop[];
  back: () => void;
  account: () => void;
  onConfirmed: (order: BuyerOrder, contact: string) => void;
  openOrders: () => void;
  acceptPrice: (id: string, price: number) => void;
  openShop: (shop: Shop) => void;
}) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [defaultId, setDefaultId] = useState<string>();
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [review, setReview] = useState<CheckoutReview | null>(null);
  const [reviewedAddress, setReviewedAddress] = useState<Address | null>(null);
  const [changedQuote, setChangedQuote] = useState<number | null>(null);
  const [feeBaseline, setFeeBaseline] = useState<CheckoutReview["fulfilments"]>();
  const [addressError, setAddressError] = useState<string>();
  const [placing, setPlacing] = useState(false);
  const [placementError, setPlacementError] = useState<{message:string; uncertain:boolean; retry:()=>void; code?:string} | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [quoteKey, setQuoteKey] = useState("");
  const [requestedKey, setRequestedKey] = useState("");
  const [editor, setEditor] = useState<{ address?: Address } | null>(null);
  const [addressRevision, setAddressRevision] = useState(0);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const preferenceKey = session
    ? `jpi.address.default.${session.userId}`
    : undefined;
  const preferred =
    addresses.find((address) => address.id === defaultId) ??
    addresses.find(
      (address) => address.label.trim().toLowerCase() === "home",
    ) ??
    addresses[0];
  const selected =
    addresses.find((address) => address.id === selectedId) ?? preferred;

  const currentKey = selected && areaId && bag.length
    ? JSON.stringify([session?.userId, areaId, selected.id, selected.version, bag.map(line => [line.id, line.variantId, line.quantity])])
    : "";
  const currentReview = quoteKey === currentKey ? review : null;

  const reload = () => {
    setError(null);
    setRequestedKey("");
    setAddressError(undefined);
    setAddressesLoading(true);
    setAddressRevision((value) => value + 1);
  };

  useEffect(() => {
    if (!session || !preferenceKey) return;
    let active = true;
    void Promise.all([
      buyerApi.addresses(session.token),
      storage.getItemAsync(preferenceKey).catch(() => null),
    ])
      .then(([items, savedDefault]) => {
        if (!active) return;
        setAddresses(items);
        setDefaultId(savedDefault ?? undefined);
      })
      .catch(() => {
        if (active)
          setError(
            "Saved addresses could not load. Tap Reload addresses to retry.",
          );
      })
      .finally(() => {
        if (active) setAddressesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session, preferenceKey, addressRevision]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void buyerApi
      .profile(session.token)
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [session]);

  const saveEdited = (address: Address, makeDefault: boolean) => {
    setAddresses((items) =>
      items.some((item) => item.id === address.id)
        ? items.map((item) => (item.id === address.id ? address : item))
        : [...items, address],
    );
    setSelectedId(address.id);
    setEditor(null);
    if (reviewedAddress?.id === address.id) setReview(null);
    setError(null);
    if (!preferenceKey || (!makeDefault && defaultId !== address.id)) return;
    const persist = makeDefault
      ? storage.setItemAsync(preferenceKey, address.id)
      : storage.deleteItemAsync(preferenceKey);
    void persist
      .then(() => setDefaultId(makeDefault ? address.id : undefined))
      .catch(() =>
        setError(
          "Address saved. The default preference could not be saved on this device.",
        ),
      );
  };

  const closePicker = () => {
    if (busyRef.current) return;
    if (editor) setEditor(null);
    else if (inBag) {
      setSelectedId(reviewedAddress?.id ?? preferred?.id);
      setChoosing(false);
    } else if (review && reviewedAddress) {
      setSelectedId(reviewedAddress.id);
      setChoosing(false);
    } else back();
  };

  const check = async (closeAfter = false) => {
    if (!session || !selected || !areaId || !bag.length || busyRef.current)
      return;
    busyRef.current = true;
    setRequestedKey(currentKey);
    setQuoteKey("");
    setBusy(true);
    setError(null);
    setAddressError(undefined);
    try {
      const items = bag.map(line => ({
        productId: line.productId ?? line.id, variantId: line.variantId, qty: line.quantity,
      }));
      const result = await buyerApi.reviewCheckout(
        session.token,
        areaId,
        selected,
        items,
        [...new Set(bag.map((line) => line.shopId))],
      ).catch(async (reason: unknown): Promise<CheckoutReview> => {
        if (!(reason instanceof ApiError) || reason.code !== "INVALID_SHOP_SELECTION") throw reason;
        const cart = await buyerApi.quoteReorder(session.token, areaId, items);
        return {
          ...cart, checkoutAvailable: false, deliveryTotal: null, grandTotal: null,
          paymentMethods: [], issues: [], fulfilments: [],
        };
      });
      if (reviewedAddress?.id !== selected.id) {
        setFeeBaseline(undefined);
        setChangedQuote(null);
      } else if (review) {
        setFeeBaseline(previous => [
          ...(previous ?? []),
          ...review.fulfilments.filter(row => !previous?.some(item => item.shopId === row.shopId)),
        ]);
        if (!inBag && review.grandTotal != null && result.grandTotal != null && result.grandTotal !== review.grandTotal)
          setChangedQuote(previous => previous ?? review.grandTotal);
      }
      setReviewedAddress(selected);
      setReview(result);
      setQuoteKey(currentKey);
      if (closeAfter) setChoosing(false);
    } catch (reason) {
      if (reason instanceof ApiError && (reason.code === "ADDRESS_CHANGED" || reason.code === "NOT_FOUND")) {
        setAddressError(reason.message);
      } else {
        setError(reason instanceof Error ? reason.message : "Delivery check failed");
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const autoCheck = useEffectEvent(() => { void check(); });
  useEffect(() => {
    if (!inBag || choosing || addressesLoading || busy || !currentKey || requestedKey === currentKey) return;
    const timer = setTimeout(() => autoCheck(), 120);
    return () => clearTimeout(timer);
  }, [inBag, choosing, addressesLoading, busy, currentKey, requestedKey]);

  const issues = currentReview
    ? [...currentReview.issues, ...currentReview.lines.flatMap((line) => line.issues)]
    : [];
  const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
  const shopCounts = new Map<string, number>();
  for (const line of bag)
    shopCounts.set(
      line.shopId,
      (shopCounts.get(line.shopId) ?? 0) + line.quantity,
    );
  const shopIds = [...shopCounts.keys()];
  const total = currentReview?.grandTotal ?? null;
  const hasCod = currentReview?.paymentMethods.includes("cod") ?? false;
  const hasDelivery =
    shopIds.length > 0 &&
    shopIds.every((id) => {
      const group = currentReview?.shops.find((row) => row.shop.id === id);
      const delivery = currentReview?.fulfilments.find((row) => row.shopId === id);
      return (
        !!group &&
        !group.issues.length &&
        delivery?.listedFee != null &&
        !delivery.issues.length
      );
    });
  const openPicker = () => {
    setPlacementError(previous => previous?.uncertain ? previous : null);
    setSaved(false);
    setError(null);
    setChoosing(true);
  };
  useAndroidBack(() => placing, 20);
  const contact = profile
    ? [
        profile.name,
        profile.phone?.replace(/^\+91([6-9]\d{4})(\d{5})$/, "$1 $2"),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const unavailable = currentReview ? shopIds.flatMap(id => {
    const group = currentReview.shops.find(row => row.shop.id === id);
    const delivery = currentReview.fulfilments.find(row => row.shopId === id);
    return delivery && (delivery.listedFee == null || delivery.issues.length)
      ? [{ id, name: group?.shop.name ?? shops.find(shop => shop.id === id)?.name ?? "Local shop", reason: delivery.issues[0]?.message }]
      : [];
  }) : [];
  const checking = !!session && (addressesLoading || busy || (!!currentKey && requestedKey !== currentKey));
  const changes = currentReview?.lines.flatMap(quoted => {
    const item = bag.find(line => (line.productId ?? line.id) === quoted.productId && line.variantId === quoted.variantId);
    return item ? [{ item, quoted }] : [];
  }) ?? [];
  const itemNotices = new Map<string, RecoveryNotice>();
  for (const { item, quoted } of changes) {
    const { availableStock, unitPrice } = quoted;
    const remove = () => bagActions.onChange(item.id, -item.quantity);
    if (availableStock === 0 || quoted.issues.some(issue => issue.code === "PRODUCT_UNAVAILABLE" || issue.code === "VARIANT_UNAVAILABLE" || issue.code === "VARIANT_REQUIRED")) {
      itemNotices.set(item.id, { title: "Item unavailable", copy: quoted.issues[0]?.message ?? "This item is out of stock.", action: "Remove from bag", run: remove });
    } else if (availableStock != null && availableStock < item.quantity) {
      itemNotices.set(item.id, { title: "Not enough stock", copy: `Only ${availableStock} available. You requested ${item.quantity}.`, action: "Update quantity", run: () => bagActions.onChange(item.id, availableStock - item.quantity) });
    } else if (unitPrice != null && unitPrice !== item.price) {
      itemNotices.set(item.id, { title: "A price has changed", copy: `Now ${money(unitPrice)} each, previously ${money(item.price)}.`, action: "Accept updated price", run: () => acceptPrice(item.id, unitPrice) });
    } else if (quoted.issues.length) {
      itemNotices.set(item.id, { title: "Check this item", copy: quoted.issues.map(issue => issue.message).join(" "), action: "Remove from bag", run: remove });
    }
  }
  const shopNotices = new Map<string, RecoveryNotice>();
  for (const group of currentReview?.shops ?? []) {
    const minimum = group.issues.find(issue => issue.code === "MINIMUM_NOT_MET");
    if (minimum) shopNotices.set(group.shop.id, { title: "Shop minimum not met", copy: minimum.message, action: "Add more from this shop", run: () => openShop(group.shop) });
  }
  const feeChanges = new Map<string, string>();
  for (const row of currentReview?.fulfilments ?? []) {
    const previous = feeBaseline?.find(item => item.shopId === row.shopId)?.listedFee;
    if (previous != null && row.listedFee != null && previous !== row.listedFee)
      feeChanges.set(row.shopId, `Delivery fee changed from ${money(previous)} to ${money(row.listedFee)}.`);
  }
  const acceptFees = () => {
    setFeeBaseline(currentReview?.fulfilments);
    setChangedQuote(null);
  };
  const addressIssue = addressError ?? currentReview?.issues.find(issue => issue.code === "ADDRESS_CHANGED")?.message;
  const ready = !busy && !itemNotices.size && !shopNotices.size && !feeChanges.size && !!currentReview?.checkoutAvailable && !issues.length && hasDelivery && hasCod && total !== null;
  const delivery: BagDelivery = {
    address: selected, contact, total, checking,
    blocked: !!selected && !ready,
    unavailable,
    itemNotices, shopNotices, feeChanges, acceptFees, addressIssue,
    error: error ?? (!checking && !unavailable.length && !addressIssue && !itemNotices.size && !shopNotices.size && !feeChanges.size && currentReview && !ready
      ? issues[0]?.message ?? currentReview.shops.flatMap(group => group.issues)[0]?.message ??
        "Cash on Delivery or delivery quote is unavailable. Try again."
      : null),
    change: openPicker,
    saved: () => { openPicker(); setSaved(true); },
    retry: () => { if (selected && !addressIssue) void check(); else reload(); },
    checkout: () => { if (!selected) openPicker(); else if (ready) openCheckout(); },
  };

  return (
    <View style={s.safe} testID={inBag ? undefined : "checkout-screen"}>
      <Modal
        visible={!!session && choosing}
        animationType="slide"
        onRequestClose={closePicker}
      >
        <SafeAreaProvider>
          <SafeAreaView testID="choose-address-safe" style={s.safe}>
            {session && editor ? (
              <BuyerAddresses
                token={session.token}
                back={() => setEditor(null)}
                checkout={{
                  address: editor.address,
                  profile,
                  isDefault:
                    !!editor.address && editor.address.id === defaultId,
                  onSaved: saveEdited,
                }}
              />
            ) : (
              <ChooseDeliveryAddress
                hindi={hindi}
                title={saved ? "Saved addresses" : reviewedAddress ? "Change address" : "Choose address"}
                rechecking={!!reviewedAddress}
                rows={addresses}
                selected={selected?.id}
                preferred={preferred?.id}
                profile={profile}
                busy={busy}
                loading={addressesLoading}
                error={
                  error ?? (!areaId ? "Choose a shopping area first" : null)
                }
                canDeliver={!!selected && !!areaId && !!bag.length}
                back={closePicker}
                select={(address) => {
                  setSelectedId(address.id);
                  setError(null);
                }}
                edit={(address) => setEditor({ address })}
                add={() => setEditor({})}
                confirm={() => void check(true)}
                reload={reload}
              />
            )}
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
      {inBag ? <BuyerBag {...bagActions} bag={bag} shops={shops} signedIn={!!session} delivery={delivery} hindi={hindi} /> : <>
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back from checkout"
          hitSlop={8}
          onPress={back}
          disabled={placing}
          style={s.backButton}
        >
          <Text style={s.arrow}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={s.headerText}>
          Checkout
        </Text>
      </View>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.page}
        testID="checkout-scroll"
      >
        {placing && <BuyerStateCard title="Placing your order…" copy="Please keep this screen open while we check your order." tone="info" compact busyLabel="Placing order…" />}
        {placementError && !placing && <BuyerStateCard title={placementError.uncertain ? "Let’s check before trying again." : "Your order wasn’t placed."} copy={placementError.message} tone={placementError.uncertain ? "warning" : "error"} icon={placementError.uncertain ? "clock" : "warning"} compact={!placementError.uncertain} action={placementError.uncertain ? "Check Orders" : placementError.code ? "Review checkout" : "Retry Place Order"} onAction={placementError.uncertain ? openOrders : placementError.code ? () => {
          setPlacementError(null);
          if (["ADDRESS_CHANGED", "ADDRESS_UNSERVICEABLE", "NOT_FOUND"].includes(placementError.code!)) {
            reload();
            openPicker();
          } else void check();
        } : placementError.retry} />}
        {(changedQuote !== null || feeChanges.size > 0) && total != null && <BuyerStateCard title="Delivery quote updated" copy={`Review the updated quote of ${money(total)} before placing your order.`} tone="warning" compact icon="wallet" action="Accept new quote" onAction={acceptFees} />}
        <CheckoutHeading title="One last look." icon="orders" />
        {!session ? (
          <Pressable
            accessibilityRole="button"
            onPress={account}
            style={[s.button, s.primary]}
          >
            <Text style={s.primaryText}>Sign in to continue</Text>
          </Pressable>
        ) : (
          <>
            <Section title="1 DELIVERY ADDRESS" />
            {reviewedAddress && (
              <View style={[s.card, s.selected]}>
                <DeliveryAddressContents address={reviewedAddress} contact={contact} selected />
              </View>
            )}
            {addressIssue && <BuyerStateCard title="Your saved address changed" copy={addressIssue} tone="warning" compact action="Review delivery address" onAction={() => { reload(); openPicker(); }} />}
            <Pressable
              accessibilityRole="button"
              onPress={openPicker}
              disabled={placing}
              style={[s.button, s.change]}
            >
              <Text style={s.action}>Change address</Text>
            </Pressable>
            {currentReview && (
              <>
                <Section title="2 SHOP-WISE DELIVERY" />
                <View style={s.card}>
                  {shopIds.map((id, index) => {
                    const group = currentReview.shops.find(
                      (row) => row.shop.id === id,
                    );
                    const delivery = currentReview.fulfilments.find(
                      (row) => row.shopId === id,
                    );
                    const count = shopCounts.get(id) ?? 0;
                    const available =
                      !!group &&
                      !group.issues.length &&
                      delivery?.listedFee != null &&
                      !delivery.issues.length;
                    const messages = [
                      ...new Set(
                        [
                          ...(group?.issues ?? []),
                          ...(delivery?.issues ?? []),
                        ].map((issue) => issue.message),
                      ),
                    ];
                    const name =
                      group?.shop.name ??
                      shops.find((shop) => shop.id === id)?.name ??
                      "Local shop";
                    return (
                      <View key={id} style={[s.shopRow, index > 0 && s.shopSpacing]}>
                        <View style={s.shopIcon}><OrderSymbol name="shop" /></View>
                        <View style={s.shopInfo}>
                        <Text style={s.shopTitle}>{name}</Text>
                        <Text style={[s.delivery, !available && s.error]}>
                          {count} {count === 1 ? "item" : "items"} · Rider
                          delivery{" "}
                          {available
                            ? `available · Fee ${money(delivery.listedFee!)}`
                            : "unavailable"}
                        </Text>
                        {messages.map((message) => (
                          <Text key={message} style={s.error}>
                            {message}
                          </Text>
                        ))}
                        {feeChanges.has(id) && <Text style={s.error}>{feeChanges.get(id)}</Text>}
                        {unavailable.some(shop => shop.id === id) && <Pressable accessibilityRole="button" onPress={openPicker}><Text style={s.action}>Choose another address</Text></Pressable>}
                        {shopNotices.has(id) && <Pressable accessibilityRole="button" onPress={shopNotices.get(id)?.run}><Text style={s.action}>{shopNotices.get(id)?.action}</Text></Pressable>}
                        {bag.filter(item => item.shopId === id && itemNotices.has(item.id)).map(item => {
                          const notice = itemNotices.get(item.id)!;
                          return <BuyerStateCard key={item.id} title={`${item.name} · ${notice.title}`} copy={notice.copy} tone="warning" compact action="Fix in bag" onAction={back} />;
                        })}
                        </View>
                      </View>
                    );
                  })}
                  <Text style={s.note}>
                    Fees are based on the current delivery quote.
                  </Text>
                </View>
                <Section title="3 PAYMENT METHOD" />
                <View style={[s.card, hasCod && s.paymentCard]}>
                  {hasCod ? (
                    <View style={s.shopRow}><View style={[s.shopIcon, s.wallet]}><OrderSymbol name="wallet" /></View><View style={s.shopInfo}>
                    <Text
                      accessibilityRole="radio"
                      aria-checked={true}
                      accessibilityState={{ checked: true }}
                      style={s.choice}
                    >
                      ◉ Cash on Delivery
                    </Text>
                    {total !== null && <Text style={s.delivery}>Pay {money(total)} to the rider when you receive your order.</Text>}
                    </View></View>
                  ) : (
                    <Text style={s.error}>
                      Cash on Delivery is unavailable for this checkout.
                    </Text>
                  )}
                </View>
                {[...new Set([
                  ...currentReview.issues.filter(issue => issue.code !== "ADDRESS_CHANGED"),
                  ...currentReview.lines.filter(line => !changes.some(change => change.quoted === line)).flatMap(line => line.issues),
                ].map(issue => issue.message))].map(
                  (message) => (
                    <Text key={message} style={s.error}>
                      {message}
                    </Text>
                  ),
                )}
                <View style={s.card}>
                  <Text style={s.shopTitle}>Order summary</Text>
                  <Text style={s.copy}>
                    Items: {money(currentReview.itemsSubtotal)}
                  </Text>
                  <Text style={s.copy}>
                    Delivery:{" "}
                    {currentReview.deliveryTotal === null
                      ? "Unavailable"
                      : money(currentReview.deliveryTotal)}
                  </Text>
                  {total !== null && (
                    <Text style={s.contact}>Total: {money(total)}</Text>
                  )}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
      {session && currentReview && (
        <View style={s.footer} testID="checkout-footer">
          {ready && changedQuote === null && (!placementError || placementError.uncertain || !placementError.code) &&
          !issues.length &&
          hasDelivery &&
          hasCod &&
          total !== null &&
          areaId &&
          reviewedAddress ? (
            <>
              <Text style={s.paymentSummary}>
                Cash on Delivery · {money(total)} due at delivery
              </Text>
              <PlaceCodOrder
                key={`${reviewedAddress.id}:${reviewedAddress.version}:${total}`}
                session={session}
                areaId={areaId}
                address={reviewedAddress}
                total={total}
                items={bag.map((line) => ({
                  productId: line.productId ?? line.id,
                  variantId: line.variantId,
                  qty: line.quantity,
                }))}
                shopIds={shopIds}
                onBusy={setPlacing}
                onFailure={setPlacementError}
                onConfirmed={(order) => onConfirmed(order, contact)}
              />
            </>
          ) : (
            <>
              <Text style={s.error}>
                Review delivery and payment availability before placing your
                order.
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled
                style={[s.button, s.primary, s.disabled]}
              >
                <Text style={s.primaryText}>Place Order</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
      </>}
    </View>
  );
}

function Section({ title }: { title: string }) {
  return <View style={s.sectionRow}><Text style={s.section}>{title}</Text><View style={s.rule} /></View>;
}

const s = themedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.canvas },
  header: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  backButton: { minHeight: 44, justifyContent: "center" },
  arrow: { color: theme.accentInk, fontSize: 27, lineHeight: 30 },
  headerText: { color: theme.accentInk, fontSize: 18, fontWeight: "500" },
  scroll: { flex: 1 },
  page: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 16 },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  rule: { backgroundColor: theme.border, height: 1, flex: 1 },
  selected: { borderColor: theme.accentInk },
  paymentCard: { backgroundColor: theme.selected, borderColor: theme.accentInk },
  change: { alignSelf: "flex-end", backgroundColor: theme.selected, minHeight: 40, paddingHorizontal: 22, paddingVertical: 8 },
  shopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  shopInfo: { flex: 1 },
  shopIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: theme.selected, alignItems: "center", justifyContent: "center" },
  wallet: { backgroundColor: theme.surface, width: 40, height: 40 },
  section: {
    fontSize: 11,
    lineHeight: 15,
    color: theme.accentInk,
    fontWeight: "400",
  },
  card: {
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  choice: { color: theme.accentInk, fontSize: 16, fontWeight: "600", lineHeight: 22 },
  contact: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.ink,
    marginTop: 10,
    fontWeight: "600",
  },
  copy: { fontSize: 13, lineHeight: 18, color: theme.muted, marginTop: 9 },
  button: {
    minHeight: 50,
    padding: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface,
  },
  action: { color: theme.accentInk, fontSize: 15, fontWeight: "600" },
  primary: { backgroundColor: theme.primary },
  primaryText: { color: theme.onPrimary, fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  shopTitle: {
    color: theme.ink,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  delivery: { color: theme.accentInk, fontSize: 12, lineHeight: 17, marginTop: 3 },
  shopSpacing: { marginTop: 12 },
  note: { color: theme.muted, fontSize: 10, lineHeight: 14, marginTop: 10 },
  footer: {
    backgroundColor: theme.surface,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: theme.border,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 8,
  },
  paymentSummary: {
    color: theme.accentInk,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  error: { color: theme.error, fontSize: 13, lineHeight: 18 },
}));
