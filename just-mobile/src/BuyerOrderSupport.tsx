import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { buyerApi, type OrderSupportMessage, type OrderSupportTicket } from "./api";
import { theme } from "./theme";

const reasons = [
  ["delivery", "Delivery issue"],
  ["missing_item", "Missing item"],
  ["quality", "Wrong or damaged item"],
  ["payment", "Payment or refund"],
  ["other", "Other"],
] as const;
const statusLabels: Record<OrderSupportTicket["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

export function BuyerOrderSupport({ token, orderId, suborderId }: { token: string; orderId: string; suborderId: string }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [kind, setKind] = useState<(typeof reasons)[number][0]>();
  const [description, setDescription] = useState("");
  const [ticket, setTicket] = useState<OrderSupportTicket>();
  const [messages, setMessages] = useState<OrderSupportMessage[]>([]);
  const [nextMessage, setNextMessage] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try { await action(); }
    catch { setError("Couldn’t reach order support. Please try again."); }
    finally { lock.current = false; setBusy(false); }
  };
  const loadMessages = async (id: string, cursor?: string) => {
    const page = await buyerApi.orderSupportMessages(token, id, cursor);
    setMessages(previous => cursor ? [...previous, ...page.items] : page.items);
    setNextMessage(page.next);
  };
  const check = () => run(async () => {
    let cursor: string | undefined;
    do {
      const page = await buyerApi.orderSupport(token, orderId, cursor);
      const existing = page.items.find(item => item.suborderId === suborderId);
      if (existing) {
        setTicket(existing);
        await loadMessages(existing.id);
        break;
      }
      cursor = page.next;
    } while (cursor);
    setChecked(true);
  });
  const submit = () => {
    if (!kind || description.trim().length < 10) {
      setError("Choose an issue and describe it in at least 10 characters.");
      return;
    }
    void run(async () => {
      const saved = await buyerApi.createOrderSupport(token, { orderId, suborderId, kind, description: description.trim() });
      setTicket(saved);
      await loadMessages(saved.id);
    });
  };
  return <View style={styles.section}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} disabled={busy} style={styles.action} onPress={() => {
      setOpen(!open);
      if (!open) void check();
    }}><Text style={styles.actionText}>{open ? "Hide order help" : "Get help"}</Text></Pressable>
    {open && <>
      {busy && <Text accessibilityLiveRegion="polite" style={styles.copy}>{checked && !ticket ? "Sending request…" : "Checking support requests…"}</Text>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {ticket ? <View style={styles.section}>
        <Text accessibilityLiveRegion="polite" style={styles.copy}>Support request · {statusLabels[ticket.status]}</Text>
        {!!ticket.note && !messages.some(message => message.kind === "status" && message.body === ticket.note) && <Text style={styles.copy}>{ticket.note}</Text>}
        {messages.map(message => (
          <View key={message.id} style={styles.message}>
            <Text style={styles.actionText}>{message.kind === "status" ? "Status update" : message.role === "buyer" ? "You" : "Support"}</Text>
            <Text style={styles.copy}>{message.body}</Text>
          </View>
        ))}
        {nextMessage && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(() => loadMessages(ticket.id, nextMessage))} style={styles.action}>
          <Text style={styles.actionText}>Load more messages</Text>
        </Pressable>}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void check()} style={styles.action}>
          <Text style={styles.actionText}>Refresh support status</Text>
        </Pressable>
      </View> : checked ? <>
        <View style={styles.reasons}>
          {reasons.map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: kind === value }} disabled={busy} onPress={() => { setKind(value); setError(""); }} style={[styles.action, kind === value && styles.selected]}>
            <Text style={styles.actionText}>{label}</Text>
          </Pressable>)}
        </View>
        <TextInput accessibilityLabel="Describe the issue" placeholder="Describe the issue" placeholderTextColor={theme.muted} multiline maxLength={2000} editable={!busy} value={description} onChangeText={value => { setDescription(value); setError(""); }} style={styles.input} />
        <Pressable accessibilityRole="button" disabled={busy} onPress={submit} style={[styles.action, styles.primary]}><Text style={styles.primaryText}>Send support request</Text></Pressable>
      </> : !busy && <Pressable accessibilityRole="button" onPress={() => void check()} style={styles.action}><Text style={styles.actionText}>Retry support</Text></Pressable>}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  message: { padding: 12, gap: 4, borderRadius: 12, backgroundColor: theme.canvas, borderWidth: 1, borderColor: theme.border },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border },
  selected: { backgroundColor: theme.selected, borderColor: theme.accentInk },
  actionText: { color: theme.accentInk, fontWeight: "600" },
  primary: { backgroundColor: theme.accentInk, alignItems: "center" },
  primaryText: { color: theme.onPrimary, fontWeight: "700" },
  copy: { color: theme.ink, lineHeight: 20 },
  error: { color: theme.error },
  input: { minHeight: 84, textAlignVertical: "top", padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 12, color: theme.ink, backgroundColor: theme.canvas },
});
