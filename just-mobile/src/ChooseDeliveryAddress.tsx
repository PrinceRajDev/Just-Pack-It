import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Address, BuyerProfile } from "./api";

export function ChooseDeliveryAddress({
  rows,
  selected,
  preferred,
  profile,
  busy,
  loading,
  error,
  canDeliver,
  back,
  select,
  edit,
  add,
  confirm,
  reload,
}: {
  rows: Address[];
  selected?: string;
  preferred?: string;
  profile: BuyerProfile | null;
  busy: boolean;
  loading: boolean;
  error: string | null;
  canDeliver: boolean;
  back: () => void;
  select: (address: Address) => void;
  edit: (address: Address) => void;
  add: () => void;
  confirm: () => void;
  reload: () => void;
}) {
  return (
    <View style={s.screen} testID="choose-address">
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back from choose address"
          disabled={busy}
          onPress={back}
          hitSlop={8}
          style={s.backButton}
        >
          <Text style={s.arrow}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={s.headerText}>
          Choose address
        </Text>
      </View>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        testID="address-scroll"
      >
        <Text accessibilityRole="header" style={s.title}>
          Where should we deliver?
        </Text>
        <Text style={s.description}>
          Delivery eligibility and fees are checked for this address, shop by
          shop.
        </Text>
        {loading && <ActivityIndicator color="#07552F" />}
        {error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {!loading && (
          <>
            {error && (
              <Pressable
                accessibilityRole="button"
                style={s.button}
                onPress={reload}
                disabled={busy}
              >
                <Text style={s.buttonText}>Reload addresses</Text>
              </Pressable>
            )}
            {!rows.length && !error && (
              <Text style={s.description}>
                No saved addresses yet. Add your delivery address above.
              </Text>
            )}
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Saved delivery addresses"
              style={s.addresses}
            >
              {rows.map((address) => {
                const checked = address.id === selected;
                const contact =
                  address.id === preferred && profile
                    ? [
                        profile.name,
                        profile.phone.replace(
                          /^\+91([6-9]\d{4})(\d{5})$/,
                          "$1 $2",
                        ),
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "";
                const details = [address.locality, address.city].join(", ");
                return (
                  <View key={address.id} style={s.addresses}>
                    <Pressable
                      accessibilityRole="radio"
                      aria-checked={checked}
                      accessibilityState={{ checked, disabled: busy }}
                      accessibilityLabel={`${address.label} address`}
                      disabled={busy}
                      onPress={() => select(address)}
                      style={s.card}
                    >
                      <View style={s.labelRow}>
                        <View style={s.radio}>
                          {checked && <View style={s.dot} />}
                        </View>
                        <Text style={s.label}>{address.label}</Text>
                      </View>
                      <Text style={s.detailPrimary}>
                        {contact || address.line1}
                      </Text>
                      <Text style={s.detail}>
                        {contact
                          ? `${address.line1}\n${details} · ${address.pincode}`
                          : `${details}, ${address.pincode}`}
                      </Text>
                    </Pressable>
                    {checked && (
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => edit(address)}
                        style={s.button}
                      >
                        <Text style={s.buttonText}>
                          Edit {address.label} address
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              style={[s.button, s.add]}
              onPress={add}
              disabled={busy}
            >
              <Text style={s.buttonText}>+ Add new address</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
      <View style={s.footer} testID="address-footer">
        <Pressable
          accessibilityRole="button"
          disabled={!canDeliver || busy || loading}
          onPress={confirm}
          style={[s.button, s.confirm, (!canDeliver || loading) && s.disabled]}
        >
          {busy && <ActivityIndicator color="#fff" />}
          <Text style={[s.buttonText, s.confirmText]}>
            {busy ? "Checking delivery…" : "Deliver to this address"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const green = "#07552F";
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FAF8F1" },
  header: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  backButton: { minHeight: 44, justifyContent: "center" },
  arrow: { color: green, fontSize: 27, lineHeight: 30 },
  headerText: { color: green, fontSize: 21, fontWeight: "600" },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 20,
  },
  title: { color: "#252D25", fontSize: 25, lineHeight: 34, fontWeight: "600" },
  description: { color: "#73796E", fontSize: 14, lineHeight: 18 },
  addresses: { gap: 20 },
  card: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#E0E3D8",
    borderRadius: 16,
    backgroundColor: "#fff",
  },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  radio: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: green,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: green },
  label: {
    color: green,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    flexShrink: 1,
  },
  detailPrimary: {
    color: "#252D25",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
    fontWeight: "600",
  },
  detail: { color: "#73796E", fontSize: 13, lineHeight: 18, marginTop: 9 },
  button: {
    backgroundColor: "#fff",
    minHeight: 50,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  buttonText: {
    color: green,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  add: { backgroundColor: "#EAF0D9" },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#fff",
  },
  confirm: { backgroundColor: green },
  confirmText: { color: "#fff" },
  disabled: { opacity: 0.55 },
  error: { color: "#A23425", fontSize: 14, lineHeight: 20 },
});
