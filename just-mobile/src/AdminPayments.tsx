import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { adminApi, type AdminPayment } from "./adminApi";
import { LoadState, Row, rupees, SellerButton, SellerCard, SellerScroll, styles, useSellerData, useSellerPages } from "./SellerWorkspaceUI";

const stateLabel=(state:string)=>state.replaceAll("_"," ").replace(/^./,letter=>letter.toUpperCase());

export function AdminPayments({token}:{token:string}) {
  const [mode,setMode]=useState<"live"|"test">("live");
  return <PaymentsList key={mode} token={token} mode={mode} selectMode={setMode} />;
}

function PaymentsList({token,mode,selectMode}:{token:string;mode:"live"|"test";selectMode:(value:"live"|"test")=>void}) {
  const list=useSellerPages((auth,cursor)=>adminApi.payments(auth,mode,cursor),token);
  const [selected,setSelected]=useState<AdminPayment>();
  if(selected)return <PaymentDetails key={selected.orderId} token={token} payment={selected} back={()=>setSelected(undefined)} />;

  return <SellerScroll refreshing={list.loading && !!list.data} onRefresh={list.reload}>
    <Text accessibilityRole="header" style={styles.section}>Payments & refunds</Text>
    <View style={styles.orderTop} accessibilityRole="tablist">
      {(["live","test"] as const).map(value=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:value===mode}}
        style={[styles.tap,value===mode && styles.sage]} onPress={()=>selectMode(value)}>
        <Text style={styles.link}>{value==="live" ? "Live payments" : "Test payments"}</Text>
      </Pressable>)}
    </View>
    <LoadState loading={list.loading && !list.data} error={list.error} retry={list.reload} />
    {list.data && <SellerCard>
      {!list.data.items.length && <Text style={styles.copy}>No {mode} payments found.</Text>}
      {list.data.items.map(payment=><Row key={payment.id} title={`Order #${payment.orderId.slice(-8).toUpperCase()}`}
        detail={`${stateLabel(payment.state)} · ${rupees(payment.amount)}`} onPress={()=>setSelected(payment)} />)}
      {!!list.data.next && <SellerButton label={list.moreBusy ? "Loading…" : "Load more payments"} onPress={list.more} disabled={list.moreBusy || list.loading} soft />}
    </SellerCard>}
  </SellerScroll>;
}

function PaymentDetails({token,payment,back}:{token:string;payment:AdminPayment;back:()=>void}) {
  const refunds=useSellerData(()=>adminApi.refunds(token,payment.orderId),payment.orderId);
  return <SellerScroll>
    <SellerButton label="Back to payments" onPress={back} soft />
    <SellerCard>
      <Text accessibilityRole="header" style={styles.section}>Payment details</Text>
      <Text selectable style={styles.copy}>{payment.orderId}</Text>
      <Text style={styles.todayNumber}>{rupees(payment.amount)}</Text>
      <Text style={styles.label}>{stateLabel(payment.state)} · {payment.testMode ? "Test payment" : "Live payment"}</Text>
      {!!payment.paidAt && <Text style={styles.copy}>Paid {new Date(payment.paidAt).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})}</Text>}
    </SellerCard>
    <Text accessibilityRole="header" style={styles.section}>Refunds for this order</Text>
    <LoadState loading={refunds.loading && !refunds.data} error={refunds.error} retry={refunds.reload} />
    {refunds.data?.length===0 && <SellerCard><Text style={styles.copy}>No refunds recorded.</Text></SellerCard>}
    {refunds.data?.map(refund=><SellerCard key={refund.id}>
      <Text style={styles.label}>{refund.shopName}</Text>
      <Text style={styles.label}>{rupees(refund.amount)} · {stateLabel(refund.state)}</Text>
      {!!refund.reason && <Text style={styles.copy}>{refund.reason}</Text>}
    </SellerCard>)}
  </SellerScroll>;
}
