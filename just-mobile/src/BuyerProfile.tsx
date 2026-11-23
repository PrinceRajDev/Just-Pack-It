import { theme, themedStyles } from "./theme";
import { BuyerStateCard } from "./BuyerStateCard";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { buyerApi, type BuyerProfile as Profile } from "./api";

import { MarketIcon } from "./MarketIcon";

export function BuyerProfile({ token, back, onSaved }: { token: string; back: () => void; onSaved: (name: string) => Promise<void> }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  useEffect(() => { let active = true; void buyerApi.profile(token).then((data) => { if (active) { setProfile(data); setName(data.name); setError(null); } }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Profile could not load"); }); return () => { active = false; }; }, [token, attempt]);
  const save = async () => {
    if (!profile || lock.current) return;
    const value = name.trim();
    if (value.length < 2 || value.length > 100) { setError("Enter a name between 2 and 100 characters"); return; }
    lock.current = true; setBusy(true); setError(null); setSuccess(false);
    try { const updated = await buyerApi.updateProfile(token, value, profile.version); setProfile(updated); setName(updated.name); await onSaved(updated.name); setSuccess(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Profile could not save"); }
    finally { lock.current = false; setBusy(false); }
  };
  const disabled = busy || !profile || name.trim() === profile.name;
  return <View style={s.screen}>
    <View style={s.header}><Pressable accessibilityLabel="Back to Account" onPress={back} hitSlop={10}><Text style={s.heading}>‹</Text></Pressable><Text style={s.heading}>Profile</Text></View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {success && <BuyerStateCard title="Profile updated" copy="Your details were saved successfully." tone="success" icon="check" compact action="Back to Account" onAction={back} />}
      <View style={s.hero}><View style={s.icon}><MarketIcon name="account" color={theme.accentInk} /></View><Text style={s.heroTitle}>A little about you.</Text></View>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      {!profile && !error ? <ActivityIndicator color={theme.accentInk} /> : null}
      {!profile && error ? <Pressable onPress={() => { setError(null); setAttempt(value => value + 1); }}><Text style={s.heading}>Retry profile</Text></Pressable> : null}
      {profile ? <View style={s.card}>
        <Text style={s.label}>Full name</Text>
        <TextInput accessibilityLabel="Full name" value={name} onChangeText={(value) => { setName(value); setSuccess(false); }} editable={!busy} maxLength={100} style={s.input} />
        <Text style={s.label}>Mobile number</Text>
        <Text selectable style={s.field}>{profile.phone}</Text>
        <Text style={s.label}>Email</Text>
        <Text selectable style={s.field}>{profile.email || "No email on file"}</Text>
        <Text style={s.label}>Contact details are used for sign-in, email recovery and order updates.</Text>

      </View> : null}
    </ScrollView>
    <View style={s.footer}><Pressable accessibilityRole="button" disabled={disabled} onPress={() => void save()} style={[s.action, disabled && s.disabled]}><Text style={s.actionText}>{busy ? "Saving…" : "Save changes"}</Text></Pressable></View>
  </View>;
}

const s = themedStyles(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.canvas },
  header: { height: 64, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 16 },
  heading: { fontSize: 19, fontWeight: "600", color: theme.accentInk },
  content: { padding: 20, gap: 20 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, padding: 20, borderRadius: 24, backgroundColor: theme.selected },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.surface, alignItems: "center", justifyContent: "center" },
  heroTitle: { flex: 1, fontSize: 24, fontWeight: "600", color: theme.accentInk },
  card: { padding: 20, borderRadius: 24, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, gap: 12 },
  label: { color: theme.accentInk, fontSize: 12, lineHeight: 18 },
  input: { minHeight: 52, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: theme.controlBorder, backgroundColor: theme.canvas, color: theme.ink },
  field: { minHeight: 52, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.canvas, color: theme.ink },
  footer: { backgroundColor: theme.surface, paddingHorizontal: 20, paddingVertical: 16 },
  action: { backgroundColor: theme.primary, borderRadius: 12, minHeight: 50, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.55 },
  actionText: { color: theme.onPrimary, fontWeight: "600", fontSize: 14 },
  error: { color: theme.error },
}));