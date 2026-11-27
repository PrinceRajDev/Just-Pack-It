import { useEffect, useRef, useState } from "react";
import { Accuracy, getCurrentPositionAsync, requestForegroundPermissionsAsync } from "expo-location";
import { Pressable, Text, View } from "react-native";
import { theme } from "./theme";

type Coordinates = { latitude: number; longitude: number };

export function CurrentLocationButton({ onLocation, disabled, hindi }: {
  onLocation: (coordinates: Coordinates, isActive: () => boolean) => void | Promise<void>;
  disabled?: boolean;
  hindi?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const t = (en: string, hi: string) => hindi ? hi : en;
  const detect = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const permission = await requestForegroundPermissionsAsync();
      if (!active.current) return;
      if (!permission.granted) {
        setMessage(t("Allow location in settings or enter it manually.", "सेटिंग्स में लोकेशन की अनुमति दें या खुद दर्ज करें।"));
        return;
      }
      const { coords } = await Promise.race([
        getCurrentPositionAsync({ accuracy: Accuracy.High }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Location timed out")), 15000); }),
      ]);
      if (!active.current) return;
      if (coords.accuracy == null || coords.accuracy > 150) {
        setMessage(t("Location is approximate. Enable precise location or enter the map pin manually.", "सटीक लोकेशन चालू करें या मैप पिन खुद दर्ज करें।"));
        return;
      }
      await onLocation(coords, () => active.current);
    } catch {
      if (active.current) setMessage(t("Couldn’t use your current location. Try again or enter it manually.", "मौजूदा लोकेशन नहीं मिली। फिर कोशिश करें या खुद दर्ज करें।"));
    } finally {
      clearTimeout(timer);
      pending.current = false;
      if (active.current) setBusy(false);
    }
  };
  return <View style={{ gap: 6 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ busy }} disabled={disabled || busy}
      onPress={() => void detect()} style={{ minHeight: 44, borderRadius: 12, justifyContent: "center", alignItems: "center", backgroundColor: theme.selected }}>
      <Text style={{ color: theme.accentInk, fontWeight: "700" }}>{busy ? t("Finding your location…", "लोकेशन ढूँढ रहे हैं…") : t("Use current location", "मौजूदा लोकेशन इस्तेमाल करें")}</Text>
    </Pressable>
    {!!message && <Text accessibilityRole="alert" style={{ color: theme.ink }}>{message}</Text>}
  </View>;
}
