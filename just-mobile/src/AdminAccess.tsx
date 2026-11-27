import { useEffect, useState } from "react";
import { Image, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { adminApi, type AdminShop } from "./adminApi";
import { ApiError, buyerApi, marketApi, onSessionExpired, type Session } from "./api";
import { resolveImage } from "./images";
import { LoadState, MutationFeedback, SellerButton, SellerCard, SellerField, SellerScroll, styles, useSellerData, useSellerMutation, useSellerPages } from "./SellerWorkspaceUI";
import { fulfilmentNames } from "./sellerApi";
import { MarketIcon } from "./MarketIcon";
import { theme, themedStyles } from "./theme";

export function AdminAccess({close,session}:{close:()=>void;session:Session}) {
  const auth=useSellerMutation();
  useEffect(()=>onSessionExpired(token=>{
    if(token===session.token)close();
  }),[session.token,close]);

  const logout=()=>void auth.run(async()=>{
    try {await buyerApi.logout(session.token);}
    catch(error) {if(!(error instanceof ApiError && error.status===401))throw error;}
    close();
  });

  if(session.role!=="admin")return null;
  return <Modal visible animationType="slide" onRequestClose={logout}>
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[styles.heading,styles.grow]}>JustPackIt Admin</Text>
          <Pressable accessibilityRole="button" onPress={logout} disabled={auth.busy} style={styles.tap}><Text style={styles.link}>Close</Text></Pressable>
        </View>
        <AdminWorkspace key={session.userId} session={session} logout={logout} loggingOut={auth.busy} error={auth.error} />
      </SafeAreaView>
    </SafeAreaProvider>
  </Modal>;
}

function AdminWorkspace({session,logout,loggingOut,error}:{session:Session;logout:()=>void;loggingOut:boolean;error:string}) {
  const [tab,setTab]=useState<"Overview"|"Seller Approvals">("Overview");
  return <>
    <View style={[styles.header,{minHeight:54}]} accessibilityRole="tablist">
      {(["Overview","Seller Approvals"] as const).map(value=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:value===tab}} onPress={()=>setTab(value)} style={[styles.tap,value===tab && styles.sage]}><Text style={styles.link}>{value}</Text></Pressable>)}
    </View>
    {tab==="Overview" ? <Overview token={session.token} openApprovals={()=>setTab("Seller Approvals")} /> : <Approvals token={session.token} />}
    <View style={[styles.content,{paddingTop:0,paddingBottom:10}]}>
      <MutationFeedback error={error} />
      <SellerButton label={loggingOut ? "Signing out…" : "Sign out of Admin"} soft onPress={logout} disabled={loggingOut} />
    </View>
  </>;
}

