import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AppState, Image, Pressable, Text, TextInput, View } from "react-native";
import { onSessionExpired, type Session } from "./api";
import { BuyerStateCard } from "./BuyerStateCard";
import { useAndroidBack } from "./useAndroidBack";
import { fulfilmentNames, orderStatusNames, sellerApi, type SellerOrder, type OrderStatus, type Settlement } from "./sellerApi";
import { sellerShopApproval, sellerShopAvailability, rupees, styles, LoadState, MutationFeedback, Row, SellerButton, SellerCard, SellerField, SellerScroll, useSellerData, useSellerMutation, useSellerPages } from "./SellerWorkspaceUI";
import { SellerCatalogue, SellerShopSettings, type StockFilter } from "./SellerStockAndShop";

type Tab = "Home" | "Orders" | "Catalogue" | "Settlements" | "Shop";
const sellerIcons = {
  home: require("../assets/nav-icons/home.png"),
  orders: require("../assets/nav-icons/orders.png"),
  browse: require("../assets/nav-icons/browse.png"),
  bag: require("../assets/nav-icons/bag.png"),
  account: require("../assets/nav-icons/account.png"),
};
type SellerIconName = keyof typeof sellerIcons;
const tabs: {name: Tab; icon: SellerIconName}[] = [
  {name:"Home",icon:"home"},{name:"Orders",icon:"orders"},{name:"Catalogue",icon:"browse"},
  {name:"Settlements",icon:"bag"},{name:"Shop",icon:"account"},
];
const orderGroups = {
  Active: ["placed","accepted","preparing","ready","out_for_delivery"],
  New: ["placed"], Preparing: ["accepted","preparing"], Ready: ["ready"],
  "Out for delivery": ["out_for_delivery"], Completed: ["delivered","cancelled"],
  Delivered: ["delivered"], Cancelled: ["cancelled"],
} satisfies Record<string, OrderStatus[]>;
type OrderGroup = keyof typeof orderGroups;
const fulfilmentFilters = ["all","pickup","seller_delivery","platform_delivery"] as const;
const counterPhoto = require("../assets/seller-kirana-counter.jpg");
const dispatchPhoto = require("../assets/seller-dispatch-parcel.jpg");
const indiaTimeZone = "Asia/Kolkata";
const orderDate = new Intl.DateTimeFormat("en-IN", {
  day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit",timeZone:indiaTimeZone,
});
const packingStages = ["Accept", "Pack", "Handoff", "Complete"];
const packingProgress: Record<OrderStatus, number> = {
  placed:0, accepted:1, preparing:1, ready:2, out_for_delivery:2, delivered:3, cancelled:-1,
};
const orderNextStep: Partial<Record<OrderStatus,string>> = {
  placed:"Review order", accepted:"Start packing", preparing:"Continue packing", ready:"View handoff", out_for_delivery:"View delivery",
};
function readyRiderLabel(order: SellerOrder) {
  if (order.testMode || order.status !== "ready" || order.fulfilment !== "platform_delivery") return undefined;
  if (!order.delivery) return "Waiting for a rider";
  if (order.delivery.state === "claimed") return "Rider assigned";
  if (order.delivery.state === "picked_up") return "Picked up by rider";
  return undefined;
}
const statementFilters = ["All", "Recorded payouts", "Pending review"] as const;
function sellerPaymentLabel(order: SellerOrder) {
  if (order.paymentMethod === "razorpay") {
    return order.paymentStatus === "paid" ? "Paid online" : "Online payment pending";
  }
  if (order.cashCollection) return "Cash recorded";
  return order.status === "cancelled" ? "No cash to collect" : "Cash on delivery";
}

function sellerCashDue(order: SellerOrder) {
  return !order.testMode && order.paymentMethod === "cod" && !order.cashCollection
    && order.status !== "cancelled" && order.status !== "delivered" && order.amountDue > 0;
}

function sellerRefundLabel(order: SellerOrder) {
  if (!order.refund) return undefined;
  const state = order.refund.state.replaceAll("_"," ").trim();
  return `${state ? `Refund ${state}` : "Refund"} · ${rupees(order.refund.amount)}`;
}
const payoutDate = new Intl.DateTimeFormat("en-IN", {day:"numeric",month:"short",year:"numeric",timeZone:indiaTimeZone});

function orderTime(createdAt:string) {
  const time = Date.parse(createdAt);
  return Number.isNaN(time) ? "" : `${orderDate.format(time)} IST`;
}

function SellerIcon({name,color}: {name:SellerIconName;color:string}) {
  return <Image source={sellerIcons[name]} resizeMode="contain" accessible={false} style={[styles.sellerIcon,{tintColor:color}]} />;
}

