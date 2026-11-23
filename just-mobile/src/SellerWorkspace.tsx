import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { onSessionExpired, type Session } from "./api";
import { BuyerStateCard } from "./BuyerStateCard";
import { MarketIcon, type MarketIconName } from "./MarketIcon";
import { useAndroidBack } from "./useAndroidBack";
import { fulfilmentNames, orderStatusNames, sellerApi, type SellerOrder, type OrderStatus } from "./sellerApi";
import { rupees, styles, LoadState, MutationFeedback, Row, SellerButton, SellerCard, SellerField, SellerScroll, useSellerData, useSellerMutation, useSellerPages } from "./SellerWorkspaceUI";
import { SellerCatalogue, SellerShopSettings } from "./SellerStockAndShop";

type Tab = "Home" | "Orders" | "Catalogue" | "Settlements" | "Shop";
const tabs: {name: Tab; icon: MarketIconName}[] = [
  {name:"Home",icon:"home"},{name:"Orders",icon:"orders"},{name:"Catalogue",icon:"browse"},
  {name:"Settlements",icon:"bag"},{name:"Shop",icon:"account"},
];
const orderGroups = {
  Active: ["placed","accepted","preparing","ready","out_for_delivery"],
  New: ["placed"], Preparing: ["accepted","preparing"], Ready: ["ready"], Completed: ["delivered","cancelled"],
} satisfies Record<string, OrderStatus[]>;
type OrderGroup = keyof typeof orderGroups;
const statusLabels = { pending:"Under review", approved:"Approved", rejected:"Changes requested", suspended:"Suspended" };

export function SellerWorkspace({ session, back, signOut, expired }: { session: Session; back: () => void; signOut: () => Promise<void>; expired: () => void }) {
  const [tab, setTab] = useState<Tab>("Home");
  const [group, setGroup] = useState<OrderGroup>("Active");
  const [lowStock, setLowStock] = useState(false);
  useEffect(() => onSessionExpired(token => { if (token === session.token) expired(); }), [session.token, expired]);
  useAndroidBack(() => {
    if (tab === "Home") return false;
    setTab("Home");
    return true;
  }, 20);
  const goOrders = (group: OrderGroup) => { setGroup(group); setTab("Orders"); };
  const goTab = (next: Tab) => { setLowStock(false); setTab(next); };
  return <View style={styles.screen} testID="native-seller-workspace">
    <View style={styles.header}>
      <View style={styles.grow}><Text style={styles.eyebrow}>JustPackIt Seller</Text><Text accessibilityRole="header" style={styles.heading}>{tab === "Home" ? "Shop counter" : tab}</Text></View>
      <Pressable accessibilityRole="button" onPress={back} style={styles.tap}><Text style={styles.link}>Close</Text></Pressable>
    </View>
    <View style={styles.grow}>
      {tab === "Home" && <SellerHome token={session.token} orders={goOrders} open={goTab} openLowStock={() => { setLowStock(true); setTab("Catalogue"); }} />}
      {tab === "Orders" && <SellerOrders token={session.token} group={group} setGroup={setGroup} />}
      {tab === "Catalogue" && <SellerCatalogue token={session.token} lowStock={lowStock} />}
      {tab === "Settlements" && <SellerSettlements token={session.token} />}
      {tab === "Shop" && <SellerShopSettings token={session.token} name={session.name} signOut={signOut} />}
    </View>
    <View style={styles.nav}>{tabs.map(item => {
      const selected = tab === item.name;
      return <Pressable key={item.name} accessibilityRole="tab" accessibilityState={{selected}} onPress={() => { if (!selected) goTab(item.name); }} style={styles.navItem}>
        <View style={[styles.navIcon, selected && styles.sage]}><MarketIcon name={item.icon} color={selected ? "#174638" : "#5A655E"} /></View>
        <Text style={[styles.navLabel, selected && styles.link, styles.navText]}>{item.name}</Text>
      </Pressable>;
    })}</View>
  </View>;
}

