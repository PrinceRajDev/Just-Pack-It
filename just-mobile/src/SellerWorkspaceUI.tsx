import { theme, themedStyles } from "./theme";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Pressable, RefreshControl, ScrollView, Text, TextInput, View, type TextInputProps } from "react-native";
import { ApiError } from "./api";
import { BuyerStateCard, BuyerStateSkeleton } from "./BuyerStateCard";
import type { SellerShop } from "./sellerApi";

export const sellerShopApproval = {pending:"Under review",approved:"Approved",rejected:"Changes requested",suspended:"Suspended"};

export function sellerShopAvailability(shop: SellerShop) {
  if (shop.status !== "approved") return sellerShopApproval[shop.status];
  if (shop.temporarilyClosed) return "Temporarily paused";
  if (shop.isOpen === true) return "Open now";
  if (shop.isOpen === false) return "Closed now";
  return "Availability unknown";
}
export const rupees = (value: number) => `₹${value.toLocaleString("en-IN")}`;
export function useSellerData<T>(load: () => Promise<T>, scope: string) {
  const [data,setData] = useState<T>();
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [revision,setRevision] = useState(0);
  const query = useRef(load);
  useEffect(() => { query.current = load; }, [load]);
  useEffect(() => {
    let active = true;
    void query.current().then(data => { if(active) setData(data); }).catch(reason => { if(active) setError(String(reason instanceof Error ? reason.message : reason)); }).finally(() => { if(active) setLoading(false); });
    return () => {active = false;};
  }, [scope, revision]);
  const reload = () => {setError("");setLoading(true);setRevision(value => value+1);};
  return {data,setData,loading,error,reload};
}

export function useSellerPages<T extends {id:string}>(load:(token:string,cursor?:string)=>Promise<{items:T[];next?:string}>,token:string) {
  const listing = useSellerData(() => load(token),token);
  const [moreBusy,setMoreBusy] = useState(false);
  const [moreError,setMoreError] = useState("");
  const lock = useRef(false);
  const more = async () => {
    const cursor = listing.data?.next;
    if (!cursor || lock.current) return;
    lock.current = true; setMoreBusy(true); setMoreError("");
    try {
      const page = await load(token,cursor);
      listing.setData(previous => previous?.next === cursor ? {items:[...previous.items,...page.items.filter(item => !previous.items.some(old => old.id===item.id))],next:page.next===cursor ? undefined : page.next} : previous);
    } catch (reason) { setMoreError(reason instanceof Error ? reason.message : "Could not load more."); }
    finally { lock.current = false; setMoreBusy(false); }
  };
  return {...listing,error: listing.error || moreError,moreBusy,more:()=>void more(),reload:()=>{setMoreError("");listing.reload();}};
}

export function useSellerMutation() {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const lock = useRef(false);
  const run = async (callback:()=>Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await callback(); }
    catch (reason) {setError(reason instanceof ApiError && reason.status===409 ? `${reason.message} Refresh before retrying.` : reason instanceof Error ? reason.message : "Could not save. Try again.");}
    finally { lock.current=false; setBusy(false); }
  };
  return {busy,error,run,clear:()=>setError("")};
}
export function SellerScroll({children,refreshing=false,onRefresh}:{children:ReactNode;refreshing?:boolean;onRefresh?:()=>void}) {
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}
    refreshControl={onRefresh && <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>{children}</ScrollView>;
}
export function SellerCard({children}:{children:ReactNode}) { return <View style={styles.card}>{children}</View>; }
export function SellerButton({label,onPress,soft,disabled}:{label:string;onPress:()=>void;soft?:boolean;disabled?:boolean}) { return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[styles.button,soft&&styles.sage,disabled&&styles.disabled]}><Text style={[styles.buttonText,soft&&styles.link]}>{label}</Text></Pressable>; }
export function SellerField({label,...props}:TextInputProps & {label:string}) { return <View style={{gap:6}}><Text style={styles.label}>{label}</Text><TextInput {...props} accessibilityLabel={label} placeholderTextColor={theme.muted} style={styles.input} /></View>; }
export function Row({title,detail,onPress}:{title:string;detail?:string;onPress:()=>void}) { return <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}><Text style={[styles.label,styles.grow]}>{title}</Text>{detail && <Text style={styles.link}>{detail}</Text>}<Text style={styles.link}>›</Text></Pressable>; }
export function LoadState({loading,error,retry}:{loading:boolean;error:string;retry:()=>void}) { return <>{loading && <BuyerStateSkeleton />}{!!error && <BuyerStateCard title="Couldn’t load this view" copy={error} tone="error" compact action="Retry" onAction={retry} />}</>; }
export function MutationFeedback({error,onReload}:{error:string;onReload?:()=>void}) { return error ? <BuyerStateCard title="Action could not be completed" copy={error} tone="error" compact action={onReload ? "Refresh" : undefined} onAction={onReload} /> : null; }