export function SellerWorkspace({ session, back, signOut, expired }: { session: Session; back: () => void; signOut: () => Promise<void>; expired: () => void }) {
  const [tab, setTab] = useState<Tab>("Home");
  const [group, setGroup] = useState<OrderGroup>("Active");
  const [stockFilter, setStockFilter] = useState<StockFilter>();
  useEffect(() => onSessionExpired(token => { if (token === session.token) expired(); }), [session.token, expired]);
  useAndroidBack(() => {
    if (tab === "Home") return false;
    setTab("Home");
    return true;
  }, 20);
  const goOrders = (group: OrderGroup) => { setGroup(group); setTab("Orders"); };
  const goTab = (next: Tab) => { setStockFilter(undefined); setTab(next); };
  return <View style={styles.screen} testID="native-seller-workspace">
    <View style={styles.header}>
      <View style={styles.grow}><Text style={styles.eyebrow}>JustPackIt Seller</Text><Text accessibilityRole="header" style={styles.heading}>{tab === "Home" ? "Shop counter" : tab}</Text></View>
      <Pressable accessibilityRole="button" onPress={back} style={styles.tap}><Text style={styles.link}>Close</Text></Pressable>
    </View>
    <View style={styles.grow}>
      {tab === "Home" && <SellerHome token={session.token} orders={goOrders} open={goTab} openStock={filter => { setStockFilter(filter); setTab("Catalogue"); }} />}
      {tab === "Orders" && <SellerOrders token={session.token} group={group} setGroup={setGroup} />}
      {tab === "Catalogue" && <SellerCatalogue token={session.token} stockFilter={stockFilter} />}
      {tab === "Settlements" && <SellerSettlements token={session.token} />}
      {tab === "Shop" && <SellerShopSettings token={session.token} name={session.name} signOut={signOut} />}
    </View>
    <View style={styles.nav}>{tabs.map(item => {
      const selected = tab === item.name;
      return <Pressable key={item.name} accessibilityRole="tab" accessibilityState={{selected}} onPress={() => { if (!selected) goTab(item.name); }} style={styles.navItem}>
        <View style={[styles.navIcon, selected && styles.sage]}><SellerIcon name={item.icon} color={selected ? "#174638" : "#5A655E"} /></View>
        <Text style={[styles.navLabel, selected && styles.link, styles.navText]}>{item.name}</Text>
      </Pressable>;
    })}</View>
  </View>;
}