function SellerHome({token,orders,open,openLowStock}: {token:string;orders:(group:OrderGroup)=>void;open:(tab:Tab)=>void;openLowStock:()=>void}) {
  const shop = useSellerData(() => sellerApi.shop(token), token);
  const dashboard = useSellerData(() => sellerApi.dashboard(token), token);
  return <SellerScroll>
    {shop.data && <View style={styles.hero}>
      <Pressable accessibilityRole="button" accessibilityLabel="Shop settings" onPress={() => open("Shop")} style={styles.heroTop}>
        <View style={styles.heroBadge}><View style={styles.statusDot} /><Text style={styles.heroBadgeText}>{shop.data.temporarilyClosed ? "Temporarily closed" : statusLabels[shop.data.status]}</Text></View>
        <Text style={styles.heroArrow}>↗</Text>
      </Pressable>
      <Text style={styles.heroTitle}>{shop.data.name}</Text>
      {!!shop.data.locality && <Text style={styles.heroKicker}>{shop.data.locality}</Text>}
      {dashboard.data && <View style={styles.heroMetrics}>
        <View style={styles.grow}><Text style={styles.heroNumber}>{dashboard.data.todayOrders}</Text><Text style={styles.heroKicker}>Orders today</Text></View>
        <View style={styles.metricDivider} />
        <View style={styles.grow}><Text style={styles.heroNumber}>{dashboard.data.pendingPayment}</Text><Text style={styles.heroKicker}>Awaiting payment</Text></View>
      </View>}
    </View>}
    <LoadState loading={shop.loading && !shop.data} error={shop.error} retry={shop.reload} />
    {shop.data && shop.data.status !== "approved" && <BuyerStateCard title={statusLabels[shop.data.status]} copy={shop.data.review?.reason || "You can prepare your catalogue and shop details while your shop status is reviewed."} tone="warning" compact icon="shop" action="Shop settings" onAction={() => open("Shop")} />}
    <LoadState loading={dashboard.loading && !dashboard.data} error={dashboard.error} retry={dashboard.reload} />
    {dashboard.data && <>
      <Text accessibilityRole="header" style={styles.section}>Work queue</Text>
      <View style={styles.queue}>
        <QueueTile title="New orders" count={dashboard.data.counts?.placed ?? 0} onPress={() => orders("New")} />
        <QueueTile title="To prepare" count={(dashboard.data.counts?.accepted ?? 0) + (dashboard.data.counts?.preparing ?? 0)} onPress={() => orders("Preparing")} />
        <QueueTile title="Ready for handoff" count={dashboard.data.counts?.ready ?? 0} onPress={() => orders("Ready")} />
        <QueueTile title="Low stock" count={dashboard.data.lowStock?.count ?? 0} onPress={openLowStock} />
      </View>
    </>}
    <Text accessibilityRole="header" style={styles.section}>Shop tools</Text>
    <SellerCard>
      <Row title="Manage catalogue" onPress={() => open("Catalogue")} />
      <Row title="Opening hours and shop settings" onPress={() => open("Shop")} />
    </SellerCard>
  </SellerScroll>;
}

