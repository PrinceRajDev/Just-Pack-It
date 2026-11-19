import { StyleSheet, Text, View } from "react-native";

export function BuyerAuthNotice({
  title,
  copy,
  warning = false,
}: {
  title: string;
  copy: string;
  warning?: boolean;
}) {
  return (
    <View
      accessibilityRole={warning ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      style={[s.card, warning && s.warning]}
    >
      <Text accessibilityRole="header" style={s.title}>
        {title}
      </Text>
      <Text style={s.copy}>{copy}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "#EAF0D9", padding: 16, borderRadius: 16, gap: 8 },
  warning: { backgroundColor: "#FFF1D5" },
  title: { color: "#07552F", fontSize: 22, lineHeight: 28, fontWeight: "700" },
  copy: { color: "#344338", fontSize: 13, lineHeight: 19 },
});