function SellerHome({token,orders,open,openStock}: {token:string;orders:(group:OrderGroup)=>void;open:(tab:Tab)=>void;openStock:(filter:StockFilter)=>void}) {
  const shop = useSellerData(() => sellerApi.shop(token), token);
  const dashboard = useSellerData(() => sellerApi.dashboard(token), token);
  const counts = dashboard.data?.counts;
  const work = [
    {title:"New orders", count:counts?.placed ?? 0, action:"Review new orders", open:() => orders("New"), icon:"orders", tint:"#FBE8AE"},
    {title:"To prepare", count:(counts?.accepted ?? 0) + (counts?.preparing ?? 0), action:"Open packing queue", open:() => orders("Preparing"), icon:"bag", tint:"#E6E0F6"},
    {title:"Ready for handoff", count:counts?.ready ?? 0, action:"Review handoffs", open:() => orders("Ready"), icon:"home", tint:"#DAEDDE"},
    {title:"Out of stock", count:dashboard.data?.lowStock?.outOfStock ?? 0, action:"Review sold-out products", open:() => openStock("Out of stock"), icon:"browse", tint:"#F5E0D4"},
    {title:"Low stock", count:dashboard.data?.lowStock?.count ?? 0, action:"Review low stock", open:() => openStock("Low stock"), icon:"browse", tint:"#FBE8AE"},
    {title:"On the way", count:counts?.out_for_delivery ?? 0, action:"View active deliveries", open:() => orders("Out for delivery"), icon:"orders", tint:"#E6E0F6"},
  ] satisfies {title:string;count:number;action:string;open:()=>void;icon:SellerIconName;tint:string}[];
  const next = dashboard.error ? undefined : work.find(item => item.count > 0);
  const refresh = () => { shop.reload(); dashboard.reload(); };
  return <SellerScroll refreshing={shop.loading || dashboard.loading} onRefresh={refresh}>
    {shop.data && <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={styles.grow}>
          <Text style={styles.heroTitle}>{shop.data.name}</Text>
          {!!shop.data.locality && <Text style={styles.heroKicker}>{shop.data.locality}</Text>}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Shop settings" onPress={() => open("Shop")} style={styles.heroBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.heroBadgeText}>{sellerShopAvailability(shop.data)}</Text>
        </Pressable>
      </View>
      <Image source={counterPhoto} style={styles.heroPhoto} resizeMode="cover" accessible={false} />
      <View style={styles.heroFooter}>
        <Pressable accessibilityRole="button" onPress={next?.open ?? (() => orders("Active"))} style={({pressed}) => [styles.heroAction, pressed && styles.pressed]}>
          <Text style={[styles.label, styles.grow]}>{next?.action ?? "View active orders"}</Text>
          <Text style={styles.label}>{next ? `${next.count}  ›` : "›"}</Text>
        </Pressable>
      </View>
    </View>}
    <LoadState loading={shop.loading && !shop.data} error={shop.error} retry={shop.reload} />
    {shop.data && shop.data.status !== "approved" && <BuyerStateCard title={sellerShopApproval[shop.data.status]} copy={shop.data.review?.reason || "You can prepare your catalogue and shop details while your shop status is reviewed."} tone="warning" compact icon="shop" action="Shop settings" onAction={() => open("Shop")} />}
    <LoadState loading={dashboard.loading && !dashboard.data} error={dashboard.error} retry={dashboard.reload} />
    {dashboard.data && <>
      <View style={styles.queueTop}>
        <Text accessibilityRole="header" style={styles.section}>Work queue</Text>
        <Pressable accessibilityRole="button" disabled={shop.loading || dashboard.loading} onPress={refresh} style={styles.tap}><Text style={styles.link}>{dashboard.loading ? "Refreshing…" : "Refresh"}</Text></Pressable>
      </View>
      <View style={styles.workList}>
        {work.map(item => <Pressable key={item.title} accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.count}`} onPress={item.open}
          style={({pressed}) => [styles.workTile, pressed && styles.pressed]}>
          <View style={styles.queueTop}>
            <View style={[styles.workIcon,{backgroundColor:item.tint}]}><SellerIcon name={item.icon} color="#183B31" /></View>
            <Text style={[styles.workCount, item.count > 0 && styles.workCountActive]}>{item.count}</Text>
          </View>
          <View style={styles.queueTop}><Text style={[styles.label,styles.grow]}>{item.title}</Text><Text style={styles.link}>›</Text></View>
        </Pressable>)}
      </View>
      <Text accessibilityRole="header" style={styles.section}>Today at a glance</Text>
      <View style={styles.todayStrip}>
        <View style={styles.grow}><Text style={styles.todayNumber}>{dashboard.data.todayOrders}</Text><Text style={styles.copy}>Orders today</Text></View>
        <View style={styles.metricDivider} />
        <View style={styles.grow}><Text style={styles.todayNumber}>{dashboard.data.pendingPayment}</Text><Text style={styles.copy}>Awaiting payment</Text></View>
      </View>
    </>}
    <Text accessibilityRole="header" style={styles.section}>Shop tools</Text>
    <SellerCard>
      <Row title="Manage catalogue" onPress={() => open("Catalogue")} />
      <Row title="Opening hours and shop settings" onPress={() => open("Shop")} />
    </SellerCard>
  </SellerScroll>;
}

function SellerOrders({token,group,setGroup}: {token:string;group:OrderGroup;setGroup:(value:OrderGroup)=>void}) {
  const listing = useSellerPages(sellerApi.orders, token);
  const [search,setSearch] = useState("");
  const [fulfilmentFilter,setFulfilmentFilter] = useState<typeof fulfilmentFilters[number]>("all");
  const [selected, setSelected] = useState<SellerOrder>();
  const [packingChecks,setPackingChecks] = useState<Record<string,number[]>>({});
  const [action, setAction] = useState<"cancel" | "cash" | "return" | "pickup">();
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [restock, setRestock] = useState(false);
  const mutation = useSellerMutation();
  const requestedOlderOrders = useRef(false);
  const reloadOrders = () => {
    requestedOlderOrders.current = false;
    listing.reload();
  };
  const refreshAfterResume = useEffectEvent(() => {
    if (!selected && !search.trim() && !listing.loading && !listing.moreBusy && !requestedOlderOrders.current) reloadOrders();
  });
  useEffect(() => {
    let wasBackground = AppState.currentState === "background";
    const subscription = AppState.addEventListener("change", state => {
      if (state === "background") wasBackground = true;
      if (state === "active" && wasBackground) {
        wasBackground = false;
        refreshAfterResume();
      }
    });
    return () => subscription.remove();
  }, []);
  const close = () => { setSelected(undefined); setAction(undefined); mutation.clear(); };
  useAndroidBack(() => { if (!selected) return false; if (!mutation.busy) close(); return true; }, 25);
  const term = search.trim().replace(/^(?:order\s*#\s*|#\s*)/i, "").toLowerCase();
  const groupStatuses: readonly OrderStatus[] = orderGroups[group];
  const completed = group === "Completed" || group === "Delivered" || group === "Cancelled";
  const queues = completed ? ["Delivered","Cancelled"] as const : ["New","Preparing","Ready","Out for delivery"] as const;
  const rows = listing.data?.items.filter(row => {
    if (term) return row.orderId.toLowerCase().includes(term);
    return groupStatuses.includes(row.status)
      && (fulfilmentFilter === "all" || row.fulfilment === fulfilmentFilter);
  });
  const activeOrderCount = listing.data?.items.filter(order => (orderGroups.Active as OrderStatus[]).includes(order.status)).length;
  if (selected) {
    const order = selected;
    const packingUnits = order.lines.reduce((total,item) => total + item.qty,0);
    const packingLines = order.lines.length;
    const canCheckPacking = !order.testMode && (order.status === "accepted" || order.status === "preparing");
    const packingKey = `${order.id}:${order.version}`;
    const checkedLines = packingChecks[packingKey] ?? [];
    const move = ({placed:"accepted",accepted:"preparing",preparing:"ready",ready:order.fulfilment==="seller_delivery" ? "out_for_delivery" : undefined} as Partial<Record<OrderStatus,OrderStatus>>)[order.status];
    const actionLabel = {placed:"Accept order",accepted:"Start packing",preparing:"Mark ready",ready:"Start delivery"}[order.status as "placed"|"accepted"|"preparing"|"ready"];
    const allowReceipt = order.fulfilment === "pickup" ? order.status === "ready" : order.fulfilment === "seller_delivery" && order.status === "out_for_delivery";
    const perform = (task:()=>Promise<unknown>) => void mutation.run(async () => { await task(); close(); listing.reload(); });
    const openAction = (value: typeof action) => { setAction(value); setReason(""); setCode(""); setRestock(false); mutation.clear(); };
    const riderReady = order.status === "ready" && order.fulfilment === "platform_delivery" && order.delivery?.state === "claimed";
    const primary = move ? {label:actionLabel,press:() => perform(() => sellerApi.move(token,order,move))}
      : riderReady ? {label:"Review rider handoff",press:() => openAction("pickup")}
      : allowReceipt ? {label:"Verify buyer receipt code",press:() => openAction("cash")} : undefined;
    return <>
    <SellerScroll>
      <View style={styles.orderTop}>
        <Pressable accessibilityRole="button" onPress={close} disabled={mutation.busy} style={styles.orderBack}><Text style={styles.link}>‹  Back to orders</Text></Pressable>
        {!action && readyRiderLabel(order) === "Waiting for a rider" && <Pressable accessibilityRole="button" disabled={mutation.busy} style={styles.dispatchRefresh}
          onPress={() => void mutation.run(async () => {
            const latest = await sellerApi.orders(token);
            const updated = latest.items.find(item => item.orderId === order.orderId && item.id === order.id);
            if (!updated) throw new Error("This order isn’t in the latest results. Go back to Orders to find its current status.");
            listing.setData(previous => previous && {...previous,items:previous.items.map(item => item.id === updated.id ? updated : item)});
            setSelected(updated);
          })}>
          <Text style={styles.link}>{mutation.busy ? "Refreshing…" : "Refresh rider status"}</Text>
        </Pressable>}
      </View>
      <View style={styles.orderHero}>
        <View style={styles.orderTop}><SellerIcon name="orders" color="#F7D46A" /><Text style={styles.orderStatus}>{orderStatusNames[order.status]}</Text></View>
        <Text style={styles.heroTitle}>Order #{order.orderId.slice(-8).toUpperCase()}</Text>
        <View style={styles.orderReference}>
          <Text style={styles.heroKicker}>Full order ID</Text>
          <Text selectable style={styles.orderReferenceValue}>{order.orderId}</Text>
        </View>
        <Text style={styles.heroKicker}>{[fulfilmentNames[order.fulfilment],orderTime(order.createdAt)].filter(Boolean).join(" · ")}</Text>
        {order.delivery && <Text style={styles.heroKicker}>Rider status · {order.delivery.state.replaceAll("_"," ")}</Text>}
        {order.status !== "cancelled" && <View style={styles.stageTray}>
          {packingStages.map((stage,index) => {
            const current = index === packingProgress[order.status];
            const reached = index <= packingProgress[order.status];
            return <View key={stage} style={styles.stage} accessible accessibilityLabel={`${stage}, ${current ? "current step" : reached ? "done" : "upcoming"}`}>
              <View style={[styles.stageLine,reached && styles.stageLineReached,current && styles.stageLineCurrent]} />
              <Text style={[styles.stageText,current && styles.stageCurrent]}>{stage}</Text>
            </View>;
          })}
        </View>}
      </View>
      {order.testMode && <BuyerStateCard title="Test order" copy="Skip physical fulfilment and cash collection." tone="warning" compact />}
      <View style={styles.orderTop}>
        <Text accessibilityRole="header" style={[styles.section,styles.grow]}>Packing list</Text>
        <Text style={styles.orderStatus}>{packingUnits} {packingUnits === 1 ? "unit" : "units"}</Text>
      </View>
      <Text style={styles.copy}>{packingLines} {packingLines === 1 ? "line item" : "line items"} to check</Text>
      {canCheckPacking && <Text accessibilityLiveRegion="polite" style={styles.copy}>{checkedLines.length} of {packingLines} checked</Text>}
      <SellerCard>{order.lines.map((item,index) => {
        const checked = checkedLines.includes(index);
        const contents = <>
          <View style={styles.grow}>
            <Text style={styles.label}>{item.name}</Text>
            {!!(item.variantLabel || item.unit) && <Text style={styles.copy}>{item.variantLabel || item.unit}</Text>}
          </View>
          <Text style={styles.workCount}>×{item.qty}</Text>
        </>;
        const rowStyle = [styles.row,index > 0 && styles.packingDivider];
        if (!canCheckPacking) return <View key={index} style={rowStyle}>{contents}</View>;
        return <Pressable key={index} accessibilityRole="checkbox" accessibilityState={{checked}}
          accessibilityLabel={[item.name,item.variantLabel || item.unit,`Quantity ${item.qty}`].filter(Boolean).join(", ")}
          style={rowStyle} onPress={() => setPackingChecks(previous => {
            const lines = previous[packingKey] ?? [];
            return {...previous,[packingKey]:lines.includes(index) ? lines.filter(line => line !== index) : [...lines,index]};
          })}>
          <View style={[styles.shopCheck,checked && styles.shopChecked]}>{checked && <Text style={styles.shopCheckText}>✓</Text>}</View>
          {contents}
        </Pressable>;
      })}</SellerCard>
      <View style={styles.paymentTicket}>
        <View style={styles.orderTop}><Text style={[styles.title,styles.grow]}>{sellerPaymentLabel(order)}</Text>{order.status !== "cancelled" && <Text style={styles.orderAmount}>{rupees(order.total)}</Text>}</View>
        <Text style={styles.copy}>Items {rupees(order.itemsSubtotal)} · Delivery {rupees(order.deliveryFee)}</Text>
        {sellerCashDue(order) && <Text style={styles.label}>{rupees(order.amountDue)} due</Text>}
        {order.status === "cancelled" && <Text style={styles.copy}>Original order total · {rupees(order.total)}</Text>}
        {order.refund && <Text style={styles.copy}>{sellerRefundLabel(order)}</Text>}
        {order.cancelReason && <Text style={styles.copy}>Cancellation · {order.cancelReason}</Text>}
      </View>
      {order.deliveryAddress && <SellerCard><Text style={styles.label}>Delivery address</Text><Text style={styles.copy}>{[order.deliveryAddress.line1,order.deliveryAddress.locality,order.deliveryAddress.city,order.deliveryAddress.pincode].filter(Boolean).join(", ")}</Text></SellerCard>}
      <MutationFeedback error={mutation.error} onReload={() => {close(); listing.reload();}} />
      {!order.testMode && !action && <>
        {(order.status === "placed" || order.status === "accepted") && <SellerButton label="Cancel order" soft onPress={() => openAction("cancel")} disabled={mutation.busy} />}
        {readyRiderLabel(order) === "Waiting for a rider" && <Text style={styles.copy}>Waiting for a platform rider to claim this order.</Text>}
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
    </SellerScroll>
    {!order.testMode && !action && primary && <View style={styles.orderDock}>
      <SellerButton label={primary.label} onPress={primary.press} disabled={mutation.busy} />
    </View>}
    </>;
  }
  return <SellerScroll refreshing={listing.loading} onRefresh={reloadOrders}>
    <View style={styles.dispatchBanner}>
      <Image source={dispatchPhoto} resizeMode="cover" style={styles.dispatchBannerImage} accessible={false} testID="seller-dispatch-art" />
      <View style={styles.dispatchBannerCopy}>
        <Text accessibilityRole="header" style={styles.dispatchTitle}>Dispatch desk</Text>
        {activeOrderCount !== undefined && !listing.error && <Text style={styles.dispatchBannerStatus}>{activeOrderCount}{listing.data?.next ? "+" : ""} active {activeOrderCount === 1 && !listing.data?.next ? "order" : "orders"}</Text>}
      </View>
    </View>
    <View style={styles.catalogueSearch}>
      <TextInput accessibilityLabel="Search order ID" placeholder="Search order ID" placeholderTextColor="#57665E" value={search}
        onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={styles.catalogueSearchInput} />
      {!!search && <Pressable accessibilityRole="button" accessibilityLabel="Clear order search" onPress={() => setSearch("")} style={styles.catalogueAction}><Text style={styles.link}>Clear</Text></Pressable>}
    </View>
    {!term && <View style={styles.dispatchPanel}>
      <View style={styles.dispatchModes}>
        {(["Active","Completed"] as const).map(mode => {
          const selected = mode === "Completed" ? completed : !completed;
          return <Pressable key={mode} accessibilityRole="tab" accessibilityLabel={mode} accessibilityState={{selected}} onPress={() => setGroup(mode)} style={[styles.dispatchMode,selected && styles.dispatchModeActive]}>
            <Text style={selected ? styles.dispatchModeTextActive : styles.dispatchModeText}>{mode}</Text>
          </Pressable>;
        })}
      </View>
      <View style={styles.dispatchCounters}>
        {queues.map(queue => {
          const count = listing.data?.items.filter(order => (orderGroups[queue] as OrderStatus[]).includes(order.status)).length;
          const selected = group === queue;
          return <Pressable key={queue} accessibilityRole="tab" accessibilityLabel={queue} accessibilityState={{selected}} accessibilityHint={count === undefined ? undefined : `${count} orders loaded`} onPress={() => setGroup(queue)} style={[styles.dispatchCounter,selected && styles.dispatchSelected]}>
            <Text style={[styles.dispatchNumber,selected && styles.dispatchInk]}>{count ?? "–"}</Text><Text style={[styles.dispatchModeText,selected && styles.dispatchInk]}>{queue === "Out for delivery" ? "On the way" : queue}</Text>
          </Pressable>;
        })}
      </View>
      {listing.data?.next && <Text style={styles.copy}>Counts reflect loaded orders</Text>}
    </View>}
    <View style={styles.orderTop}>
      <Text accessibilityRole="header" style={[styles.section,styles.grow]}>{term ? "Search results" : group === "Completed" ? "Past orders" : group === "Out for delivery" ? group : `${group} orders`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh orders" disabled={listing.loading} onPress={reloadOrders} style={styles.dispatchRefresh}><Text style={styles.link}>{listing.loading ? "Refreshing…" : "Refresh"}</Text></Pressable>
    </View>
    {!term && <View accessibilityLabel="Fulfilment filter" style={styles.chips}>{fulfilmentFilters.map(value => {
      const selected = fulfilmentFilter === value;
      return <Pressable key={value} accessibilityRole="button" accessibilityState={{selected}} onPress={() => setFulfilmentFilter(value)}
        style={[styles.chip,styles.catalogueChip,selected && styles.dispatchModeActive]}>
        <Text style={selected ? styles.dispatchModeTextActive : styles.link}>{value === "all" ? "All methods" : fulfilmentNames[value]}</Text>
      </Pressable>;
    })}</View>}
    <LoadState loading={listing.loading && !listing.data} error={listing.error} retry={listing.reload} />
    {!listing.loading && !listing.error && !rows?.length && <BuyerStateCard
      title={term ? "No matching order ID" : "No orders in this view"}
      copy={listing.data?.next ? "Load more orders to check earlier activity." : term ? "Check the order ID and try again." : "Matching orders will appear here."}
      icon="orders" action={!term && fulfilmentFilter !== "all" ? "Show all methods" : undefined} onAction={() => setFulfilmentFilter("all")} />}
    {rows?.map(order => {
      const reference = `Order #${order.orderId.slice(-8).toUpperCase()}`;
      const status = orderStatusNames[order.status];
      const units = order.lines.reduce((sum,item) => sum + item.qty,0);
      const checkedCount = packingChecks[`${order.id}:${order.version}`]?.length ?? 0;
      const packingProgressLabel = checkedCount > 0 ? `${checkedCount} of ${order.lines.length} checked` : undefined;
      const nextStep = order.status === "ready" && order.fulfilment === "platform_delivery" && order.delivery?.state !== "claimed"
        ? "View order" : orderNextStep[order.status] ?? "View details";
      const riderStatus = readyRiderLabel(order);
      const refundLabel = order.status === "cancelled" && !order.testMode ? sellerRefundLabel(order) : undefined;
      const cashDue = sellerCashDue(order) ? `Cash due ${rupees(order.amountDue)}` : undefined;
      return <Pressable key={order.id} accessibilityRole="button" accessibilityLabel={[reference,status,riderStatus,packingProgressLabel,cashDue,refundLabel].filter(Boolean).join(", ")} accessibilityHint={nextStep} onPress={() => setSelected(order)}
        style={({pressed}) => [styles.dispatchTicket, pressed && styles.pressed]}>
        <View style={styles.dispatchTicketBody}>
          <View style={styles.orderTop}>
            <View style={[styles.workIcon,styles.ticketIcon]}><SellerIcon name="orders" color="#174638" /></View>
            <View style={styles.grow}>
              <Text style={styles.title}>{reference}</Text>
              <Text style={styles.copy}>{orderTime(order.createdAt)}</Text>
            </View>
            <Text style={[styles.orderStatus,order.status === "placed" && styles.workCountActive]}>{status}</Text>
          </View>
          <View style={styles.dispatchRoute}>
            <Text style={styles.label}>{units} {units === 1 ? "unit" : "units"}{order.lines[0] ? ` · ${order.lines[0].name}` : ""}{order.lines.length > 1 ? ` +${order.lines.length - 1} more` : ""}</Text>
            <Text style={styles.copy}>{fulfilmentNames[order.fulfilment]} · {order.testMode ? "Test order" : sellerPaymentLabel(order)}</Text>
            {!!riderStatus && <Text style={styles.label}>{riderStatus}</Text>}
            {!!refundLabel && <Text style={styles.label}>{refundLabel}</Text>}
            {!!packingProgressLabel && <Text style={styles.label}>{packingProgressLabel}</Text>}
            {order.status === "cancelled" && !!order.cancelReason?.trim() && (
              <Text style={styles.copy} numberOfLines={2}>Reason · {order.cancelReason.trim()}</Text>
            )}
          </View>
        </View>
        <View style={styles.dispatchTicketFooter}>
          <Text style={styles.orderAmount}>{cashDue ?? (order.status === "cancelled" ? `Original ${rupees(order.total)}` : rupees(order.total))}</Text>
          <Text style={styles.dispatchTicketLink}>{nextStep}  ›</Text>
        </View>
      </Pressable>;
    })}
    {listing.data?.next && <SellerButton label={listing.moreBusy ? "Loading…" : "Load more orders"} soft disabled={listing.moreBusy} onPress={() => {
      requestedOlderOrders.current = true;
      listing.more();
    }} />}
  </SellerScroll>;
}

