import { useEffect, useRef, useState } from "react";
import { geocodeAsync, requestForegroundPermissionsAsync } from "expo-location";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import type { Address } from "./api";
import { theme } from "./theme";

type Point = NonNullable<Address["location"]>;

export function FindDeliveryLocation({address, disabled, hindi, onConfirm}: {
  address: string;
  disabled: boolean;
  hindi: boolean;
  onConfirm: (point: Point) => void;
}) {
  const [candidate, setCandidate] = useState<Point>();
  const [previewed, setPreviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  if (Platform.OS === "web") return null;
  const t = (en: string, hi: string) => hindi ? hi : en;
  const find = async () => {
    if (pending.current) return;
    if (!address) {
      setError(t("Enter the street, locality, city and PIN code first.", "पहले सड़क, इलाका, शहर और पिन कोड दर्ज करें।"));
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    setCandidate(undefined);
    setPreviewed(false);
    try {
      if (Platform.OS === "android" && !(await requestForegroundPermissionsAsync()).granted) {
        if (active.current) setError(t("Allow location access in settings to find this address.", "पता ढूँढने के लिए सेटिंग्स में लोकेशन की अनुमति दें।"));
        return;
      }
      if (!active.current) return;
      const places = await geocodeAsync(address);
      if (!active.current) return;
      if (places.length !== 1) {
        setError(t("Couldn’t find a single match. Check the street, landmark and PIN code, then try again.", "एक सटीक पता नहीं मिला। सड़क, लैंडमार्क और पिन कोड जाँचकर फिर कोशिश करें।"));
        return;
      }
      const {latitude,longitude} = places[0];
      setCandidate({type:"Point",coordinates:[longitude,latitude]});
    } catch {
      if (active.current) setError(t("Address lookup is unavailable. Please try again.", "पता अभी नहीं ढूँढ सके। फिर कोशिश करें।"));
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  };
  const preview = async (point: Point) => {
    try {
      const [lng,lat] = point.coordinates;
      await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`);
      if (active.current) { setError(""); setPreviewed(true); }
    } catch {
      if (active.current) setError(t("Couldn’t open Maps. Try again.", "मैप नहीं खुला। फिर कोशिश करें।"));
    }
  };
  return <View style={{gap:8}}>
    <LocationAction label={busy ? t("Finding address…", "पता ढूँढ रहे हैं…") : t("Find on map", "मैप पर ढूँढें")} disabled={disabled || busy} onPress={() => void find()} />
    {candidate && <>
      <Text style={{color:theme.ink}}>{t("Preview the pin in Maps. Confirm it only if it matches your delivery entrance.", "मैप में पिन देखें। अगर यह डिलीवरी के गेट पर है, तभी पुष्टि करें।")}</Text>
      <LocationAction label={t("Preview pin in Maps", "मैप में पिन देखें")} disabled={disabled || busy} onPress={() => void preview(candidate)} />
      <LocationAction label={t("Confirm this delivery location", "डिलीवरी की जगह की पुष्टि करें")} disabled={disabled || busy || !previewed} onPress={() => {
        onConfirm(candidate);
        setCandidate(undefined);
        setPreviewed(false);
      }} />
    </>}
    {!!error && <Text accessibilityRole="alert" style={{color:theme.ink}}>{error}</Text>}
  </View>;
}

function LocationAction({label,disabled,onPress}: {label:string; disabled:boolean; onPress:()=>void}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={{minHeight:44, borderRadius:12, justifyContent:"center", alignItems:"center", backgroundColor:theme.selected, opacity:disabled ? 0.5 : 1}}>
    <Text style={{color:theme.accentInk,fontWeight:"700"}}>{label}</Text>
  </Pressable>;
}
