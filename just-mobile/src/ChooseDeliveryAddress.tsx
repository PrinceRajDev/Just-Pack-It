import { theme } from "./theme";
import { BuyerStateCard } from "./BuyerStateCard";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CheckoutHeading, DeliveryAddressContents } from "./CheckoutPresentation";
import type { Address, BuyerProfile } from "./api";

export function ChooseDeliveryAddress({
  title, hindi, rechecking, rows,
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
  title: string;
  hindi: boolean;
  rechecking: boolean;
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
          {title}
        </Text>
      </View>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        testID="address-scroll"
      >
        <CheckoutHeading title="Where should we deliver?" icon="home" />
        <Text style={s.description}>
          Delivery eligibility and fees are checked for this address, shop by
          shop.
        </Text>
        {loading && <ActivityIndicator color={theme.accentInk} />}
        {error && (
          <BuyerStateCard title={hindi ? "इस पते की पुष्टि नहीं हो सकी" : "We couldn’t verify this address"} copy={hindi ? "इलाका और 6 अंकों का पिन कोड जाँचें। आपका बैग सुरक्षित है।" : error} icon="location" tone="error" compact
            action={rows.some(row => row.id === selected) ? (hindi ? "डिलीवरी का पता बदलें" : "Edit delivery address") : undefined}
            onAction={() => { const address = rows.find(row => row.id === selected); if (address) edit(address); }} />
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

                return (
                  <View key={address.id} style={s.addresses}>
                    <Pressable
                      accessibilityRole="radio"
                      aria-checked={checked}
                      accessibilityState={{ checked, disabled: busy }}
                      accessibilityLabel={`${address.label} address`}
                      disabled={busy}
                      onPress={() => select(address)}
                      style={[s.card, checked && s.selected]}
                    >
                      <DeliveryAddressContents address={address} contact={contact} selected={checked} />
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
          {busy && <ActivityIndicator color={theme.ink} />}
          <Text style={[s.buttonText, s.confirmText]}>
            {busy ? "Checking delivery…" : rechecking ? "Recheck delivery" : "Deliver to this address"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const green = theme.accentInk;
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.canvas },
  header: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  backButton: { minHeight: 44, justifyContent: "center" },
  arrow: { color: green, fontSize: 27, lineHeight: 30 },
  headerText: { color: green, fontSize: 18, fontWeight: "500" },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 16,
  },
  title: { color: theme.ink, fontSize: 25, lineHeight: 34, fontWeight: "600" },
  description: { color: theme.muted, fontSize: 14, lineHeight: 18 },
  addresses: { gap: 16 },
  card: {
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 24,
    backgroundColor: theme.surface,
  },
  selected: { borderColor: green },
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
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.coral },
  label: {
    color: green,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    flexShrink: 1,
  },
  detailPrimary: {
    color: theme.ink,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
    fontWeight: "600",
  },
  detail: { color: theme.muted, fontSize: 13, lineHeight: 18, marginTop: 9 },
  button: {
    backgroundColor: theme.surface,
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
  add: { backgroundColor: theme.lime },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  confirm: { backgroundColor: theme.coral },
  confirmText: { color: theme.ink },
  disabled: { opacity: 0.55 },
  error: { color: theme.error, fontSize: 14, lineHeight: 20 },
});