function SellerSettlements({token}:{token:string}) {
  const listing = useSellerPages(sellerApi.settlements, token);
  const [filter,setFilter] = useState<typeof statementFilters[number]>("All");
  const [search,setSearch] = useState("");
  const [expanded,setExpanded] = useState<string>();
  const rows = listing.data?.items ?? [];
  const term = search.trim().replace(/^(?:order\s*#\s*|#\s*)/i, "").toLowerCase();
  const visible = rows.filter(row => {
    const matchesFilter = filter === "All" || (filter === "Recorded payouts"
      ? row.payout?.state === "recorded" : statementStatus(row) === "Pending review");
    return matchesFilter && (!term || row.orderId.toLowerCase().includes(term)
      || row.payout?.reference?.toLowerCase().includes(term));
  });
  const recorded = rows.filter(row => row.payout?.state === "recorded").length;
  const pending = rows.filter(row => statementStatus(row) === "Pending review").length;
  return <SellerScroll refreshing={listing.loading} onRefresh={listing.reload}>
    <View style={styles.statementHero}>
      <View style={styles.statementHeroIcon}><SellerIcon name="bag" color="#194539" /></View>
      <Text accessibilityRole="header" style={styles.heroTitle}>Payout activity</Text>
      {listing.data && <>
        <View style={styles.statementMetrics}>
          <View style={styles.grow}><Text style={styles.statementMetric}>{recorded}</Text><Text style={styles.heroKicker}>Payouts recorded</Text></View>
          <View style={styles.statementRule} />
          <View style={styles.grow}><Text style={styles.statementMetric}>{pending}</Text><Text style={styles.heroKicker}>Pending review</Text></View>
        </View>
        {listing.data.next && <Text style={styles.heroKicker}>Counts reflect loaded statements</Text>}
      </>}
    </View>
    <View style={styles.orderTop}>
      <Text accessibilityRole="header" style={[styles.section,styles.grow]}>Statements</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh statement" disabled={listing.loading} onPress={listing.reload} style={styles.dispatchRefresh}><Text style={styles.link}>{listing.loading ? "Refreshing…" : "Refresh"}</Text></Pressable>
    </View>
    {rows.length > 0 && <View style={styles.catalogueSearch}>
      <TextInput accessibilityLabel="Search statements" placeholder="Order ID or payout reference" placeholderTextColor="#57665E"
        value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={styles.catalogueSearchInput} />
      {!!search && <Pressable accessibilityRole="button" accessibilityLabel="Clear statement search" onPress={() => setSearch("")} style={styles.catalogueAction}><Text style={styles.link}>Clear</Text></Pressable>}
    </View>}
    {rows.length > 0 && <View style={styles.chips}>{statementFilters.map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:value === filter}} onPress={() => setFilter(value)}
      style={[styles.chip,styles.catalogueChip,value === filter && styles.dispatchModeActive]}><Text style={value === filter ? styles.dispatchModeTextActive : styles.link}>{value}</Text></Pressable>)}</View>}
    <LoadState loading={listing.loading && !listing.data} error={listing.error} retry={listing.reload} />
    {listing.data && !listing.loading && !listing.error && !visible.length && <BuyerStateCard
      title={rows.length ? "No matching statements" : "No settlements yet"}
      copy={listing.data.next ? "Load more settlements to check earlier statements." : rows.length ? "Try a different search or filter." : "Settlements will appear here as the platform records them."}
      icon="wallet" action={rows.length ? "Reset filters" : undefined} onAction={() => {setSearch("");setFilter("All");}} />}
    {visible.map(row => {
      const isOpen = expanded === row.id;
      const recordedAt = row.payout?.state === "recorded" && row.payout.recordedAt
        ? Date.parse(row.payout.recordedAt) : NaN;
      const breakdown = [
        {label:"Gross order amount",value:row.grossAmount},
        {label:"Seller entitlement",value:row.sellerEntitlement},
        {label:"Platform delivery fee",value:row.platformDeliveryFee},
        {label:"Cash retained",value:row.sellerRetained},
      ].filter(entry => typeof entry.value === "number");
      return <View key={row.id} style={styles.dispatchTicket}>
        <View style={styles.statementBody}>
          <View style={styles.orderTop}>
            <Text style={[styles.title,styles.grow]}>Order #{row.orderId.slice(-8).toUpperCase()}</Text>
            <Text style={[styles.orderStatus,(!row.posted || row.holdReason) && styles.workCountActive]}>{statementStatus(row)}</Text>
          </View>
          <View style={styles.statementAmount}>
            <Text style={styles.copy}>Payout amount</Text>
            <Text style={styles.statementValue}>{typeof row.payoutAmount === "number" ? rupees(row.payoutAmount) : "—"}</Text>
            {Number.isFinite(recordedAt) && <Text style={styles.copy}>Recorded {payoutDate.format(recordedAt)}</Text>}
          </View>
          {!!row.holdReason && <Text style={styles.copy}>{row.holdReason}</Text>}
          {isOpen && <>
            {breakdown.map(entry => <View key={entry.label} style={[styles.orderTop,styles.statementLine]}><Text style={[styles.copy,styles.grow]}>{entry.label}</Text><Text style={styles.label}>{rupees(entry.value!)}</Text></View>)}
            {!!row.payout?.reference && <Text selectable style={styles.copy}>Payout reference · {row.payout.reference}</Text>}
            {!breakdown.length && !row.payout?.reference && <Text style={styles.copy}>No additional breakdown available.</Text>}
          </>}
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{expanded:isOpen}} onPress={() => setExpanded(isOpen ? undefined : row.id)}
          style={({pressed}) => [styles.dispatchTicketFooter,pressed && styles.pressed]}>
          <Text style={styles.dispatchTicketLink}>{isOpen ? "Hide breakdown" : "View breakdown"}</Text>
          <Text style={styles.link}>{isOpen ? "−" : "+"}</Text>
        </Pressable>
      </View>;
    })}
    {listing.data?.next && <SellerButton label={listing.moreBusy ? "Loading…" : "Load more settlements"} soft disabled={listing.moreBusy} onPress={listing.more} />}
  </SellerScroll>;
}

function statementStatus(row:Settlement) {
  if (row.payout?.state === "recorded") return "Payout recorded";
  if (row.payout?.state === "prepared") return "Payout prepared";
  return row.posted ? "Statement posted" : "Pending review";
}
