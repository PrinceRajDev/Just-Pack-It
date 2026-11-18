import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput } from "react-native";
import { buyerApi, type BuyerProfile as Profile } from "./api";

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
  return <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120, gap: 16 }} keyboardShouldPersistTaps="handled"><Pressable disabled={busy} onPress={back}><Text style={{ color: "#174B34", paddingVertical: 8 }}>← Account</Text></Pressable><Text style={{ fontSize: 26, color: "#1F2A22" }}>Your profile</Text>{error ? <Text accessibilityRole="alert" style={{ color: "#B3432B" }}>{error}</Text> : null}{!profile && !error ? <ActivityIndicator color="#174B34" /> : null}{profile ? <><Text style={{ fontWeight: "600", color: "#1F2A22" }}>Name</Text><TextInput accessibilityLabel="Name" value={name} onChangeText={(value) => { setName(value); setSuccess(false); }} editable={!busy} maxLength={100} style={{ height: 48, borderRadius: 8, borderWidth: 1, borderColor: "#DDD6C9", backgroundColor: "#FDFBF7", paddingHorizontal: 12, color: "#1F2A22" }} /><Text>Mobile: {profile.phone}</Text>{profile.email ? <Text>Email: {profile.email} · {profile.emailVerified ? "Verified" : "Not verified"}</Text> : null}<Text style={{ color: "#5E554A", lineHeight: 21 }}>Contact details are shown from your account. Contact changes require verification.</Text><Pressable disabled={busy || name.trim() === profile.name} onPress={() => void save()} style={{ minHeight: 48, padding: 12, borderRadius: 8, backgroundColor: "#174B34", alignItems: "center", justifyContent: "center", opacity: busy || name.trim() === profile.name ? 0.5 : 1 }}><Text style={{ color: "#fff", fontWeight: "600" }}>{busy ? "Saving…" : "Save name"}</Text></Pressable>{success ? <Text style={{ color: "#174B34" }}>Profile saved</Text> : null}</> : null}<Pressable disabled={busy} onPress={() => { setSuccess(false); setAttempt((value) => value + 1); }}><Text style={{ color: "#174B34", paddingVertical: 8 }}>Reload profile</Text></Pressable></ScrollView>;
}
