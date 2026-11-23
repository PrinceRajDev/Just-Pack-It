import { theme, themedStyles } from "./theme";
import { StyleSheet, Text, View } from "react-native";
import type { Address } from "./api";
import { MarketIcon, type MarketIconName } from "./MarketIcon";

export function CheckoutHeading({ title, icon, plain }: { title: string; icon: MarketIconName; plain?: boolean }) {
  return <View style={[s.hero, plain && s.plain]}>
    <View style={[s.icon, plain && s.sage]}><MarketIcon name={icon} /></View>
    <Text accessibilityRole="header" style={s.title}>{title}</Text>
  </View>;
}

export function DeliveryAddressContents({ address, contact, selected }: { address: Pick<Address, "label" | "line1" | "locality" | "city" | "pincode">; contact?: string; selected?: boolean }) {
  return <>
    <View style={s.row}>
      <View style={[s.icon, s.addressIcon, s.sage]}><MarketIcon name="home" /></View>
      <Text style={s.label}>{selected ? "◉" : "○"} {address.label}</Text>
    </View>
    <Text style={s.contact}>{contact || address.line1}</Text>
    <Text style={s.detail}>{contact ? address.line1 + "\n" : ""}{address.locality}, {address.city} · {address.pincode}</Text>
  </>;
}

const s = themedStyles(() => StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 24, backgroundColor: theme.selected },
  plain: { backgroundColor: "transparent", padding: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.surface, alignItems: "center", justifyContent: "center" },
  addressIcon: { width: 32, height: 32, borderRadius: 10 },
  sage: { backgroundColor: theme.selected },
  title: { color: theme.accentInk, fontSize: 24, lineHeight: 34, fontWeight: "500", flex: 1 },
  label: { color: theme.accentInk, fontSize: 15, fontWeight: "500", flexShrink: 1 },
  contact: { color: theme.ink, fontSize: 14, marginTop: 12, lineHeight: 20, fontWeight: "500" },
  detail: { color: theme.muted, fontSize: 12, marginTop: 10, lineHeight: 18 },
}));
