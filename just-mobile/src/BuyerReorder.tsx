import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { buyerApi, type BuyerOrder, type Product } from "./api";
import { theme } from "./theme";

type Preview = { key: string; name: string; oldPrice: number; qty: number; product?: Product; closed: boolean };
const keyFor = (id: string, variant?: string) => variant ? `${id}:${variant}` : id;
const price = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export function BuyerReorder({ order, token, areaId, bag, add }: {
  order: BuyerOrder; token: string; areaId: string;
  bag: (Product & {quantity: number})[];
  add: (product: Product, quantity: number) => void;
}) {
  const [preview, setPreview] = useState<Preview[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(0);
  const lock = useRef(false);
  const review = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setPreview(undefined);
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
        const valid = item?.shopId === line.shopId && shop?.isOpen && current?.unitPrice != null && current.availableStock != null &&
          !current.issues.some(issue => issue.code !== "INSUFFICIENT_STOCK") &&
          (!line.variantId || item.variants?.some(variant => variant.id === line.variantId));
        return {
          key, name: [line.name, line.variantLabel].filter(Boolean).join(" · "), oldPrice: line.price, qty: line.qty,
          closed: shop?.isOpen === false,
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
    if (available && !existing) slots--;
    return {...row, available, full};
  });
  const count = rows?.reduce((sum, row) => sum + row.available, 0) ?? 0;
  return <View style={s.card}>
    {rows ? <>
      <Text accessibilityRole="header" style={s.heading}>Review items</Text>
      {rows.length === 0 && <Text style={s.copy}>There are no items to buy again from this order.</Text>}
      {rows.map(row => <View key={row.key} style={s.row}>
        <Text style={s.heading}>{row.name}</Text>
        {row.product ? <Text style={s.copy}>{price(row.product.price)} each{row.oldPrice !== row.product.price ? ` · Previously ${price(row.oldPrice)}` : ""} · {row.available ? `${row.available} of ${row.qty} can be added` : row.full ? "Bag has 100 different items" : "No additional stock available"}</Text>
          : <Text style={s.copy}>{row.closed ? "Shop is closed" : "Unavailable in this browsing area"}</Text>}
      </View>)}
      {count > 0 && <Pressable accessibilityRole="button" style={s.button} onPress={() => {
        if (lock.current) return;
        lock.current = true;
        try {
          rows.forEach(row => { if (row.product && row.available) add(row.product, row.available); });
          setPreview(undefined);
          setAdded(count);
        } finally { lock.current = false; }
      }}><Text style={s.buttonText}>Add {count} {count === 1 ? "item" : "items"} to bag</Text></Pressable>}
      <Pressable accessibilityRole="button" onPress={() => setPreview(undefined)} style={s.button}><Text style={s.buttonText}>Close review</Text></Pressable>
    </> : <>
      {!!added && <Text accessibilityLiveRegion="polite" style={s.copy}>Added {added} {added === 1 ? "item" : "items"} to your bag.</Text>}
      {!!error && <Text accessibilityRole="alert" style={s.copy}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void review()} style={s.button}><Text style={s.buttonText}>{busy ? "Checking prices and stock…" : "Buy again"}</Text></Pressable>
    </>}
  </View>;
}

const s = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  row: { borderTopWidth: 1, borderColor: theme.border, paddingTop: 8, gap: 4 },
  heading: { color: theme.ink, fontWeight: "700" },
  copy: { color: theme.ink, lineHeight: 20 },
  button: { minHeight: 44, justifyContent: "center", alignItems: "center", padding: 8, backgroundColor: theme.selected, borderRadius: 12 },
  buttonText: { color: theme.accentInk, fontWeight: "700" },
});
