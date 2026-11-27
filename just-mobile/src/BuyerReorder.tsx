import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { buyerApi, type BuyerOrder, type Product } from "./api";
import { theme } from "./theme";

type Preview = { key: string; name: string; oldPrice: number; qty: number; product?: Product; unavailableReason: string };
const keyFor = (id: string, variant?: string) => variant ? `${id}:${variant}` : id;
const price = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export function BuyerReorder({ order, token, areaId, bag, add, openBag }: {
  order: BuyerOrder; token: string; areaId: string;
  bag: (Product & {quantity: number})[];
  add: (product: Product, quantity: number) => void;
  openBag: () => void;
}) {
  const [preview, setPreview] = useState<Preview[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(0);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const lock = useRef(false);
  const review = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setPreview(undefined);
    setExcluded(new Set());
    setAdded(0);
    setError("");
    try {
      const saved = new Map<string, BuyerOrder["subOrders"][number]["lines"][number] & { shopId: string }>();
      for (const shop of order.subOrders) {
        if (shop.status === "cancelled") continue;
        for (const line of shop.lines) {
          const key = keyFor(line.productId, line.variantId);
          saved.set(key, {...line, shopId: shop.shopId, qty: Math.min(999, (saved.get(key)?.qty ?? 0) + line.qty)});
        }
      }
      if (!saved.size) { setPreview([]); return; }
      if (saved.size > 100) { setError("This order has too many items to review at once. Add items from each shop."); return; }
      const quote = await buyerApi.quoteReorder(token, areaId, [...saved.values()].map(({productId, variantId, qty}) => ({productId, variantId, qty})));
      const quotes = new Map(quote.lines.map(line => [keyFor(line.productId, line.variantId), line]));
      setPreview([...saved].map(([key, line]) => {
        const current = quotes.get(key);
        const item = current?.product;
        const shop = quote.shops.find(group => group.shop.id === item?.shopId)?.shop;
        const issue = current?.issues.find(issue => issue.code !== "INSUFFICIENT_STOCK")?.code;
        const valid = item?.shopId === line.shopId && shop?.isOpen && current?.unitPrice != null && current.availableStock != null &&
          !issue &&
          (!line.variantId || item.variants?.some(variant => variant.id === line.variantId));
        const unavailableReason = shop?.isOpen === false ? "Shop is closed"
          : issue === "OUT_OF_STOCK" ? "Out of stock"
          : issue === "VARIANT_UNAVAILABLE" ? "This pack is no longer available"
          : issue === "VARIANT_REQUIRED" ? "Choose a pack on the product page"
          : "Unavailable in this browsing area";
        return {
          key, name: [line.name, line.variantLabel].filter(Boolean).join(" · "), oldPrice: line.price, qty: line.qty,
          unavailableReason,
          product: valid ? {...item, id:key, productId:line.productId, variantId:line.variantId, unit:line.variantLabel ?? item.unit, price:current.unitPrice!, stock:current.availableStock!} : undefined,
        };
      }));
    } catch {
      setError("Couldn’t check current prices and stock. Try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  let slots = Math.max(0, 100 - bag.length);
  const rows = preview?.map(row => {
    const existing = bag.find(item => item.id === row.key);
    const full = !existing && slots === 0;
    const available = full ? 0 : Math.max(0, Math.min(row.qty,
      Math.min(999, row.product?.stock ?? 0) - (existing?.quantity ?? 0)));
    const selected = available > 0 && !excluded.has(row.key);
    if (selected && !existing) slots--;
    return {...row, available, full, selected};
  });
  const selection = rows?.filter(row => row.selected) ?? [];
  const count = selection.reduce((sum, row) => sum + row.available, 0);
  const subtotal = selection.reduce((sum, row) =>
    sum + Math.round((row.product?.price ?? 0) * 100) * row.available, 0) / 100;
  return <View style={s.card}>
    {rows ? <>
      <Text accessibilityRole="header" style={s.heading}>Review items</Text>
      {rows.length === 0 && <Text style={s.copy}>There are no items to buy again from this order.</Text>}
      {rows.map(row => <View key={row.key} style={s.row}>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={row.name}
          accessibilityState={{checked:row.selected, disabled:!row.available}}
          disabled={!row.available} style={s.choice} onPress={() => setExcluded(previous => {
            const next = new Set(previous);
            if (next.has(row.key)) next.delete(row.key);
            else next.add(row.key);
            return next;
          })}>
          <Text style={s.buttonText} accessible={false}>{row.selected ? "☑" : "☐"}</Text>
          <Text style={s.heading}>{row.name}</Text>
        </Pressable>
        {row.product ? <Text style={s.copy}>{price(row.product.price)} each{row.oldPrice !== row.product.price ? ` · Previously ${price(row.oldPrice)}` : ""} · {row.available ? `${row.available} of ${row.qty} can be added` : row.full ? "Bag has 100 different items" : "No additional stock available"}</Text>
          : <Text style={s.copy}>{row.unavailableReason}</Text>}
      </View>)}
      {rows.some(row => row.available > 0) && <>
        <View style={s.summary}>
          <Text style={s.heading}>Items subtotal</Text>
          <Text accessibilityLiveRegion="polite" style={s.heading}>{price(subtotal)}</Text>
        </View>
        <Text style={s.copy}>Delivery fees are shown at checkout.</Text>
        <Pressable accessibilityRole="button" disabled={!count} style={[s.button, !count && s.disabled]} onPress={() => {
          if (lock.current || !count) return;
          lock.current = true;
          try {
            selection.forEach(row => { if (row.product) add(row.product, row.available); });
            setPreview(undefined);
            setAdded(count);
          } finally { lock.current = false; }
        }}><Text style={s.buttonText}>{count ? `Add ${count} ${count === 1 ? "item" : "items"} to bag` : "Select items to add"}</Text></Pressable>
      </>}
      <Pressable accessibilityRole="button" onPress={() => setPreview(undefined)} style={s.button}><Text style={s.buttonText}>Close review</Text></Pressable>
    </> : <>
      {!!added && <>
        <Text accessibilityLiveRegion="polite" style={s.copy}>Added {added} {added === 1 ? "item" : "items"} to your bag.</Text>
        <Pressable accessibilityRole="button" onPress={openBag} style={s.button}><Text style={s.buttonText}>View bag</Text></Pressable>
      </>}
      {!!error && <Text accessibilityRole="alert" style={s.copy}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void review()} style={s.button}><Text style={s.buttonText}>{busy ? "Checking prices and stock…" : "Buy again"}</Text></Pressable>
    </>}
  </View>;
}

const s = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  row: { borderTopWidth: 1, borderColor: theme.border, paddingTop: 8, gap: 4 },
  choice: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 },
  summary: { borderTopWidth: 1, borderColor: theme.border, paddingTop: 12, flexDirection: "row", justifyContent: "space-between", gap: 8 },
  heading: { color: theme.ink, fontWeight: "700", flexShrink: 1 },
  copy: { color: theme.ink, lineHeight: 20 },
  button: { minHeight: 44, justifyContent: "center", alignItems: "center", padding: 8, backgroundColor: theme.selected, borderRadius: 12 },
  buttonText: { color: theme.accentInk, fontWeight: "700" },
  disabled: { opacity: 0.55 },
});