function QueueTile({title,count,onPress}: {title:string;count:number;onPress:()=>void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${count}`} onPress={onPress}
    style={({pressed}) => [styles.queueTile, count > 0 && styles.queueActive, pressed && styles.pressed]}>
    <View style={styles.queueTop}><Text style={styles.queueNumber}>{count}</Text><Text style={styles.link}>↗</Text></View>
    <Text style={styles.label}>{title}</Text>
  </Pressable>;
}

function SellerOrders({token,group,setGroup}: {token:string;group:OrderGroup;setGroup:(value:OrderGroup)=>void}) {
  const listing = useSellerPages(sellerApi.orders, token);
  const [selected, setSelected] = useState<SellerOrder>();
  const [action, setAction] = useState<"cancel" | "cash" | "return" | "pickup">();
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [restock, setRestock] = useState(false);
  const mutation = useSellerMutation();
  const close = () => { setSelected(undefined); setAction(undefined); mutation.clear(); };
  useAndroidBack(() => { if (!selected) return false; if (!mutation.busy) close(); return true; }, 25);
  const rows = listing.data?.items.filter(row => (orderGroups[group] as OrderStatus[]).includes(row.status));
  if (selected) {
    const order = selected;
    const move = ({placed:"accepted",accepted:"preparing",preparing:"ready",ready:order.fulfilment==="seller_delivery" ? "out_for_delivery" : undefined} as Partial<Record<OrderStatus,OrderStatus>>)[order.status];
    const actionLabel = {placed:"Accept order",accepted:"Start packing",preparing:"Mark ready",ready:"Start delivery"}[order.status as "placed"|"accepted"|"preparing"|"ready"];
    const allowReceipt = order.fulfilment === "pickup" ? order.status === "ready" : order.fulfilment === "seller_delivery" && order.status === "out_for_delivery";
    const perform = (task:()=>Promise<unknown>) => void mutation.run(async () => { await task(); close(); listing.reload(); });
    const openAction = (value: typeof action) => { setAction(value); setReason(""); setCode(""); setRestock(false); mutation.clear(); };
    return <SellerScroll>
      <SellerButton label="Back to orders" soft onPress={close} disabled={mutation.busy} />
      <SellerCard><Text style={styles.eyebrow}>{orderStatusNames[order.status]}</Text><Text style={styles.title}>Order #{order.orderId.slice(-8).toUpperCase()}</Text><Text style={styles.copy}>{fulfilmentNames[order.fulfilment]} · {new Date(order.createdAt).toLocaleString("en-IN")}</Text>{order.delivery && <Text style={styles.copy}>Rider status · {order.delivery.state.replaceAll("_"," ")}</Text>}</SellerCard>
      {order.testMode && <BuyerStateCard title="Test order" copy="Skip physical fulfilment and cash collection." tone="warning" compact />}
      <Text style={styles.section}>Packing list</Text>
      <SellerCard>{order.lines.map((item,index) => <View key={index} style={styles.row}><View style={styles.grow}><Text style={styles.label}>{item.name}</Text><Text style={styles.copy}>{item.variantLabel || item.unit}</Text></View><Text style={styles.title}>×{item.qty}</Text></View>)}</SellerCard>
      <SellerCard><Text style={styles.title}>{order.paymentMethod === "razorpay" ? "Paid online" : order.cashCollection ? "Cash recorded" : "Cash on delivery"}</Text>
        <Text style={styles.copy}>Items {rupees(order.itemsSubtotal)} · Delivery {rupees(order.deliveryFee)}</Text>
        <Text style={styles.label}>Total {rupees(order.total)}{order.paymentMethod === "cod" && !order.cashCollection ? ` · Due ${rupees(order.amountDue)}` : ""}</Text>
        {order.refund && <Text style={styles.copy}>Refund {order.refund.state} · {rupees(order.refund.amount)}</Text>}
        {order.cancelReason && <Text style={styles.copy}>Cancellation · {order.cancelReason}</Text>}
      </SellerCard>
      {order.deliveryAddress && <SellerCard><Text style={styles.label}>Delivery address</Text><Text style={styles.copy}>{[order.deliveryAddress.line1,order.deliveryAddress.locality,order.deliveryAddress.city,order.deliveryAddress.pincode].filter(Boolean).join(", ")}</Text></SellerCard>}
      <MutationFeedback error={mutation.error} onReload={() => {close(); listing.reload();}} />
      {!order.testMode && !action && <>
        {move && <SellerButton label={actionLabel} onPress={() => perform(() => sellerApi.move(token,order,move))} disabled={mutation.busy} />}
        {(order.status === "placed" || order.status === "accepted") && <SellerButton label="Cancel order" soft onPress={() => openAction("cancel")} disabled={mutation.busy} />}
        {order.status === "ready" && order.fulfilment === "platform_delivery" && (order.delivery?.state === "claimed" ? <SellerButton label="Review rider handoff" onPress={() => openAction("pickup")} /> : <Text style={styles.copy}>Waiting for a platform rider to claim this order.</Text>)}
        {allowReceipt && <SellerButton label="Verify buyer receipt code" onPress={() => openAction("cash")} />}
        {order.delivery?.state === "returning" && <SellerButton label="Record goods received" soft onPress={() => openAction("return")} />}
      </>}
      {action && <SellerCard>
        {action === "pickup" && <><Text style={styles.title}>Confirm rider handoff</Text><Text style={styles.copy}>Match the rider to this assignment before handing over the packed order.</Text><Text selectable style={styles.label}>Rider ID · {order.delivery?.partnerId}</Text><SellerButton label="Confirm handoff" disabled={mutation.busy} onPress={() => perform(() => sellerApi.handoff(token,order))} /></>}
        {action === "cash" && <><SellerField label="Buyer receipt code" value={code} onChangeText={value => setCode(value.replace(/\D/g,""))} keyboardType="number-pad" maxLength={6} /><Text style={styles.copy}>{order.paymentMethod === "cod" ? `Confirm only after receiving ${rupees(order.amountDue)} in cash and handing over the items.` : "Confirm after giving the items to the buyer."}</Text><SellerButton label={order.paymentMethod === "cod" ? "Confirm handoff and cash received" : "Confirm handoff"} disabled={mutation.busy || code.length!==6} onPress={() => perform(() => sellerApi.complete(token,order,code))} /></>}
        {(action === "cancel" || action === "return") && <><SellerField label={action==="cancel" ? "Cancellation reason" : "Return reason"} value={reason} onChangeText={setReason} maxLength={500} multiline />
          {action === "return" && <SellerButton soft label={restock ? "✓ Restock saleable items" : "Restock saleable items"} onPress={() => setRestock(value => !value)} />}
          <SellerButton label={action==="cancel" ? "Confirm cancellation" : "Confirm goods received"} disabled={mutation.busy || reason.trim().length<3} onPress={() => perform(() => action==="cancel" ? sellerApi.move(token,order,"cancelled",reason.trim()) : sellerApi.returnGoods(token,order,reason.trim(),restock))} />
        </>}
        <SellerButton label="Go back" soft onPress={() => openAction(undefined)} disabled={mutation.busy} />
      </SellerCard>}
    </SellerScroll>;
  }
  return <SellerScroll>
    <View style={styles.chips}>{(Object.keys(orderGroups) as OrderGroup[]).map(name => <Pressable key={name} accessibilityRole="tab" accessibilityState={{selected:group===name}} onPress={() => setGroup(name)} style={[styles.chip,group===name && styles.sage]}><Text style={styles.link}>{name}</Text></Pressable>)}</View>
    <LoadState loading={listing.loading && !listing.data} error={listing.error} retry={listing.reload} />
    {!listing.loading && !listing.error && !rows?.length && <BuyerStateCard title="No orders in this view" copy={listing.data?.next ? "Load more orders to check earlier activity." : "Matching orders will appear here."} icon="orders" />}
    {rows?.map(order => {
      const reference = `Order #${order.orderId.slice(-8).toUpperCase()}`;
      const status = orderStatusNames[order.status];
      return <Pressable key={order.id} accessibilityRole="button" accessibilityLabel={`${reference}, ${status}`} onPress={() => setSelected(order)}
        style={({pressed}) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.orderTop}><Text style={styles.title}>{reference}</Text><Text style={styles.orderStatus}>{status}</Text></View>
        <Text style={styles.copy}>{fulfilmentNames[order.fulfilment]} · {order.lines.reduce((sum,item) => sum + item.qty,0)} items</Text>
        <View style={styles.orderTotal}>
          <Text style={styles.copy}>{order.testMode ? "Test order" : order.paymentMethod === "razorpay" ? "Paid online" : order.cashCollection ? "Cash recorded" : "Cash on delivery"}</Text>
          <Text style={styles.label}>{rupees(order.total)} ›</Text>
        </View>
      </Pressable>;
    })}
    {listing.data?.next && <SellerButton label={listing.moreBusy ? "Loading…" : "Load more orders"} soft disabled={listing.moreBusy} onPress={listing.more} />}
    <SellerButton label="Refresh orders" soft onPress={listing.reload} />
  </SellerScroll>;
}

