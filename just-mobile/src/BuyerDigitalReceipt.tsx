import {useRef,useState} from "react";
import {Platform,Pressable,Share,StyleSheet,Text,View} from "react-native";
import {BuyerOrderSupport} from "./BuyerOrderSupport";
import type {BuyerOrder} from "./api";
import {theme} from "./theme";

const money = (value:number) => `₹${value.toLocaleString("en-IN")}`;
type ShopOrder = BuyerOrder["subOrders"][number];

function receiptLines(shop:ShopOrder, cod:boolean) {
  const cancelled = shop.status === "cancelled";
  const subtotal = shop.lines.reduce((sum,line) => sum + Math.round(line.price*100)*line.qty,0)/100;
  const removed = shop.substitution?.state === "removed" ? shop.substitution.original : undefined;
  const lines = shop.lines.map(line =>
    `${cancelled ? "Cancelled: " : ""}${line.name} · ${line.variantLabel || line.unit} × ${line.qty} · ${money(line.price)} each`);
  if (removed) lines.push(`Removed: ${removed.name} × ${removed.qty} · ${money(removed.price*removed.qty)}`);
  if (cancelled) {
    lines.push(`Delivery fee removed: ${money(shop.deliveryFee)}`, "Shop total: ₹0");
    if (shop.cancelReason) lines.push(shop.cancelReason);
  } else {
    lines.push(`Items subtotal: ${money(subtotal)}`, `Delivery fee: ${money(shop.deliveryFee)}`,
      `Shop total: ${money(subtotal+shop.deliveryFee)}`);
  }
  if (cod) lines.push(shop.cashCollection
    ? `Cash paid: ${money(shop.cashCollection.amount)}`
    : cancelled ? "No cash due for this shop." : "Cash payment not recorded.");
  if (shop.refund) lines.push(`Refund: ${money(shop.refund.amount)} · ${shop.refund.state.replaceAll("_"," ")}`);
  return lines;
}

export function BuyerDigitalReceipt({order,token}:{order:BuyerOrder;token:string}) {
  const [open,setOpen] = useState(false);
  const [shareStatus,setShareStatus] = useState("");
  const sharing = useRef(false);
  const shops = order.subOrders.filter(shop => shop.status === "delivered" || shop.status === "cancelled");
  const complete = shops.length === order.subOrders.length;
  const cod = order.paymentMethod === "cod";
  const date = new Date(order.createdAt).toLocaleDateString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium"});
  const groups = shops.map(shop => ({shop,lines:receiptLines(shop,cod)}));
  const share = async () => {
    if (sharing.current) return;
    sharing.current = true;
    setShareStatus("");
    const title = `JustPackIt order #${order.id}`;
    const message = [title,date,...(!complete ? ["Other shops are still in progress."] : []),
      ...groups.map(({shop,lines}) => [`${shop.shopName} · ${shop.status}`,...lines].join("\n"))].join("\n\n");
    try {
      if (Platform.OS !== "web") await Share.share({title,message});
      else if (navigator.share) await navigator.share({title,text:message});
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        setShareStatus("Receipt copied.");
      } else setShareStatus("Sharing is unavailable on this device.");
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === "AbortError"))
        setShareStatus("Couldn’t share the receipt. Try again.");
    } finally {
      sharing.current = false;
    }
  };
  return <View style={s.card}>
    <Pressable accessibilityRole="button" accessibilityState={{expanded:open}} style={s.action} onPress={() => setOpen(value=>!value)}>
      <Text style={s.link}>{open ? "Hide receipt" : "View receipt"}</Text>
    </Pressable>
    {open && <View style={s.content} testID="buyer-digital-receipt">
      <Text accessibilityRole="header" style={s.heading}>Shop-wise receipt</Text>
      <Text style={s.copy}>#{order.id} · {date}</Text>
      {!complete && <Text style={s.copy}>Other shops are still in progress.</Text>}
      {groups.map(({shop,lines}) => <View key={shop.id} style={s.shop} testID={`receipt-shop-${shop.id}`}>
        <Text accessibilityRole="header" style={s.heading}>{shop.shopName} · {shop.status === "delivered" ? "Delivered" : "Cancelled"}</Text>
        {lines.map((line,index) => <Text key={index} style={s.copy}>{line}</Text>)}
        <BuyerOrderSupport token={token} orderId={order.id} suborderId={shop.id} actionLabel="Report an issue" />
      </View>)}
      <Pressable accessibilityRole="button" style={s.action} onPress={() => void share()}>
        <Text style={s.link}>Share receipt</Text>
      </Pressable>
      {!!shareStatus && <Text accessibilityLiveRegion="polite" style={s.copy}>{shareStatus}</Text>}
    </View>}
  </View>;
}

const s=StyleSheet.create({
  card:{backgroundColor:theme.surface,borderRadius:16,borderWidth:1,borderColor:theme.border,padding:12},
  content:{gap:10,paddingTop:12},
  shop:{gap:6,paddingTop:12,borderTopWidth:1,borderColor:theme.border},
  heading:{color:theme.ink,fontSize:16,fontWeight:"700"},
  copy:{color:theme.ink,lineHeight:20},
  action:{minHeight:44,justifyContent:"center",alignItems:"center",paddingHorizontal:10,borderRadius:12,backgroundColor:theme.selected},
  link:{color:theme.accentInk,fontWeight:"700"},
});
