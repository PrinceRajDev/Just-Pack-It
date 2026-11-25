import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, Platform, StyleSheet, Text, View } from "react-native";
import { theme } from "./theme";

export function StartupScreen({ hindi }: { hindi: boolean }) {
  const [reveal] = useState(() => new Animated.Value(1));
  const [sweep] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    let animation: Animated.CompositeAnimation | undefined;

    const applyPreference = (reduced: boolean) => {
      if (!active) return;
      animation?.stop();
      reveal.setValue(reduced ? 1 : 0);
      sweep.setValue(0);
      if (reduced) return;

      animation = Animated.parallel([
        Animated.timing(reveal, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.loop(Animated.sequence([
          Animated.timing(sweep, {
            toValue: 1,
            duration: 1250,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: Platform.OS !== "web",
            isInteraction: false,
          }),
          Animated.timing(sweep, {
            toValue: 0,
            duration: 1250,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: Platform.OS !== "web",
            isInteraction: false,
          }),
        ])),
      ]);
      animation.start();
    };
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", reduced => {
      preferenceChanged = true;
      applyPreference(reduced);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!preferenceChanged) applyPreference(reduced);
    }).catch(() => undefined);
    return () => {
      active = false;
      subscription.remove();
      animation?.stop();
    };
  }, [reveal, sweep]);

  return (
    <View testID="startup-screen" style={styles.screen}>
      <Animated.View style={[styles.brandGroup, {
        opacity: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }),
        transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }]}>
        <View style={styles.artworkFrame}>
          <Image source={require("../assets/startup-parcel.jpg")} style={styles.artwork} accessible={false} />
        </View>
        <Text style={styles.brand}>JustPackIt</Text>
      </Animated.View>
      <View style={styles.status} accessibilityLiveRegion="polite">
        <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Animated.View style={[styles.bar, {
            transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [0, 68] }) }],
          }]} />
        </View>
        <Text accessibilityRole="header" style={styles.label}>
          {hindi ? "JustPackIt लोड हो रहा है…" : "Loading JustPackIt…"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.canvas, alignItems: "center", justifyContent: "center", padding: 24, gap: 32 },
  brandGroup: { alignItems: "center", gap: 16 },
  artworkFrame: {
    width: 160, height: 160, borderRadius: 33, backgroundColor: theme.selected,
    borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center",
    shadowColor: theme.ink, shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3,
  },
  artwork: { width: "100%", height: "100%", borderRadius: 32 },
  brand: { color: theme.accentInk, fontSize: 36, fontWeight: "800", letterSpacing: -1.4 },
  status: { alignItems: "center", gap: 12 },
  track: { width: 108, height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: theme.selected },
  bar: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.primary },
  label: { color: theme.ink, fontSize: 13, fontWeight: "600", textAlign: "center" },
});
