import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { adminApi, type AdminCashFilter, type AdminOrder } from "./adminApi";
import { LoadState, Row, rupees, SellerButton, SellerCard, SellerScroll, styles, useSellerPages } from "./SellerWorkspaceUI";

const filters = [
  {value:"all", label:"All orders"},
  {value:"outstanding", label:"COD outstanding"},
  {value:"recorded", label:"Cash recorded"},
] as const;

function statusLabel(value:string) {
  const label=value.replaceAll("_"," ");
  return label.charAt(0).toUpperCase()+label.slice(1);
}

export function AdminOrders({token}:{token:string}) {
  const [filter,setFilter]=useState<AdminCashFilter>("all");
  return <OrderList key={filter} token={token} filter={filter} setFilter={setFilter} />;
}

function OrderList({token,filter,setFilter}:{token:string;filter:AdminCashFilter;setFilter:(value:AdminCashFilter)=>void}) {
  const list=useSellerPages((auth,cursor)=>adminApi.orders(auth,filter,cursor),token);
  const [selected,setSelected]=useState<AdminOrder>();
  if(selected)return <SellerScroll>
    <SellerButton label="Back to orders" onPress={()=>setSelected(undefined)} soft />
    <SellerCard>
      <Text accessibilityRole="header" style={styles.section}>Order details</Text>
      <Text selectable style={styles.label}>#{selected.id}</Text>
      <Text style={styles.copy}>{selected.paymentMethod==="cod" ? "Cash on delivery" : "Online payment"} · {statusLabel(selected.paymentStatus)}</Text>
      {selected.testMode && <Text style={styles.label}>Test order</Text>}
      <Text style={styles.label}>Total {rupees(selected.total)}</Text>
      <Text style={styles.copy}>Amount due {rupees(selected.amountDue)}</Text>
      {selected.paymentMethod==="cod" && <Text style={styles.copy}>Cash recorded {rupees(selected.cashRecordedAmount)}</Text>}
      {selected.cancelledAmount>0 && <Text style={styles.copy}>Cancelled amount {rupees(selected.cancelledAmount)}</Text>}
    </SellerCard>
    {selected.subOrders.map(shop=><SellerCard key={shop.id}>
      <Text accessibilityRole="header" style={styles.section}>{shop.shopName}</Text>
      <Text style={styles.label}>{statusLabel(shop.status)}</Text>
      {shop.amountDue>0 && <Text style={styles.copy}>Due {rupees(shop.amountDue)}</Text>}
      {!!shop.cancelReason && <Text style={styles.copy}>{shop.cancelReason}</Text>}
    </SellerCard>)}
  </SellerScroll>;

  return <SellerScroll refreshing={list.loading && !!list.data} onRefresh={list.reload}>
    <Text accessibilityRole="header" style={styles.section}>Marketplace orders</Text>
    <View style={styles.orderTop} accessibilityRole="tablist">
      {filters.map(({value,label})=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:filter===value}}
        style={[styles.tap,filter===value && styles.sage]} onPress={()=>setFilter(value)}><Text style={styles.link}>{label}</Text></Pressable>)}
    </View>
    <LoadState loading={list.loading && !list.data} error={list.error} retry={list.reload} />
    {list.data && <SellerCard>
      {!list.data.items.length && <Text style={styles.copy}>No orders match this filter.</Text>}
      {list.data.items.map(order=><View key={order.id}>
        <Row title={`#${order.id.slice(-8).toUpperCase()}${order.testMode ? " · Test" : ""}`} detail={rupees(order.total)} onPress={()=>setSelected(order)} />
        <Text style={styles.copy}>{new Date(order.createdAt).toLocaleDateString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium"})} · {order.subOrders.map(shop=>shop.shopName).join(", ")}</Text>
      </View>)}
      {!!list.data.next && <SellerButton label={list.moreBusy ? "Loading…" : "Load more orders"} onPress={list.more} disabled={list.moreBusy || list.loading} soft />}
    </SellerCard>}
  </SellerScroll>;
}