function Overview({token,openApprovals}:{token:string;openApprovals:()=>void}) {
  const overview=useSellerData(()=>adminApi.overview(token),token);
  const data=overview.data;
  const format=(value:number)=>value.toLocaleString("en-IN");
  return <SellerScroll refreshing={overview.loading && !!data} onRefresh={overview.reload}>
    <View style={styles.queueTop}>
      <Text accessibilityRole="header" style={[styles.section,styles.grow]}>Marketplace overview</Text>
      <Pressable accessibilityRole="button" disabled={overview.loading} onPress={overview.reload} style={styles.tap}>
        <Text style={styles.link}>{overview.loading ? "Refreshing…" : "Refresh"}</Text>
      </Pressable>
    </View>
    <LoadState loading={overview.loading && !data} error={overview.error} retry={overview.reload} />
    {data && <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Review pending seller approvals, ${format(data.pendingShops.count)} pending`} onPress={openApprovals}
        style={({pressed})=>[overviewStyles.approvals,pressed && styles.pressed]}>
        <View style={overviewStyles.shopIcon}><MarketIcon name="store" /></View>
        <View style={styles.grow}>
          <Text style={styles.label}>Pending seller approvals</Text>
          <Text style={styles.link}>Review shops</Text>
        </View>
        <Text style={overviewStyles.approvalCount}>{format(data.pendingShops.count)}</Text>
      </Pressable>
      <SellerCard>
        <Text accessibilityRole="header" style={styles.section}>Needs attention</Text>
        {([["Support cases",data.support.count],["Stalled shop orders",data.staleSuborders.count],["Payments to check",data.payments.count],["Refunds to check",data.refunds.count]] as const).map(([label,count])=>
          <View key={label} style={overviewStyles.queueRow}>
            <Text style={[styles.label,styles.grow]}>{label}</Text>
            <Text style={[overviewStyles.count,count>0 && overviewStyles.activeCount]}>{format(count)}</Text>
          </View>)}
      </SellerCard>
      <View style={styles.todayStrip}>
        <View style={styles.grow}><Text style={styles.todayNumber}>{format(data.totals.shops)}</Text><Text style={styles.label}>Shops</Text></View>
        <View style={styles.metricDivider} />
        <View style={styles.grow}><Text style={styles.todayNumber}>{format(data.totals.products)}</Text><Text style={styles.label}>Products</Text></View>
      </View>
    </>}
  </SellerScroll>;
}

const overviewStyles=themedStyles(()=>StyleSheet.create({
  approvals:{flexDirection:"row",alignItems:"center",gap:12,padding:16,borderRadius:16,borderWidth:1,borderColor:theme.border,backgroundColor:theme.selected},
  shopIcon:{width:40,height:40,borderRadius:12,alignItems:"center",justifyContent:"center",backgroundColor:theme.surface},
  approvalCount:{fontSize:28,fontWeight:"600",fontVariant:["tabular-nums"],color:theme.ink},
  queueRow:{minHeight:48,flexDirection:"row",alignItems:"center",gap:12,borderTopWidth:1,borderColor:theme.border},
  count:{minWidth:36,textAlign:"center",fontVariant:["tabular-nums"],fontWeight:"600",color:theme.ink,paddingHorizontal:8,paddingVertical:4,borderRadius:8},
  activeCount:{backgroundColor:theme.warning,color:theme.warningInk},
}));

function Approvals({token}:{token:string}) {
  const list=useSellerPages(adminApi.pendingShops,token);
  const [selected,setSelected]=useState<AdminShop>();
  const [notice,setNotice]=useState("");
  if(selected)return <Review token={token} shop={selected} close={()=>setSelected(undefined)} reload={()=>{setSelected(undefined);list.reload();}} saved={status=>{
    setNotice(status==="approved" ? `${selected.name} approved.` : `Changes requested for ${selected.name}.`);
    list.setData(previous=>previous && {...previous,items:previous.items.filter(shop=>shop.id!==selected.id)});
    setSelected(undefined);
    list.reload();
  }} />;
  return <SellerScroll refreshing={list.loading && !!list.data} onRefresh={list.reload}>
    <View style={styles.queueTop}>
      <Text accessibilityRole="header" style={[styles.section,styles.grow]}>Pending seller approvals</Text>
      <Pressable accessibilityRole="button" onPress={list.reload} disabled={list.loading || list.moreBusy} style={styles.tap}>
        <Text style={styles.link}>{list.loading ? "Refreshing…" : "Refresh"}</Text>
      </Pressable>
    </View>
    {!!notice && <Text accessibilityLiveRegion="polite" style={reviewStyles.notice}>{notice}</Text>}
    <LoadState loading={list.loading && !list.data} error={list.error} retry={list.reload} />
    {list.data && <SellerCard>
      {!list.data.items.length && <Text style={styles.copy}>No shops are waiting for review.</Text>}
      {list.data.items.map((shop,index)=><Pressable key={shop.id} accessibilityRole="button" accessibilityLabel={`Review ${shop.name}`} onPress={()=>{setNotice("");setSelected(shop);}}
        style={({pressed})=>[reviewStyles.shopRow,index>0 && reviewStyles.divider,pressed && styles.pressed]}>
        <View style={overviewStyles.shopIcon}><MarketIcon name="store" /></View>
        <View style={styles.grow}>
          <Text style={styles.label}>{shop.name}</Text>
          <Text style={styles.copy}>{shop.locality || shop.address || "Address not provided"}</Text>
        </View>
        <MarketIcon name="chevron-right" />
      </Pressable>)}
      {!!list.data.next && <SellerButton label={list.moreBusy ? "Loading…" : "Load more"} onPress={list.more} disabled={list.moreBusy} soft />}
    </SellerCard>}
  </SellerScroll>;
}

function Review({token,shop,close,reload,saved}:{token:string;shop:AdminShop;close:()=>void;reload:()=>void;saved:(status:"approved"|"rejected")=>void}) {
  const [decision,setDecision]=useState<"approved"|"rejected">();
  const [reason,setReason]=useState("");
  const mutation=useSellerMutation();
  const areas=useSellerData(()=>marketApi.areas(),token);
  const cover=resolveImage(shop.coverImage);
  const submit=()=>void mutation.run(async()=>{
    if(!decision || (decision==="rejected" && reason.trim().length<3))return;
    await adminApi.review(token,shop,decision,decision==="rejected" ? reason.trim() : undefined);
    saved(decision);
  });
  const map=()=>void mutation.run(async()=>{
    if(!shop.location)return;
    const [lng,lat]=shop.location.coordinates;
    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`);
  });
  return <SellerScroll>
    <SellerButton label="Back to approvals" onPress={close} disabled={mutation.busy} soft />
    <SellerCard>
      <Text accessibilityRole="header" style={styles.section}>{shop.name}</Text>
      {!!cover && <Image source={{uri:cover}} accessibilityLabel="Shop cover photo" style={styles.heroPhoto} resizeMode="cover" />}
      <Text style={styles.label}>Shop address</Text>
      <Text style={styles.copy}>{shop.address || shop.locality || "No address provided"}</Text>
      {!!shop.location && <SellerButton label="Check shop pin on map" onPress={map} disabled={mutation.busy} soft />}
      {!!shop.description && <Text style={styles.copy}>{shop.description}</Text>}
      {!!shop.since && <Text style={styles.copy}>Opened in {shop.since}</Text>}
    </SellerCard>
    <SellerCard>
      <Text accessibilityRole="header" style={styles.section}>Shop operations</Text>
      <View style={reviewStyles.detail}><Text style={styles.label}>Categories</Text><Text style={styles.copy}>{shop.categories.join(", ") || "None listed"}</Text></View>
      <View style={reviewStyles.detail}>
        <Text style={styles.label}>Service areas</Text>
        <Text style={styles.copy}>{areas.loading ? "Loading service areas…" : shop.serviceAreaIds.map(id=>areas.data?.find(area=>area.id===id)?.name ?? "Area unavailable").join(", ") || "None listed"}</Text>
        {!!areas.error && <SellerButton label="Retry service areas" onPress={areas.reload} soft />}
      </View>
      <View style={reviewStyles.detail}><Text style={styles.label}>Fulfilment</Text><Text style={styles.copy}>{shop.fulfilment.map(method=>fulfilmentNames[method as keyof typeof fulfilmentNames] ?? method).join(", ") || "None listed"}</Text></View>
    </SellerCard>
    <SellerCard>
      <Text accessibilityRole="header" style={styles.section}>{decision==="approved" ? "Confirm approval" : decision==="rejected" ? "Request changes" : "Review decision"}</Text>
      <MutationFeedback error={mutation.error} onReload={reload} />
      {!decision ? <>
        <SellerButton label="Approve shop" disabled={mutation.busy} onPress={()=>setDecision("approved")} />
        <SellerButton label="Request changes" soft disabled={mutation.busy} onPress={()=>setDecision("rejected")} />
      </> : <>
        {decision==="approved" ? <Text style={styles.copy}>Confirm approval for {shop.name} after reviewing the shop details.</Text> :
          <SellerField label="Reason for requesting changes" value={reason} onChangeText={setReason} multiline maxLength={1000} editable={!mutation.busy} />}
        <SellerButton label={mutation.busy ? "Saving…" : decision==="approved" ? "Confirm approval" : "Send change request"} onPress={submit} disabled={mutation.busy || (decision==="rejected" && reason.trim().length<3)} />
        <SellerButton label="Cancel decision" onPress={()=>{setDecision(undefined);mutation.clear();}} disabled={mutation.busy} soft />
      </>}
    </SellerCard>
  </SellerScroll>;
}

const reviewStyles=themedStyles(()=>StyleSheet.create({
  shopRow:{minHeight:64,flexDirection:"row",alignItems:"center",gap:12,paddingVertical:8},
  divider:{borderTopWidth:1,borderColor:theme.border},
  detail:{gap:4,paddingTop:8,borderTopWidth:1,borderColor:theme.border},
  notice:{padding:12,borderRadius:12,backgroundColor:theme.success,color:theme.ink,fontWeight:"600"},
}));