export const styles = themedStyles(() => StyleSheet.create({
  screen:{flex:1,backgroundColor:theme.canvas}, grow:{flex:1,minWidth:0},
  header:{minHeight:80,flexDirection:"row",alignItems:"center",paddingHorizontal:20,gap:12,width:"100%",maxWidth:640,alignSelf:"center"},
  tap:{minHeight:44,justifyContent:"center",paddingHorizontal:12,borderRadius:12,backgroundColor:theme.surfaceSoft},
  heading:{fontSize:28,letterSpacing:-0.8,fontWeight:"700",color:theme.ink}, eyebrow:{fontSize:12,color:theme.accentInk,fontWeight:"700"},
  section:{fontSize:20,color:theme.ink,fontWeight:"700",letterSpacing:-0.3},
  content:{padding:20,paddingTop:8,paddingBottom:28,gap:16,width:"100%",maxWidth:640,alignSelf:"center"},
  hero:{backgroundColor:theme.hero,borderRadius:24,overflow:"hidden"},
  heroTop:{flexDirection:"row",alignItems:"flex-start",justifyContent:"space-between",gap:8,padding:16},
  heroBadge:{flexDirection:"row",alignItems:"center",gap:6,backgroundColor:theme.surfaceSoft,minHeight:44,paddingHorizontal:8,borderRadius:12,maxWidth:"40%"},
  statusDot:{width:7,height:7,borderRadius:4,backgroundColor:theme.accentInk},
  heroBadgeText:{color:theme.ink,fontWeight:"700",fontSize:11,flexShrink:1},
  heroKicker:{fontSize:13,lineHeight:18,color:theme.secondary},
  heroTitle:{fontSize:27,lineHeight:32,letterSpacing:-0.6,color:theme.ink,fontWeight:"700"},
  heroPhoto:{width:"100%",height:116,backgroundColor:theme.hero},
  heroFooter:{padding:12},
  onPrimary:{color:theme.onPrimary},
  heroAction:{flexDirection:"row",alignItems:"center",gap:12,minHeight:48,borderRadius:12,backgroundColor:theme.primary,paddingHorizontal:16,paddingVertical:8},
  metricDivider:{width:1,backgroundColor:theme.border},
  queueTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},
  workGroup:{gap:8},
  workGroupTitle:{color:theme.secondary,fontSize:13,fontWeight:"700"},
  workTilePriority:{borderColor:theme.accentInk},
  workList:{flexDirection:"row",flexWrap:"wrap",gap:12},
  workTile:{width:"46%",flexGrow:1,minHeight:96,borderRadius:16,borderWidth:1,borderColor:theme.border,backgroundColor:theme.surface,padding:12,gap:8,justifyContent:"space-between"},
  workIcon:{width:36,height:36,borderRadius:10,borderWidth:1,borderColor:theme.tileBorder,alignItems:"center",justifyContent:"center"},
  workCount:{minWidth:32,textAlign:"center",paddingHorizontal:8,paddingVertical:4,borderRadius:8,backgroundColor:theme.surfaceSoft,color:theme.secondary,fontWeight:"700",fontVariant:["tabular-nums"]},
  workCountActive:{backgroundColor:theme.warning,color:theme.warningInk},
  todayStrip:{flexDirection:"row",gap:16,padding:16,borderRadius:16,backgroundColor:theme.surfaceSoft},
  todayNumber:{fontSize:25,fontWeight:"700",fontVariant:["tabular-nums"],color:theme.ink},
  pressed:{opacity:0.72},
  orderTop:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:8},
  orderHero:{backgroundColor:theme.hero,padding:20,borderRadius:20,gap:8},
  orderReference:{backgroundColor:theme.surfaceSoft,padding:12,borderRadius:10,gap:4},
  orderReferenceValue:{fontSize:14,lineHeight:20,color:theme.ink,fontWeight:"600"},
  dispatchBanner:{minHeight:112,borderRadius:22,overflow:"hidden",backgroundColor:theme.hero,justifyContent:"center",padding:20},
  dispatchBannerImage:{position:"absolute",width:"100%",height:"100%",left:0,top:0},
  dispatchBannerCopy:{width:"50%",gap:8,padding:10,borderRadius:12,backgroundColor:theme.elevated},
  dispatchTitle:{color:theme.ink,fontSize:22,lineHeight:27,fontWeight:"700",letterSpacing:-0.7},
  dispatchBannerStatus:{color:theme.accentInk,fontSize:13,lineHeight:18,fontWeight:"700"},
  dispatchPanel:{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border,padding:8,borderRadius:18,gap:8},
  dispatchRefresh:{minHeight:44,justifyContent:"center",paddingHorizontal:12,borderRadius:10,backgroundColor:theme.surfaceSoft},
  dispatchCounters:{flexDirection:"row",flexWrap:"wrap",gap:8},
  dispatchModes:{flexDirection:"row",gap:4,padding:4,backgroundColor:theme.surfaceSoft,borderRadius:14},
  dispatchMode:{flex:1,minHeight:44,alignItems:"center",justifyContent:"center",padding:4,borderRadius:10},
  dispatchModeActive:{backgroundColor:theme.selected},
  dispatchModeText:{fontSize:13,fontWeight:"700",color:theme.accentInk},
  dispatchModeTextActive:{fontSize:13,fontWeight:"700",color:theme.ink},
  dispatchCounter:{width:"46%",flexGrow:1,minHeight:48,paddingHorizontal:10,paddingVertical:6,borderRadius:12,gap:6,flexDirection:"row",alignItems:"center",justifyContent:"space-between",backgroundColor:theme.canvas,borderWidth:1,borderColor:theme.border},
  dispatchSelected:{borderColor:theme.accentInk,backgroundColor:theme.selected},
  dispatchQueueLabel:{flex:1,color:theme.ink,fontSize:13,fontWeight:"600"},
  dispatchInk:{color:theme.accentInk},
  dispatchNumber:{fontSize:23,fontWeight:"700",fontVariant:["tabular-nums"],color:theme.accentInk},
  stageTray:{flexDirection:"row",gap:6,marginTop:8,paddingTop:12,borderTopWidth:1,borderColor:theme.border},
  stage:{flex:1,minWidth:0,gap:6},
  stageLine:{height:4,borderRadius:2,backgroundColor:theme.border},
  stageLineReached:{backgroundColor:theme.success},
  stageLineCurrent:{backgroundColor:theme.accentInk},
  stageText:{color:theme.secondary,fontSize:11},
  stageCurrent:{color:theme.ink,fontWeight:"700"},
  paymentTicket:{backgroundColor:theme.surfaceSoft,padding:16,borderRadius:16,gap:8},
  ticketIcon:{backgroundColor:theme.success},
  dispatchTicket:{borderRadius:20,borderWidth:1,borderColor:theme.border,backgroundColor:theme.surface,overflow:"hidden"},
  dispatchTicketBody:{padding:16,gap:12},
  dispatchRoute:{backgroundColor:theme.canvas,padding:12,borderRadius:12,gap:4},
  dispatchTicketFooter:{minHeight:52,paddingHorizontal:16,paddingVertical:8,flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:8,backgroundColor:theme.warning,borderTopWidth:1,borderColor:theme.border},
  dispatchTicketLink:{color:theme.accentInk,fontSize:14,fontWeight:"700"},
  statementHero:{backgroundColor:theme.hero,borderRadius:24,padding:20,gap:12},
  statementHeroIcon:{alignItems:"center",justifyContent:"center",width:44,height:44,borderRadius:12,backgroundColor:theme.selected},
  statementMetrics:{flexDirection:"row",gap:16,borderTopWidth:1,borderColor:theme.border,paddingTop:12},
  statementMetric:{color:theme.accentInk,fontSize:28,fontWeight:"700",fontVariant:["tabular-nums"]},
  statementRule:{width:1,backgroundColor:theme.border},
  statementBody:{padding:16,gap:12},
  statementAmount:{padding:12,borderRadius:12,gap:4,backgroundColor:theme.success},
  statementValue:{color:theme.ink,fontSize:26,fontWeight:"700",fontVariant:["tabular-nums"]},
  statementLine:{borderTopWidth:1,borderColor:theme.border,paddingTop:8},
  catalogueHero:{flexDirection:"row",borderRadius:22,backgroundColor:theme.hero,overflow:"hidden",minHeight:140},
  catalogueHeroCopy:{width:"64%",minWidth:0,padding:16,gap:8},
  catalogueHeroPhoto:{width:"36%",height:"100%",position:"absolute",right:0,top:0},
  catalogueAdd:{minHeight:44,justifyContent:"center",alignSelf:"flex-start",paddingHorizontal:12,backgroundColor:theme.primary,borderRadius:12},
  catalogueFilters:{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border,borderRadius:16,padding:12,gap:12},
  catalogueSearch:{flexDirection:"row",alignItems:"center",gap:4,borderWidth:1,borderColor:theme.controlBorder,backgroundColor:theme.canvas,borderRadius:12,paddingRight:4},
  catalogueSearchInput:{flex:1,minWidth:0,minHeight:48,paddingHorizontal:12,color:theme.ink,fontSize:15},
  catalogueAction:{minHeight:44,justifyContent:"center",paddingHorizontal:12,borderRadius:10,backgroundColor:theme.success},
  catalogueCardActions:{flexDirection:"row",flexWrap:"wrap",gap:4},
  cataloguePhotoAction:{minHeight:44,justifyContent:"center",paddingHorizontal:8,borderRadius:10},
  catalogueNotice:{color:theme.accentInk,backgroundColor:theme.success,borderRadius:12,padding:12,fontWeight:"600"},
  catalogueSelectedFilter:{backgroundColor:theme.selected,borderColor:theme.accentInk},
  catalogueChip:{backgroundColor:theme.surfaceSoft,paddingHorizontal:10},
  catalogueProductBody:{padding:12,flexDirection:"row",alignItems:"center",gap:12},
  catalogueThumb:{width:64,height:64,borderRadius:12,backgroundColor:theme.success,overflow:"hidden",alignItems:"center",justifyContent:"center"},
  catalogueThumbPhoto:{width:"100%",height:"100%"},
  cataloguePlaceholder:{tintColor:theme.accentInk},
  catalogueProductFooter:{padding:10,paddingHorizontal:12,borderTopWidth:1,borderColor:theme.border,backgroundColor:theme.surfaceSoft,flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",gap:8},
  catalogueInactive:{backgroundColor:theme.surfaceSoft,color:theme.secondary},
  shopCover:{width:"100%",height:124,backgroundColor:theme.hero},
  shopSections:{flexDirection:"row",flexWrap:"wrap",gap:4,padding:4,borderRadius:14,backgroundColor:theme.surfaceSoft},
  shopSectionTab:{flexGrow:1,minHeight:44,justifyContent:"center",alignItems:"center",paddingHorizontal:8,borderRadius:10},
  shopAvailability:{flexDirection:"row",alignItems:"center",gap:12,padding:16,borderRadius:16,backgroundColor:theme.warning,borderWidth:1,borderColor:theme.border},
  shopSwitch:{minHeight:44,justifyContent:"center"},
  shopSwitchTrack:{width:50,height:28,padding:3,borderRadius:15,backgroundColor:theme.muted,justifyContent:"center",alignItems:"flex-start"},
  shopSwitchActive:{backgroundColor:theme.accentInk,alignItems:"flex-end"},
  shopSwitchKnob:{width:22,height:22,borderRadius:11,backgroundColor:theme.surface},
  shopInterval:{padding:10,gap:8,borderRadius:12,backgroundColor:theme.canvas},
  shopDays:{flexDirection:"row",flexWrap:"wrap",gap:4},
  shopDay:{flexGrow:1,minWidth:30,minHeight:44,alignItems:"center",justifyContent:"center",borderRadius:8,backgroundColor:theme.surface},
  shopTimes:{flexDirection:"row",gap:8},
  shopMethod:{minHeight:48,flexDirection:"row",alignItems:"center",gap:8,borderRadius:12,paddingHorizontal:12,backgroundColor:theme.canvas},
  shopCheck:{width:22,height:22,borderRadius:6,borderWidth:1,borderColor:theme.accentInk,alignItems:"center",justifyContent:"center"},
  shopChecked:{backgroundColor:theme.success,borderColor:theme.accentInk},
  shopCheckText:{color:theme.ink,fontSize:14,fontWeight:"700"},
  shopSaved:{color:theme.accentInk,fontSize:13,marginBottom:8},
  shopHoursWarning:{color:theme.warningInk,backgroundColor:theme.warning,borderRadius:10,padding:10,fontSize:13},
  editorIcon:{tintColor:theme.accentInk},
  productPhotoPreview:{width:"100%",height:200,borderRadius:12,backgroundColor:theme.canvas},
  orderBack:{minHeight:44,justifyContent:"center",alignSelf:"flex-start",paddingHorizontal:8},
  orderDock:{padding:12,paddingHorizontal:20,borderTopWidth:1,borderColor:theme.border,backgroundColor:theme.surface,width:"100%",maxWidth:640,alignSelf:"center"},
  packingDivider:{borderTopWidth:1,borderColor:theme.border},
  orderAmount:{color:theme.accentInk,fontSize:17,fontWeight:"700",fontVariant:["tabular-nums"]},
  orderStatus:{color:theme.accentInk,backgroundColor:theme.success,paddingHorizontal:8,paddingVertical:4,borderRadius:8,fontSize:12,fontWeight:"700"},
  card:{padding:16,borderRadius:16,borderWidth:1,borderColor:theme.border,backgroundColor:theme.surface,gap:8}, title:{color:theme.ink,fontSize:17,fontWeight:"700"},
  label:{color:theme.ink,fontSize:15,fontWeight:"600"}, copy:{color:theme.secondary,fontSize:13,lineHeight:19},
  row:{minHeight:44,flexDirection:"row",alignItems:"center",gap:10}, link:{color:theme.accentInk,fontSize:14,fontWeight:"600"},
  button:{minHeight:48,borderRadius:12,backgroundColor:theme.primary,alignItems:"center",justifyContent:"center",padding:12},buttonText:{color:theme.onPrimary,fontWeight:"600",fontSize:15,textAlign:"center"},
  input:{backgroundColor:theme.canvas,minHeight:48,borderRadius:11,borderWidth:1,borderColor:theme.controlBorder,padding:12,color:theme.ink},
  sage:{backgroundColor:theme.selected}, disabled:{opacity:.55}, chips:{flexDirection:"row",flexWrap:"wrap",gap:8},chip:{padding:10,minHeight:44,justifyContent:"center",borderRadius:12,backgroundColor:theme.surface},
  nav:{backgroundColor:theme.surface,borderTopWidth:1,borderColor:theme.border,flexDirection:"row",padding:8,gap:2},
  navItem:{flex:1,minWidth:0,borderRadius:12,minHeight:56,alignItems:"center",justifyContent:"center",gap:4},
  navIcon:{alignItems:"center",justifyContent:"center",width:44,height:32,borderRadius:10},
  sellerIcon:{width:22,height:22,flexShrink:0},
  navLabel:{color:theme.secondary,fontWeight:"600",textAlign:"center"},
  navText:{fontSize:10},
}));
