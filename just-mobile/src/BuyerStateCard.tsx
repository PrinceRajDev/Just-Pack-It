import { theme } from "./theme";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { MarketIcon, type MarketIconName } from "./MarketIcon";
import { OrderSymbol } from "./BuyerOrderDetails";

type Tone = "neutral" | "info" | "warning" | "error" | "success";
type Icon = MarketIconName | "shop" | "wallet" | "location" | "lock" | "mail" | "heart" | "check" | "clock" | "network" | "warning" | "pack";

export function BuyerStateCard({ title, copy, tone = "neutral", icon, compact, action, onAction, busyLabel, loading }: {
  title: string;
  copy?: string;
  tone?: Tone;
  icon?: Icon;
  compact?: boolean;
  action?: string;
  onAction?: () => void;
  busyLabel?: string;
  loading?: boolean;
}) {
  const light = tone === "success";
  return <View accessibilityRole={tone === "error" ? "alert" : undefined} accessibilityLiveRegion="polite" style={[s.card, s[tone]]}>
    <View style={compact && s.inline}>
      <View style={[s.icon, !compact && s.largeIcon, tone === "error" && s.errorIcon, (tone === "info" || busyLabel || loading) && s.whiteIcon]}>
        {busyLabel || loading ? <ActivityIndicator color={theme.accentInk} size="small" /> : <StateIcon icon={icon ?? (tone === "error" ? "warning" : "check")} red={tone === "error"} />}
      </View>
      <Text accessibilityRole="header" style={[s.title, compact ? s.compactTitle : s.stackedTitle, tone === "error" && s.red, light && s.light]}>{title}</Text>
    </View>
    {!!copy && <Text style={[s.copy, light && s.lightCopy]}>{copy}</Text>}
    {!!action && onAction && <Pressable accessibilityRole="button" style={[s.action, light && s.secondary]} onPress={onAction}><Text style={[s.actionText, light && s.green]}>{action}</Text></Pressable>}
    {!!busyLabel && <View accessibilityState={{ disabled: true, busy: true }} style={[s.action, s.disabled]}><Text style={s.disabledText}>{busyLabel}</Text></View>}
  </View>;
}

function StateIcon({ icon, red }: { icon: Icon; red: boolean }) {
  const color = red ? theme.error : theme.accentInk;
  if (["home","browse","bag","orders","account","search","bell"].includes(icon))
    return <MarketIcon name={icon as MarketIconName} color={color} />;
  if (icon === "shop" || icon === "wallet" || icon === "clock")
    return <OrderSymbol name={icon === "clock" ? "delayed" : icon} color={color} />;
  const line = { borderColor: color, borderWidth: 1.5 };
  if (icon === "lock") return <View style={{width:22,height:22,alignItems:"center",justifyContent:"flex-end"}}>
    <View style={[line,{position:"absolute",top:2,width:9,height:10,borderRadius:5}]} />
    <View style={[line,{width:14,height:13,borderRadius:2,backgroundColor:theme.lime,alignItems:"center",justifyContent:"center"}]}><View style={{width:1.5,height:4,backgroundColor:color}} /></View>
  </View>;
  if (icon === "network") return <View style={{width:24,height:22,alignItems:"center",justifyContent:"center"}}>
    {[22,15,7].map((width,index) => <View key={width} style={{position:"absolute",width,height:width/2,borderColor:color,borderTopWidth:1.5,borderRadius:width,top:3+index*4}} />)}
    <View style={{width:3,height:3,backgroundColor:color,borderRadius:2,position:"absolute",bottom:3}} />
  </View>;
  const glyphs = { location: "◎", mail: "✉", heart: "♡", check: "✓", warning: "⚠", pack: "◇" };
  return <Text style={[s.glyph, {color}]}>{glyphs[icon as keyof typeof glyphs]}</Text>;
}

export function BuyerStateSkeleton() {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.skeletonList}>
    {[0,1,2,3].map(index => <View key={index} style={s.skeletonRow}>
      <View style={s.skeletonPhoto} />
      <View style={s.skeletonLines}>{(["74%","87%","53%"] as const).map(width => <View key={width} style={[s.skeletonLine,{width}]} />)}</View>
    </View>)}
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 24, padding: 20, gap: 14 },
  neutral: {},
  warning: { borderColor: theme.warningBorder },
  error: { borderColor: theme.errorBorder },
  info: { backgroundColor:theme.lime, borderColor: theme.border },
  success: { backgroundColor:theme.mint, borderColor:theme.mint },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme.lime },
  largeIcon: { width: 54, height: 54, borderRadius: 16 },
  errorIcon: { backgroundColor: theme.canvas },
  whiteIcon: { backgroundColor: theme.surface },
  glyph: { fontSize: 23 },
  inline: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: theme.accentInk, fontWeight: "500" },
  compactTitle: { fontSize: 18, lineHeight: 24, flex: 1 },
  stackedTitle: { fontSize: 27, lineHeight: 36, marginTop: 14 },
  copy: { color: theme.secondary, fontSize: 14, lineHeight: 20 },
  red: { color: theme.error },
  light: { color: theme.ink },
  lightCopy: { color:theme.secondary },
  action: { minHeight: 50, paddingHorizontal: 12, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.coral },
  actionText: { fontSize: 15, color: theme.ink, fontWeight: "500", textAlign: "center" },
  secondary: { backgroundColor: theme.lime },
  green: { color: theme.accentInk },
  disabled: { backgroundColor: theme.disabled },
  disabledText: { color: theme.muted, fontSize: 15, textAlign: "center" },
  skeletonList: { gap: 16 },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  skeletonPhoto: { height: 64, width: 64, borderRadius: 12, backgroundColor: theme.lime },
  skeletonLines: { flex: 1, gap: 8 },
  skeletonLine: { height: 10, borderRadius: 6, backgroundColor: theme.lime },
});