function SellerSettlements({token}:{token:string}) {
  const listing = useSellerPages(sellerApi.settlements, token);
  return <SellerScroll>
    <Text style={styles.copy}>Recorded payments, seller entitlement and payout status.</Text>
    <LoadState loading={listing.loading && !listing.data} error={listing.error} retry={listing.reload} />
    {listing.data?.items.length === 0 && <BuyerStateCard title="No settlements yet" copy="Completed orders will appear here as the platform records them." icon="wallet" />}
    {listing.data?.items.map(row => <SellerCard key={row.id}><Text style={styles.title}>Order #{row.orderId.slice(-8).toUpperCase()}</Text><Text style={styles.eyebrow}>{row.payout?.state==="recorded" ? "Payout recorded" : row.payout?.state==="prepared" ? "Payout prepared" : row.posted ? "Statement posted" : "Pending review"}</Text>
      {[["Gross",row.grossAmount],["Seller entitlement",row.sellerEntitlement],["Platform delivery fee",row.platformDeliveryFee],["Cash retained",row.sellerRetained],["Payout amount",row.payoutAmount]].map(([label,value]) => typeof value==="number" ? <Text key={label} style={styles.copy}>{label} · {rupees(value)}</Text> : null)}
      {row.holdReason && <Text style={styles.copy}>{row.holdReason}</Text>}{row.payout?.reference && <Text selectable style={styles.copy}>Reference · {row.payout.reference}</Text>}
    </SellerCard>)}
    {listing.data?.next && <SellerButton label={listing.moreBusy ? "Loading…" : "Load more settlements"} soft disabled={listing.moreBusy} onPress={listing.more} />}
    <SellerButton label="Refresh statement" soft onPress={listing.reload} />
  </SellerScroll>;
}
