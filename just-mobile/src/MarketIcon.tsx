import { theme } from "./theme";
import { View } from "react-native";
export type MarketIconName = "home" | "browse" | "bag" | "orders" | "account" | "search" | "bell" | "location" | "heart" | "globe" | "store" | "chevron-left" | "chevron-right";
export function MarketIcon({ name, color = theme.accentInk }: { name: MarketIconName; color?: string }) {
  const line = { borderColor: color, borderWidth: 1.8 };
  if (name === "chevron-left" || name === "chevron-right") {
    return <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
      <View style={[line, { width: 9, height: 9, borderLeftWidth: 0, borderBottomWidth: 0, transform: [{ rotate: name === "chevron-left" ? "-135deg" : "45deg" }] }]} />
    </View>;
  }
  if (name === "heart" || name === "globe" || name === "store") {
    return <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
      {name === "heart" ? <>
        <View style={[line, { position: "absolute", width: 12, height: 17, borderRadius: 7, borderRightWidth: 0, borderBottomWidth: 0, top: 3, left: 4, transform: [{ rotate: "-45deg" }] }]} />
        <View style={[line, { position: "absolute", width: 12, height: 17, borderRadius: 7, borderLeftWidth: 0, borderBottomWidth: 0, top: 3, right: 4, transform: [{ rotate: "45deg" }] }]} />
      </> : name === "globe" ? <>
        <View style={[line, { width: 20, height: 20, borderRadius: 10 }]} />
        <View style={[line, { position: "absolute", width: 9, height: 20, borderRadius: 10 }]} />
        <View style={{ position: "absolute", width: 18, height: 1.8, backgroundColor: color }} />
      </> : <>
        <View style={[line, { position: "absolute", top: 3, width: 22, height: 7, borderRadius: 3 }]} />
        <View style={[line, { position: "absolute", bottom: 3, width: 18, height: 13, borderTopWidth: 0, borderRadius: 2 }]} />
        <View style={[line, { position: "absolute", bottom: 3, width: 6, height: 8, borderBottomWidth: 0 }]} />
      </>}
    </View>;
  }
  if (name === "location") {
    return (
      <View style={{ width: 20, height: 22, alignItems: "center", justifyContent: "center" }}>
        <View style={[line, { width: 15, height: 15, borderRadius: 8, borderBottomRightRadius: 2, transform: [{ rotate: "45deg" }] }]} />
        <View style={[line, { position: "absolute", width: 6, height: 6, borderRadius: 3 }]} />
      </View>
    );
  }
  return <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
    {name === "browse" ? <View style={{ width: 22, height: 22, flexDirection: "row", flexWrap: "wrap", gap: 4 }}>{[0,1,2,3].map((key) => <View key={key} style={[line, { width: 9, height: 9, borderRadius: 2 }]} />)}</View> : name === "bag" ? <><View style={[line, { width: 19, height: 17, borderRadius: 4, marginTop: 6 }]} /><View style={[line, { position: "absolute", top: 0, width: 9, height: 11, borderRadius: 5 }]} /></> : name === "account" ? <><View style={[line, { width: 9, height: 9, borderRadius: 5, position: "absolute", top: 0 }]} /><View style={[line, { width: 21, height: 11, borderTopLeftRadius: 12, borderTopRightRadius: 12, position: "absolute", bottom: 0 }]} /></> : name === "search" ? <><View style={[line, { width: 16, height: 16, borderRadius: 9, position: "absolute", top: 1, left: 1 }]} /><View style={{ width: 10, height: 2, backgroundColor: color, transform: [{ rotate: "45deg" }], position: "absolute", bottom: 4, right: 0 }} /></> : name === "home" ? <><View style={[line, { width: 15, height: 15, transform: [{ rotate: "45deg" }], position: "absolute", top: 2, borderRightWidth: 0, borderBottomWidth: 0 }]} /><View style={[line, { width: 18, height: 15, position: "absolute", bottom: 0, borderTopWidth: 0, borderRadius: 2 }]} /><View style={[line, { width: 6, height: 8, position: "absolute", bottom: 0, borderBottomWidth: 0 }]} /></> : name === "bell" ? <><View style={[line, { width: 18, height: 18, borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }]} /><View style={{ width: 5, height: 2, backgroundColor: color, position: "absolute", bottom: 0 }} /></> : <><View style={[line, { width: 18, height: 22, borderRadius: 3 }]} />{[7,12,17].map((top) => <View key={top} style={{ position: "absolute", width: 10, height: 2, top, backgroundColor: color }} />)}</>}
  </View>;
}
