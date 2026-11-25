import { theme, themedStyles } from "./theme";
import { BuyerStateCard } from "./BuyerStateCard";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { CheckoutHeading } from "./CheckoutPresentation";
import { buyerApi, type Address, type BuyerProfile } from "./api";

import { MarketIcon } from "./MarketIcon";
import * as storage from "./deviceStorage";

type Draft = Omit<Address, "id" | "version">;
const blank: Draft = { label: "Home", line1: "", locality: "", city: "", pincode: "" };
const fields: { key: keyof Draft; label: string }[] = [{ key: "label", label: "Label (Home, Work)" }, { key: "line1", label: "House, street and landmark" }, { key: "locality", label: "Locality" }, { key: "city", label: "City" }, { key: "pincode", label: "PIN code" }];
type CheckoutEditor = {
  address?: Address;
  isDefault: boolean;
  profile?: BuyerProfile | null;
  onSaved: (address: Address, makeDefault: boolean) => void;
};
export function BuyerAddresses({ token, back, checkout, userId, area }: { token: string; userId?: string; area?: string; back: () => void; checkout?: CheckoutEditor }) {
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [defaultReady, setDefaultReady] = useState(false);
  const defaultKey = userId ? `jpi.address.default.${userId}` : undefined;
  useEffect(() => {
    if (!defaultKey) return;
    let active = true;
    void storage.getItemAsync(defaultKey).then(value => { if (active) setDefaultId(value); }).catch(() => undefined).finally(() => { if (active) setDefaultReady(true); });
    return () => { active = false; };
  }, [defaultKey]);
  const [rows, setRows] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedLabel, setSavedLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [draft, setDraft] = useState<Draft | null>(() => checkout ? (checkout.address ? { label: checkout.address.label, line1: checkout.address.line1, locality: checkout.address.locality, city: checkout.address.city, pincode: checkout.address.pincode } : { ...blank }) : null);
  const [editing, setEditing] = useState<Address | null>(checkout?.address ?? null)
  const [makeDefault, setMakeDefault] = useState(checkout?.isDefault ?? false);
  const checkoutMode = !!checkout;;
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const setDefaultAddress = async (row: Address) => {
    if (!defaultKey || !defaultReady || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await storage.setItemAsync(defaultKey, row.id);
      setDefaultId(row.id);
    } catch {
      setError("Couldn’t set the default address. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const reload = async () => { setLoading(true); setError(null); try { setRows(await buyerApi.addresses(token)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Addresses could not load"); } finally { setLoading(false); } };
  useEffect(() => { if (checkoutMode) return; let active = true; void buyerApi.addresses(token).then((data) => { if (active) setRows(data); }).catch(() => { if (active) setError("Addresses could not load"); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [token, checkoutMode]);
  const save = async () => {
    if (!draft || lock.current) return;
    const input = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()])) as Draft;
    const errors: Partial<Record<keyof Draft, string>> = {};
    if (!input.label) errors.label = "Enter a label, such as Home or Work.";
    if (input.line1.length < 3) errors.line1 = "Enter your house or building and street.";
    if (!input.locality) errors.locality = "Enter your locality.";
    if (!input.city) errors.city = "Enter your city.";
    if (!/^[1-9][0-9]{5}$/.test(input.pincode)) errors.pincode = "Enter a valid 6-digit PIN code.";
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length) return;
    lock.current = true; setBusy(true); setError(null);
    try { const saved = editing ? await buyerApi.updateAddress(token, editing.id, { ...input, version: editing.version }) : await buyerApi.createAddress(token, input); if (checkout) { checkout.onSaved(saved, makeDefault); return; } setRows((old) => editing ? old.map((row) => row.id === saved.id ? saved : row) : [...old, saved]); setSavedLabel(saved.label); setDraft(null); setEditing(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Address could not save"); }
    finally { lock.current = false; setBusy(false); }
  };
  const remove = (row: Address) => Alert.alert("Delete address?", `${row.label}: ${row.line1}`, [{ text: "Keep", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { if (lock.current) return; lock.current = true; setBusy(true); void buyerApi.deleteAddress(token, row.id, row.version).then(() => setRows((old) => old.filter((item) => item.id !== row.id))).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Address could not delete")).finally(() => { lock.current = false; setBusy(false); }); } }]);
  if (draft) {
    const closeEditor = () => {
      if (checkout) { back(); return; }
      setDraft(null);
      setEditing(null);
      setError(null);
      setFieldErrors({});
    };
    const field = (key: keyof Draft) => {
      const label = fields.find(row => row.key === key)!.label;
      return <View key={key} style={s.editorField}>
        <Text style={s.editorLabel}>{key === "line1" ? "Flat, building and street" : key === "label" ? "Label" : label}</Text>
        <TextInput editable={!busy} accessibilityLabel={label} value={draft[key]}
          onChangeText={value => {
            setDraft(old => old ? {...old, [key]: value} : old);
            setFieldErrors(old => ({...old, [key]: undefined}));
          }}
          placeholder={key === "line1" ? "Flat / house, building, street" : undefined}
          keyboardType={key === "pincode" ? "number-pad" : "default"} maxLength={key === "pincode" ? 6 : key === "line1" ? 300 : key === "label" ? 60 : 120}
          style={[s.editorInput, fieldErrors[key] && s.invalidInput]} />
        {!!fieldErrors[key] && <Text accessibilityRole="alert" style={s.fieldError}>{fieldErrors[key]}</Text>}
      </View>;
    };
    return <View style={s.screen} testID={checkout ? "checkout-address-editor" : "account-address-editor"}>
      <View style={[s.header,s.savedWidth]}>
        <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="Back to address list" onPress={closeEditor} style={s.savedBack}><MarketIcon name="chevron-left" /></Pressable>
        <Text accessibilityRole="header" style={s.savedTitle}>{editing ? "Edit address" : "Add address"}</Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.editorContent}>
        <CheckoutHeading title="Make it easy to find you." icon="home" />
        {error && <BuyerStateCard title="Couldn't save this address" copy={error} tone="error" icon="location" compact action="Retry saving address" onAction={() => void save()} />}
        <View style={s.editorCard}>
          {field("label")}
          {checkout?.profile && <>
            <Text style={s.editorLabel}>Recipient name</Text><Text style={s.readonly}>{checkout.profile.name}</Text>
            <Text style={s.editorLabel}>Mobile number</Text><Text style={s.readonly}>{checkout.profile.phone}</Text>
          </>}
          {field("line1")}
          {field("locality")}
          <View style={s.editorRow}>{field("city")}{field("pincode")}</View>
          {checkout && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: makeDefault }} aria-checked={makeDefault} disabled={busy} onPress={() => setMakeDefault(value => !value)} style={s.link}>
            <Text style={s.editorLabel}>{makeDefault ? "✓ " : ""}Set as default on this device</Text>
          </Pressable>}
        </View>
      </ScrollView>
      <View style={s.editorFooter}><Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[s.primary,s.savedAdd,busy && s.saving]}><Text style={s.buttonText}>{busy ? "Saving…" : "Save address"}</Text></Pressable></View>
    </View>;
  }
  return <View style={s.screen}>
    <View style={[s.header,s.savedWidth]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Account" onPress={back} style={s.savedBack}><MarketIcon name="chevron-left" /></Pressable>
      <Text accessibilityRole="header" style={s.savedTitle}>Saved addresses</Text>
    </View>
    <ScrollView contentContainerStyle={s.content}>
      {!!savedLabel && <BuyerStateCard title={`${savedLabel} address saved`} copy="You can select this address at checkout. Your browsing area stays the same." tone="success" compact action="Back to Account" onAction={back} />}
      <View style={s.hero}><View style={[s.icon,s.heroIcon]}><MarketIcon name="location" /></View><Text accessibilityRole="header" style={s.heroTitle}>Your delivery addresses</Text></View>
      {error ? <><Text accessibilityRole="alert" style={s.error}>{error}</Text><Pressable onPress={() => void reload()}><Text style={s.link}>Reload addresses</Text></Pressable></> : null}
      {loading ? <ActivityIndicator color={theme.accentInk} /> : rows.map(row => {
        const isDefault = row.id === defaultId;
        return <View key={row.id} style={[s.savedCard, isDefault && s.defaultCard]}>
          <View style={s.addressHeading}><View style={s.icon}><MarketIcon name="location" /></View><Text style={s.addressLabel}>{row.label}</Text>{isDefault && <Text style={s.defaultBadge}>Default</Text>}</View>
          <Text style={s.copy}>{row.line1}{"\n"}{row.locality}, {row.city} · {row.pincode}</Text>
          <View style={s.savedActions}>
            {defaultKey && !isDefault && <Pressable accessibilityRole="button" accessibilityLabel={`Set ${row.label} as default`} style={s.savedAction} disabled={busy || !defaultReady} onPress={() => void setDefaultAddress(row)}><Text style={s.link}>Set as default</Text></Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${row.label} address`} style={s.savedAction} disabled={busy} onPress={() => { setEditing(row); setDraft({ label: row.label, line1: row.line1, locality: row.locality, city: row.city, pincode: row.pincode }); setError(null); }}><Text style={s.link}>Edit</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${row.label} address`} style={s.savedAction} disabled={busy} onPress={() => remove(row)}><Text style={s.error}>Remove</Text></Pressable>
          </View>
        </View>;
      })}
      {!loading && !error && !rows.length ? <BuyerStateCard title="No saved addresses yet" copy="Add an address to select it at checkout." icon="location" compact /> : null}
      <Text style={s.copy}>{area ? `Your browsing area stays ${area}. ` : ""}Choose a delivery address again at checkout.</Text>
    </ScrollView>
    <View style={s.footer}><Pressable accessibilityRole="button" disabled={busy} onPress={() => { setDraft({ ...blank }); setEditing(null); setError(null); }} style={[s.primary,s.savedAdd]}><Text style={s.buttonText}>+ Add new address</Text></Pressable></View>
  </View>;
}
const s = themedStyles(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.canvas },
  header: { height: 64, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 16 },
  savedWidth: { width: "100%", maxWidth: 600, alignSelf: "center" },
  savedTitle: { fontSize: 22, fontWeight: "700", color: theme.ink, flex: 1 },
  savedBack: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingTop: 8, gap: 16, width: "100%", maxWidth: 600, alignSelf: "center" },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, padding: 20, borderRadius: 24, backgroundColor: theme.selected },
  heroTitle: { flex: 1, color: theme.ink, fontSize: 24, fontWeight: "700" },
  heroIcon: { backgroundColor: theme.surface },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.selected, alignItems: "center", justifyContent: "center" },
  savedCard: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 24, padding: 20, gap: 12 },
  defaultCard: { borderColor: theme.accentInk },
  addressHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  addressLabel: { flex: 1, color: theme.ink, fontSize: 16, fontWeight: "700" },
  defaultBadge: { backgroundColor: theme.selected, color: theme.accentInk, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, fontSize: 12, fontWeight: "700" },
  savedActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", borderTopWidth: 1, borderColor: theme.border },
  savedAction: { minHeight: 44, paddingHorizontal: 8, justifyContent: "center" },
  footer: { padding: 16, backgroundColor: theme.surface, borderTopWidth: 1, borderColor: theme.border },
  savedAdd: { backgroundColor: theme.accentInk, width: "100%", maxWidth: 560, alignSelf: "center" },
  editorContent: { padding: 20, paddingTop: 8, gap: 16, width: "100%", maxWidth: 600, alignSelf: "center" },
  editorCard: { borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, borderRadius: 24, padding: 20, gap: 12 },
  editorField: { flex: 1, minWidth: 0, gap: 10 },
  editorLabel: { color: theme.accentInk, fontSize: 12, lineHeight: 18 },
  editorInput: { minHeight: 52, borderWidth: 1, borderColor: theme.controlBorder, borderRadius: 12, paddingHorizontal: 16, backgroundColor: theme.canvas, color: theme.ink },
  readonly: { borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 16, backgroundColor: theme.canvas, color: theme.ink },
  editorRow: { flexDirection: "row", gap: 12 },
  editorFooter: { backgroundColor: theme.surface, borderTopWidth: 1, borderColor: theme.border, paddingHorizontal: 20, paddingVertical: 16 },
  primary: { minHeight: 50, borderRadius: 12, backgroundColor: theme.primary, justifyContent: "center", alignItems: "center" },
  saving: { opacity: 0.65 },
  invalidInput: { borderColor: theme.errorBorder },
  fieldError: { color: theme.error, fontSize: 13, lineHeight: 18 },
  copy: { fontSize: 14, lineHeight: 21, color: theme.secondary },
  link: { color: theme.accentInk, fontSize: 14, fontWeight: "600", paddingVertical: 8 },
  error: { color: theme.error, fontSize: 14, paddingVertical: 8 },
  buttonText: { color: theme.onPrimary, fontWeight: "600", fontSize: 14 },
}));
