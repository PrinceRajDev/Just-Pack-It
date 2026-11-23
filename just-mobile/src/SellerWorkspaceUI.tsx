import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { ApiError } from "./api";
import { BuyerStateCard, BuyerStateSkeleton } from "./BuyerStateCard";
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
export function SellerScroll({children}:{children:ReactNode}) { return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView>; }
export function SellerCard({children}:{children:ReactNode}) { return <View style={styles.card}>{children}</View>; }
export function SellerButton({label,onPress,soft,disabled}:{label:string;onPress:()=>void;soft?:boolean;disabled?:boolean}) { return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[styles.button,soft&&styles.sage,disabled&&styles.disabled]}><Text style={[styles.buttonText,soft&&styles.link]}>{label}</Text></Pressable>; }
export function SellerField({label,...props}:TextInputProps & {label:string}) { return <View style={{gap:6}}><Text style={styles.label}>{label}</Text><TextInput {...props} accessibilityLabel={label} placeholderTextColor="#73796E" style={styles.input} /></View>; }
export function Row({title,detail,onPress}:{title:string;detail?:string;onPress:()=>void}) { return <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}><Text style={[styles.label,styles.grow]}>{title}</Text>{detail && <Text style={styles.link}>{detail}</Text>}<Text style={styles.link}>›</Text></Pressable>; }
export function LoadState({loading,error,retry}:{loading:boolean;error:string;retry:()=>void}) { return <>{loading && <BuyerStateSkeleton />}{!!error && <BuyerStateCard title="Couldn’t load this view" copy={error} tone="error" compact action="Retry" onAction={retry} />}</>; }
export function MutationFeedback({error,onReload}:{error:string;onReload?:()=>void}) { return error ? <BuyerStateCard title="Action could not be completed" copy={error} tone="error" compact action={onReload ? "Refresh" : undefined} onAction={onReload} /> : null; }

export const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:"#F5F3EE"}, grow:{flex:1,minWidth:0},
  header:{minHeight:80,flexDirection:"row",alignItems:"center",paddingHorizontal:20,gap:12,width:"100%",maxWidth:640,alignSelf:"center"},
  tap:{minHeight:44,justifyContent:"center",paddingHorizontal:12,borderRadius:12,backgroundColor:"#EAE7DF"},
  heading:{fontSize:28,letterSpacing:-0.8,fontWeight:"700",color:"#192922"}, eyebrow:{fontSize:12,color:"#34584B",fontWeight:"700"},
  section:{fontSize:20,color:"#192922",fontWeight:"700",letterSpacing:-0.3},
  content:{padding:20,paddingTop:8,paddingBottom:28,gap:16,width:"100%",maxWidth:640,alignSelf:"center"},
  hero:{backgroundColor:"#153C32",padding:20,borderRadius:20,gap:8},
  heroTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",minHeight:44,marginTop:-8},
  heroBadge:{flexDirection:"row",alignItems:"center",gap:8,backgroundColor:"#254E42",paddingVertical:8,paddingHorizontal:12,borderRadius:8},
  statusDot:{width:7,height:7,borderRadius:4,backgroundColor:"#F1CB83"},
  heroBadgeText:{color:"#FFF5DC",fontWeight:"700",fontSize:12},
  heroArrow:{fontSize:20,color:"#FFF5DC"},
  heroKicker:{fontSize:13,lineHeight:18,color:"#D6E2D7"},
  heroTitle:{fontSize:32,lineHeight:38,letterSpacing:-0.8,color:"#FFF9EE",fontWeight:"700"},
  heroMetrics:{borderTopWidth:1,borderColor:"#527065",marginTop:8,paddingTop:12,flexDirection:"row",gap:16},
  heroNumber:{fontSize:28,fontWeight:"700",fontVariant:["tabular-nums"],color:"#F1CB83"},
  metricDivider:{width:1,backgroundColor:"#527065"},
  queue:{flexDirection:"row",flexWrap:"wrap",gap:12},
  queueTile:{width:"47%",flexGrow:1,minHeight:104,padding:16,justifyContent:"space-between",gap:8,borderRadius:16,borderWidth:1,borderColor:"#E0DED5",backgroundColor:"#FFFFFF"},
  queueActive:{backgroundColor:"#F8EDDA",borderColor:"#E6D5B5"},
  queueTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},
  queueNumber:{fontSize:28,fontWeight:"700",fontVariant:["tabular-nums"],color:"#192922"},
  pressed:{opacity:0.72},
  orderTop:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:8},
  orderStatus:{color:"#174638",backgroundColor:"#E8EFE4",paddingHorizontal:8,paddingVertical:4,borderRadius:8,fontSize:12,fontWeight:"700"},
  orderTotal:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",borderTopWidth:1,borderColor:"#E0DED5",paddingTop:8,gap:8},
  card:{padding:16,borderRadius:16,borderWidth:1,borderColor:"#E0DED5",backgroundColor:"#fff",gap:8}, title:{color:"#192922",fontSize:17,fontWeight:"700"},
  label:{color:"#252D25",fontSize:15,fontWeight:"600"}, copy:{color:"#5B665C",fontSize:13,lineHeight:19},
  row:{minHeight:44,flexDirection:"row",alignItems:"center",gap:10}, link:{color:"#07552F",fontSize:14,fontWeight:"600"},
  button:{minHeight:48,borderRadius:12,backgroundColor:"#07552F",alignItems:"center",justifyContent:"center",padding:12},buttonText:{color:"#fff",fontWeight:"600",fontSize:15,textAlign:"center"},
  input:{backgroundColor:"#F8F6EE",minHeight:48,borderRadius:11,borderWidth:1,borderColor:"#DADFD0",padding:12,color:"#252D25"},
  sage:{backgroundColor:"#EAF0D9"}, disabled:{opacity:.55}, chips:{flexDirection:"row",flexWrap:"wrap",gap:8},chip:{padding:10,minHeight:44,justifyContent:"center",borderRadius:12,backgroundColor:"#fff"},
  nav:{backgroundColor:"#fff",borderTopWidth:1,borderColor:"#E0DED5",flexDirection:"row",padding:8,gap:2},
  navItem:{flex:1,minWidth:0,borderRadius:12,minHeight:56,alignItems:"center",justifyContent:"center",gap:4},
  navIcon:{alignItems:"center",justifyContent:"center",width:44,height:32,borderRadius:10},
  navLabel:{color:"#5A655E",fontWeight:"600",textAlign:"center"},
  navText:{fontSize:10},
});
