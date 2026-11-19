import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { buyerApi, type Address } from "./api";

import { MarketIcon } from "./MarketIcon";
import * as storage from "./deviceStorage";

type Draft = Omit<Address, "id" | "version">;
const blank: Draft = { label: "Home", line1: "", locality: "", city: "", pincode: "" };
const fields: { key: keyof Draft; label: string }[] = [{ key: "label", label: "Label (Home, Work)" }, { key: "line1", label: "House, street and landmark" }, { key: "locality", label: "Locality" }, { key: "city", label: "City" }, { key: "pincode", label: "PIN code" }];
type CheckoutEditor = {
  address?: Address;
  isDefault: boolean;
  onSaved: (address: Address, makeDefault: boolean) => void;
};
export function BuyerAddresses({ token, back, checkout, userId, area }: { token: string; userId?: string; area?: string; back: () => void; checkout?: CheckoutEditor }) {
  const [defaultId, setDefaultId] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void storage.getItemAsync(`jpi.address.default.${userId}`).then(value => { if (active) setDefaultId(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [userId]);
  const [rows, setRows] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(() => checkout ? (checkout.address ? { label: checkout.address.label, line1: checkout.address.line1, locality: checkout.address.locality, city: checkout.address.city, pincode: checkout.address.pincode } : { ...blank }) : null);
  const [editing, setEditing] = useState<Address | null>(checkout?.address ?? null)
  const [makeDefault, setMakeDefault] = useState(checkout?.isDefault ?? false);
  const checkoutMode = !!checkout;;
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const reload = async () => { setLoading(true); setError(null); try { setRows(await buyerApi.addresses(token)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Addresses could not load"); } finally { setLoading(false); } };
  useEffect(() => { if (checkoutMode) return; let active = true; void buyerApi.addresses(token).then((data) => { if (active) setRows(data); }).catch(() => { if (active) setError("Addresses could not load"); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [token, checkoutMode]);
  const save = async () => {
    if (!draft || lock.current) return;
    const input = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()])) as Draft;
    if (!input.label || input.line1.length < 3 || !input.locality || !input.city || !/^[1-9][0-9]{5}$/.test(input.pincode)) { setError("Complete every field and enter a valid 6-digit PIN code"); return; }
    lock.current = true; setBusy(true); setError(null);
    try { const saved = editing ? await buyerApi.updateAddress(token, editing.id, { ...input, version: editing.version }) : await buyerApi.createAddress(token, input); if (checkout) { checkout.onSaved(saved, makeDefault); return; } setRows((old) => editing ? old.map((row) => row.id === saved.id ? saved : row) : [...old, saved]); setDraft(null); setEditing(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Address could not save"); }
    finally { lock.current = false; setBusy(false); }
  };
  const remove = (row: Address) => Alert.alert("Delete address?", `${row.label}: ${row.line1}`, [{ text: "Keep", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { if (lock.current) return; lock.current = true; setBusy(true); void buyerApi.deleteAddress(token, row.id, row.version).then(() => setRows((old) => old.filter((item) => item.id !== row.id))).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Address could not delete")).finally(() => { lock.current = false; setBusy(false); }); } }]);
  if (!checkout && !draft) return <View style={s.screen}>
    <View style={s.header}><Pressable accessibilityLabel="Back to Account" onPress={back} hitSlop={10}><Text style={s.headerText}>‹</Text></Pressable><Text style={s.headerText}>Saved addresses</Text></View>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.hero}><View style={s.icon}><MarketIcon name="home" color="#07552F" /></View><Text style={s.heroTitle}>Your familiar places.</Text></View>
      {error ? <><Text accessibilityRole="alert" style={s.error}>{error}</Text><Pressable onPress={() => void reload()}><Text style={s.link}>Reload addresses</Text></Pressable></> : null}
      {loading ? <ActivityIndicator color="#07552F" /> : rows.map(row => {
        const isDefault = row.id === defaultId;
        return <View key={row.id} style={[s.savedCard, isDefault && s.defaultCard]}>
          <View style={s.addressHeading}><View style={s.icon}><MarketIcon name="home" color="#07552F" /></View><Text style={s.headerText}>{row.label}{isDefault ? " · Default" : ""}</Text></View>
          <Text style={s.copy}>{row.line1}{"\n"}{row.locality}, {row.city} · {row.pincode}</Text>
          <View style={s.savedActions}>
            <Pressable disabled={busy} onPress={() => { setEditing(row); setDraft({ label: row.label, line1: row.line1, locality: row.locality, city: row.city, pincode: row.pincode }); setError(null); }}><Text style={s.link}>Edit</Text></Pressable>
            <Pressable disabled={busy} onPress={() => remove(row)}><Text style={s.link}>Remove</Text></Pressable>
          </View>
        </View>;
      })}
      {!loading && !error && !rows.length ? <Text style={s.copy}>No saved addresses yet</Text> : null}
      <Text style={s.copy}>{area ? `Your browsing area stays ${area}. ` : ""}Choose a delivery address again at checkout.</Text>
    </ScrollView>
    <View style={s.footer}><Pressable disabled={busy} onPress={() => { setDraft({ ...blank }); setEditing(null); setError(null); }} style={s.primary}><Text style={s.buttonText}>+ Add new address</Text></Pressable></View>
  </View>;
  return <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled"><Pressable disabled={busy} onPress={draft && !checkout ? () => { setDraft(null); setEditing(null); setError(null); } : back}><Text style={s.link}>← {checkout ? "Choose address" : draft ? "Address list" : "Account"}</Text></Pressable><Text style={s.title}>{draft ? editing ? "Edit address" : "Add address" : "Saved addresses"}</Text><Text style={s.copy}>Delivery availability is checked separately at checkout</Text>{error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}{draft ? <View>{fields.map(({ key, label }) => <View key={key}><Text style={s.label}>{label}</Text><TextInput editable={!busy} accessibilityLabel={label} value={draft[key]} onChangeText={(value) => setDraft((old) => old ? { ...old, [key]: value } : old)} keyboardType={key === "pincode" ? "number-pad" : "default"} maxLength={key === "pincode" ? 6 : key === "line1" ? 300 : key === "label" ? 60 : 120} style={s.input} /></View>)}{checkout ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: makeDefault }} aria-checked={makeDefault} disabled={busy} onPress={() => setMakeDefault(value => !value)} style={s.link}><Text style={{color: "#07552F"}}>{makeDefault ? "✓ " : ""}Set as default on this device</Text></Pressable> : null}<Pressable disabled={busy} onPress={() => void save()} style={s.button}><Text style={s.buttonText}>{busy ? "Saving…" : "Save address"}</Text></Pressable></View> : loading ? <ActivityIndicator color="#174B34" /> : <View><Pressable disabled={busy} onPress={() => { setDraft({ ...blank }); setEditing(null); setError(null); }} style={s.button}><Text style={s.buttonText}>Add new address</Text></Pressable>{error ? <Pressable onPress={() => void reload()}><Text style={s.link}>Reload addresses</Text></Pressable> : null}{rows.map((row) => <View key={row.id} style={s.card}><Text style={s.label}>{row.label}</Text><Text style={s.copy}>{row.line1}{"\n"}{row.locality}, {row.city} {row.pincode}</Text><View style={s.actions}><Pressable disabled={busy} onPress={() => { const { id: _id, version: _version, ...values } = row; setEditing(row); setDraft({ label: values.label, line1: values.line1, locality: values.locality, city: values.city, pincode: values.pincode }); setError(null); }}><Text style={s.link}>Edit</Text></Pressable><Pressable disabled={busy} onPress={() => remove(row)}><Text style={s.error}>Delete</Text></Pressable></View></View>)}{!rows.length && !error ? <Text style={s.copy}>No saved addresses yet</Text> : null}</View>}</ScrollView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8F6EE" },
  header: { height: 64, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 16 },
  headerText: { color: "#07552F", fontSize: 17, fontWeight: "600", flexShrink: 1 },
  content: { padding: 20, gap: 20 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, padding: 20, borderRadius: 24, backgroundColor: "#E9EFD8" },
  heroTitle: { flex: 1, color: "#07552F", fontSize: 24, fontWeight: "600" },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#E9EFD8", alignItems: "center", justifyContent: "center" },
  savedCard: { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DADFD0", borderRadius: 24, padding: 20, gap: 12 },
  defaultCard: { borderColor: "#07552F" },
  addressHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  savedActions: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderColor: "#DADFD0" },
  footer: { padding: 16, backgroundColor: "#FFF" },
  primary: { minHeight: 50, borderRadius: 12, backgroundColor: "#07552F", justifyContent: "center", alignItems: "center" },
  page:{padding:24,paddingBottom:120,gap:16},title:{fontSize:26,color:"#1F2A22",fontWeight:"500"},copy:{fontSize:14,lineHeight:21,color:"#5E554A"},link:{color:"#174B34",fontSize:14,fontWeight:"600",paddingVertical:8},error:{color:"#B3432B",fontSize:14,paddingVertical:8},label:{fontSize:15,color:"#1F2A22",marginTop:12,fontWeight:"600"},input:{height:48,borderWidth:1,borderColor:"#DDD6C9",borderRadius:8,paddingHorizontal:12,marginTop:8,color:"#1F2A22",backgroundColor:"#FDFBF7"},button:{backgroundColor:"#174B34",minHeight:48,borderRadius:8,padding:12,alignItems:"center",justifyContent:"center",marginVertical:16},buttonText:{color:"#fff",fontWeight:"600",fontSize:14},card:{borderWidth:1,borderColor:"#DDD6C9",borderRadius:12,padding:16,marginBottom:12,backgroundColor:"#FDFBF7"},actions:{flexDirection:"row",gap:24,marginTop:8} });
