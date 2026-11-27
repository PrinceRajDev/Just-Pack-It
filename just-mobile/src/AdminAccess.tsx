import { useEffect, useState } from "react";
import { Image, Linking, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { adminApi, type AdminShop } from "./adminApi";
import { ApiError, buyerApi, marketApi, onSessionExpired, type Session } from "./api";
import * as storage from "./deviceStorage";
import { resolveImage } from "./images";
import { LoadState, MutationFeedback, Row, SellerButton, SellerCard, SellerField, SellerScroll, styles, useSellerData, useSellerMutation, useSellerPages } from "./SellerWorkspaceUI";
import { fulfilmentNames } from "./sellerApi";

const adminSessionKey="jpi.admin.session";

export function AdminAccess({close,initialSession}:{close:()=>void;initialSession?:Session}) {
  const [session,setSession]=useState<Session>();
  const [attempt,setAttempt]=useState(0);
  const [restoring,setRestoring]=useState(true);
  const [restoreError,setRestoreError]=useState("");
  const [phone,setPhone]=useState("");
  const [password,setPassword]=useState("");
  const auth=useSellerMutation();
  const [expired,setExpired]=useState(false);

  useEffect(()=>{
    let active=true;
    void (async()=>{
      try {
        const stored=initialSession ? null : await storage.getItemAsync(adminSessionKey);
        let saved:Partial<Session>|null=initialSession ?? null;
        if(!saved && stored) {
          try {saved=JSON.parse(stored);} catch {await storage.deleteItemAsync(adminSessionKey);return;}
        }
        if(saved?.role!=="admin" || typeof saved.token!=="string" || typeof saved.userId!=="string")return;
        const verified=await buyerApi.me(saved.token);
        if(!active)return;
        if(verified.role!=="admin" || verified.userId!==saved.userId){await storage.deleteItemAsync(adminSessionKey);return;}
        const next={...verified,token:saved.token};
        await storage.setItemAsync(adminSessionKey,JSON.stringify(next));
        if(active)setSession(next);
      } catch(error) {
        if(!active)return;
        if(error instanceof ApiError && [401,403].includes(error.status))await storage.deleteItemAsync(adminSessionKey).catch(()=>undefined);
        else setRestoreError("Couldn’t verify your admin session. Check your connection and try again.");
      } finally {if(active)setRestoring(false);}
    })();
    return()=>{active=false;};
  },[attempt,initialSession]);

  useEffect(()=>onSessionExpired(token=>{
    if(token!==session?.token)return;
    setExpired(true);
    void storage.deleteItemAsync(adminSessionKey).catch(()=>undefined);
    setSession(undefined);
  }),[session?.token]);

  const login=()=>void auth.run(async()=>{
    const digits=phone.replace(/[\s()-]/g,"");
    const normalized=/^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : /^91[6-9]\d{9}$/.test(digits) ? `+${digits}` : digits;
    if(!/^\+[1-9]\d{9,14}$/.test(normalized) || !password)throw new Error("Enter a valid mobile number and password.");
    const next=await buyerApi.login(normalized,password);
    if(next.role!=="admin"){
      await buyerApi.logout(next.token).catch(()=>undefined);
      throw new Error("Use an administrator account for this workspace.");
    }
    await storage.setItemAsync(adminSessionKey,JSON.stringify(next));
    setExpired(false);
    setPassword("");
    setSession(next);
  });
  const logout=()=>void auth.run(async()=>{
    if(!session)return;
    try {await buyerApi.logout(session.token);} catch(error) {if(!(error instanceof ApiError && error.status===401))throw error;}
    await storage.deleteItemAsync(adminSessionKey);
    setExpired(false);
    setSession(undefined);
  });
  const dismiss=()=>{if(!auth.busy)close();};
  return <Modal visible animationType="slide" onRequestClose={dismiss}>
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[styles.heading,styles.grow]}>JustPackIt Admin</Text>
          <Pressable accessibilityRole="button" onPress={dismiss} disabled={auth.busy} style={styles.tap}><Text style={styles.link}>Close</Text></Pressable>
        </View>
        {session ? <AdminWorkspace key={session.userId} session={session} logout={logout} loggingOut={auth.busy} error={auth.error} /> :
          <SellerScroll>
            <LoadState loading={restoring} error={restoreError} retry={()=>{setRestoreError("");setRestoring(true);setAttempt(value=>value+1);}} />
            {!restoring && !restoreError && <SellerCard>
              <Text accessibilityRole="header" style={styles.section}>Admin sign in</Text>
              <Text style={styles.copy}>{expired ? "Your session expired. Sign in again." : "Use your existing JustPackIt administrator account."}</Text>
              <SellerField label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" editable={!auth.busy} />
              <SellerField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" editable={!auth.busy} onSubmitEditing={login} />
              <MutationFeedback error={auth.error} />
              <SellerButton label={auth.busy ? "Signing in…" : "Sign in to Admin"} onPress={login} disabled={auth.busy} />
            </SellerCard>}
          </SellerScroll>}
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
  return <SellerScroll refreshing={overview.loading && !!data} onRefresh={overview.reload}>
    <Text accessibilityRole="header" style={styles.section}>Marketplace overview</Text>
    <LoadState loading={overview.loading && !data} error={overview.error} retry={overview.reload} />
    {data && <>
      <View style={styles.todayStrip}>
        <View style={styles.grow}><Text style={styles.todayNumber}>{data.totals.shops}</Text><Text style={styles.copy}>Shops</Text></View>
        <View style={styles.metricDivider} />
        <View style={styles.grow}><Text style={styles.todayNumber}>{data.totals.products}</Text><Text style={styles.copy}>Products</Text></View>
      </View>
      <SellerCard>
        <Text accessibilityRole="header" style={styles.section}>Needs attention</Text>
        <Row title="Pending seller approvals" detail={String(data.pendingShops.count)} onPress={openApprovals} />
        {[ ["Support cases",data.support.count], ["Stalled shop orders",data.staleSuborders.count], ["Payments to check",data.payments.count], ["Refunds to check",data.refunds.count] ].map(([label,count])=>
          <View key={label} style={styles.queueTop}><Text style={styles.copy}>{label}</Text><Text style={styles.label}>{count}</Text></View>)}
      </SellerCard>
    </>}
  </SellerScroll>;
}

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
    <Text accessibilityRole="header" style={styles.section}>Pending seller approvals</Text>
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.label}>{notice}</Text>}
    <LoadState loading={list.loading && !list.data} error={list.error} retry={list.reload} />
    {list.data && <SellerCard>
      {!list.data.items.length && <Text style={styles.copy}>No shops are waiting for review.</Text>}
      {list.data.items.map(shop=><Row key={shop.id} title={shop.name} detail={shop.locality} onPress={()=>{setNotice("");setSelected(shop);}} />)}
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
      <Text style={styles.copy}>{shop.address || shop.locality || "No address provided"}</Text>
      {!!shop.location && <SellerButton label="Check shop pin on map" onPress={map} disabled={mutation.busy} soft />}
      {!!shop.description && <Text style={styles.copy}>{shop.description}</Text>}
      {!!shop.since && <Text style={styles.copy}>Opened in {shop.since}</Text>}
      <Text style={styles.label}>Categories</Text><Text style={styles.copy}>{shop.categories.join(", ") || "None listed"}</Text>
      <Text style={styles.label}>Service areas</Text><Text style={styles.copy}>{shop.serviceAreaIds.map(id=>areas.data?.find(area=>area.id===id)?.name ?? id).join(", ") || "None listed"}</Text>
      <Text style={styles.label}>Fulfilment</Text><Text style={styles.copy}>{shop.fulfilment.map(method=>fulfilmentNames[method as keyof typeof fulfilmentNames] ?? method).join(", ") || "None listed"}</Text>
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
