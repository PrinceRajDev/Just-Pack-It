import { cardShadow, theme, themedStyles } from "./theme";
import { BuyerStateCard } from "./BuyerStateCard";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { buyerApi, type BuyerProfile as Profile } from "./api";

import { MarketIcon } from "./MarketIcon";

export function BuyerProfile({ token, back, onSaved }: { token: string; back: () => void; onSaved: (name: string) => Promise<void> }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  useEffect(() => { let active = true; void buyerApi.profile(token).then((data) => { if (active) { setProfile(data); setName(data.name); setError(null); } }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Profile could not load"); }); return () => { active = false; }; }, [token, attempt]);
  const trimmedName = name.trim();
  const invalidName = trimmedName.length < 2 || trimmedName.length > 100;
  const showNameError = nameTouched && invalidName && trimmedName !== profile?.name;
  const save = async () => {
    if (!profile || lock.current) return;
    if (invalidName || trimmedName === profile.name) return;
    lock.current = true; setBusy(true); setError(null); setSuccess(false);
    try { const updated = await buyerApi.updateProfile(token, trimmedName, profile.version); setProfile(updated); setName(updated.name); setNameTouched(false); await onSaved(updated.name); setSuccess(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Profile could not save"); }
    finally { lock.current = false; setBusy(false); }
  };
  const disabled = busy || !profile || invalidName || trimmedName === profile.name;
  return <View style={s.screen}>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Account" onPress={back} style={s.backButton}><MarketIcon name="chevron-left" /></Pressable>
      <Text accessibilityRole="header" style={s.heading}>Profile</Text>
    </View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {success && <BuyerStateCard title="Profile updated" copy="Your details were saved successfully." tone="success" icon="check" compact action="Back to Account" onAction={back} />}
      <View style={s.hero}>
        <View style={s.icon}><MarketIcon name="account" /></View>
        <View style={s.intro}>
          <Text accessibilityRole="header" style={s.heroTitle}>Personal details</Text>
          <Text style={s.copy}>Update the name on your JustPackIt account.</Text>
        </View>
      </View>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      {!profile && !error ? <ActivityIndicator color={theme.accentInk} /> : null}
      {!profile && error ? <Pressable accessibilityRole="button" style={s.backButton} onPress={() => { setError(null); setAttempt(value => value + 1); }}><Text style={s.retryText}>Retry profile</Text></Pressable> : null}
      {profile ? <View style={s.card}>
        <Text style={s.label}>Full name</Text>
        <TextInput accessibilityLabel="Full name" autoComplete="name" value={name} onChangeText={(value) => { setName(value); setNameTouched(true); setSuccess(false); setError(null); }} editable={!busy} maxLength={100} style={[s.input, showNameError && s.invalidInput]} />
        {showNameError && <Text accessibilityRole="alert" style={s.error}>Enter a name between 2 and 100 characters.</Text>}
        <View style={s.contacts}>
          <Text accessibilityRole="header" style={s.label}>Contact details</Text>
          <Text style={s.copy}>Mobile number</Text>
          <Text selectable style={s.contactValue}>{profile.phone}</Text>
          <Text style={s.copy}>Email</Text>
          <Text selectable style={s.contactValue}>{profile.email || "No email on file"}</Text>
          <Text style={s.copy}>Used for sign-in, email recovery and order updates.</Text>
        </View>
      </View> : null}
    </ScrollView>
    <View style={s.footer}><Pressable accessibilityRole="button" disabled={disabled} onPress={() => void save()} style={[s.action, disabled && s.disabled]}><Text style={s.actionText}>{busy ? "Saving…" : "Save changes"}</Text></Pressable></View>
  </View>;
}

const s = themedStyles(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.canvas },
  header: { minHeight: 64, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 12, width: "100%", maxWidth: 600, alignSelf: "center" },
  heading: { fontSize: 22, fontWeight: "700", color: theme.ink },
  backButton: { minWidth: 44, minHeight: 44, paddingHorizontal: 8, borderRadius: 12, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
  retryText: { color: theme.accentInk, fontWeight: "700" },
  content: { padding: 20, paddingTop: 8, gap: 16, width: "100%", maxWidth: 600, alignSelf: "center" },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 24, backgroundColor: theme.selected },
  intro: { flex: 1, gap: 4 },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.surface, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 24, fontWeight: "700", color: theme.ink },
  card: { padding: 16, borderRadius: 20, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, gap: 8, ...cardShadow },
  label: { color: theme.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  input: { minHeight: 52, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: theme.accentInk, backgroundColor: theme.canvas, color: theme.ink, fontSize: 16 },
  invalidInput: { borderColor: theme.errorBorder },
  contacts: { borderTopWidth: 1, borderColor: theme.border, paddingTop: 16, marginTop: 8, gap: 8 },
  contactValue: { color: theme.ink, fontSize: 15, lineHeight: 20 },
  copy: { color: theme.ink, fontSize: 13, lineHeight: 18 },
  footer: { backgroundColor: theme.surface, borderTopWidth: 1, borderColor: theme.border, paddingHorizontal: 20, paddingVertical: 12 },
  action: { backgroundColor: theme.accentInk, borderRadius: 12, minHeight: 48, alignItems: "center", justifyContent: "center", width: "100%", maxWidth: 560, alignSelf: "center" },
  disabled: { opacity: 0.55 },
  actionText: { color: theme.onPrimary, fontWeight: "600", fontSize: 14 },
  error: { color: theme.error },
}));
