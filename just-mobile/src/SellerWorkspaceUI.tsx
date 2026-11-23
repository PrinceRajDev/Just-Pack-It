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
  screen:{flex:1,backgroundColor:"#F8F6EE"}, grow:{flex:1}, header:{minHeight:70,flexDirection:"row",alignItems:"center",paddingHorizontal:20,gap:10}, tap:{minHeight:44,justifyContent:"center",paddingHorizontal:10},
  heading:{fontSize:25,fontWeight:"700",color:"#07552F"}, eyebrow:{fontSize:11,color:"#07552F",fontWeight:"700"}, section:{fontSize:19,color:"#252D25",fontWeight:"700"},
  content:{padding:20,paddingTop:12,paddingBottom:24,gap:14,width:"100%",maxWidth:640,alignSelf:"center"},
  hero:{backgroundColor:"#07552F",padding:20,borderRadius:22,gap:8},heroKicker:{fontSize:13,color:"#EAF0D9"},heroTitle:{fontSize:27,color:"#fff",fontWeight:"600"},
  card:{padding:16,borderRadius:18,borderWidth:1,borderColor:"#DADFD0",backgroundColor:"#fff",gap:10}, title:{color:"#252D25",fontSize:17,fontWeight:"600"},
  label:{color:"#252D25",fontSize:15,fontWeight:"600"}, copy:{color:"#5B665C",fontSize:13,lineHeight:19},
  row:{minHeight:44,flexDirection:"row",alignItems:"center",gap:10}, link:{color:"#07552F",fontSize:14,fontWeight:"600"},
  button:{minHeight:48,borderRadius:12,backgroundColor:"#07552F",alignItems:"center",justifyContent:"center",padding:12},buttonText:{color:"#fff",fontWeight:"600",fontSize:15,textAlign:"center"},
  input:{backgroundColor:"#F8F6EE",minHeight:48,borderRadius:11,borderWidth:1,borderColor:"#DADFD0",padding:12,color:"#252D25"},
  sage:{backgroundColor:"#EAF0D9"}, disabled:{opacity:.55}, chips:{flexDirection:"row",flexWrap:"wrap",gap:8},chip:{padding:10,minHeight:44,justifyContent:"center",borderRadius:12,backgroundColor:"#fff"},
  nav:{backgroundColor:"#fff",borderTopWidth:1,borderColor:"#DADFD0",flexDirection:"row",padding:6,gap:3},
  navItem:{flex:1,minWidth:0,borderRadius:12,minHeight:52,alignItems:"center",justifyContent:"center",gap:3},navLabel:{color:"#07552F",fontSize:10,fontWeight:"600"},
});
