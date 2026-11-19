import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { buyerApi, type BuyerOrder, type Session } from "./api";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { MarketIcon } from "./MarketIcon";
import { BuyerAddresses } from "./BuyerAddresses";
import { BuyerOrderDetails } from "./BuyerOrderDetails";
import { BuyerProfile } from "./BuyerProfile";
import { useAndroidBack } from "./useAndroidBack";
import { BuyerRecovery } from "./BuyerRecovery";

const c = {
  paper: "#F7F4EE",
  card: "#FDFBF7",
  ink: "#1F2A22",
  secondary: "#5E554A",
  muted: "#7B7266",
  line: "#DDD6C9",
  green: "#174B34",
};
export function BuyerAccount({
  session,
  save,
  openOrders,
  fromBag,
  back,
  browseAsGuest,
}: {
  session: Session | null;
  save: (next: Session | null) => Promise<void>;
  openOrders: () => void;
  fromBag: boolean;
  back: () => void;
  browseAsGuest: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signInError, setSignInError] = useState("");
  const [addressesOpen, setAddressesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  useAndroidBack(() => {
    if (!session && busy) return true;
    if (addressesOpen) { setAddressesOpen(false); return true; }
    if (profileOpen) { setProfileOpen(false); return true; }
    if (recoveryOpen) { setRecoveryOpen(false); setPassword(""); return true; }
    if (!session && register) { setRegister(false); return true; }
    return false;
  }, 10);
  const [options, setOptions] = useState<{ emailOtpRequired: boolean; emailOtpAvailable: boolean } | null>(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [challenge, setChallenge] = useState<{ id: string; email: string; expiresAt: string; resendAt: number } | null>(null);
  const [optionsError, setOptionsError] = useState(false);
  const authLock = useRef(false);
  useEffect(() => { let active = true; void buyerApi.registrationOptions().then((value) => { if (active) setOptions(value); }).catch(() => { if (active) setOptionsError(true); }); return () => { active = false; }; }, []);
  const sendCode = async () => {
    if (authLock.current) return;
    if (challenge && Date.now() < challenge.resendAt) { Alert.alert("Please wait", "Wait before requesting another email code."); return; }
    authLock.current = true; setBusy(true);
    try { const address = email.trim().toLowerCase(); const result = await buyerApi.sendEmailOtp(address); setChallenge({ id: result.challengeId, email: address, expiresAt: result.expiresAt, resendAt: Date.now() + result.resendAfterSeconds * 1000 }); setOtp(""); Alert.alert("Check your email", "Enter the verification code sent to your inbox."); }
    catch (reason) { Alert.alert("Could not send code", reason instanceof Error ? reason.message : "Please retry"); }
    finally { authLock.current = false; setBusy(false); }
  };
  const submit = async () => {
    if (authLock.current) return;
    setSignInError("");
    authLock.current = true;
    setBusy(true);
    try {
      const enteredPhone = register ? phone.trim() : phone.replace(/\s/g, "");
      const normalizedPhone = /^\d{10}$/.test(enteredPhone) ? `+91${enteredPhone}` : enteredPhone;
      if (!register) {
        if (!enteredPhone) throw new Error("Enter your mobile number.");
        if (!/^\+[1-9]\d{9,14}$/.test(normalizedPhone) ||
          (normalizedPhone.startsWith("+91") && !/^\+91[6-9]\d{9}$/.test(normalizedPhone))) {
          throw new Error("Enter a valid mobile number with its country code.");
        }
        if (!password.trim()) throw new Error("Enter your password.");
      }
      if (register && (!options || (options.emailOtpRequired && !options.emailOtpAvailable))) throw new Error("Registration is unavailable. Please try again later.");
      if (register && (name.trim().length < 2 || password.length < 12)) throw new Error("Enter your name and a password with at least 12 characters.");
      if (register && options?.emailOtpRequired && (!challenge || challenge.email !== email.trim().toLowerCase() || Date.now() >= Date.parse(challenge.expiresAt) || !/^\d{6}$/.test(otp))) throw new Error("Request an email code and enter the valid 6-digit code before creating your account.");
      const next = register
        ? await buyerApi.register(name.trim(), normalizedPhone, password, options?.emailOtpRequired && challenge ? { email: challenge.email, emailChallengeId: challenge.id, emailOtp: otp } : undefined)
        : await buyerApi.login(normalizedPhone, password);
      if (next.role !== "buyer")
        throw new Error("Use the matching workspace for this account.");
      await save(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      if (register) Alert.alert("Could not continue", message);
      else setSignInError(message);
    } finally {
      authLock.current = false;
      setBusy(false);
    }
  };
  if (session && addressesOpen) return <BuyerAddresses key={session.userId} token={session.token} back={() => setAddressesOpen(false)} />;
  if (!session && recoveryOpen) return <BuyerRecovery back={() => { setPassword(""); setRecoveryOpen(false); }} />;
  if (session && profileOpen) return <BuyerProfile key={session.userId} token={session.token} back={() => setProfileOpen(false)} onSaved={(updatedName) => save({ ...session, name: updatedName })} />;
  if (session)
    return (
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.kicker}>Buyer account</Text>
        <Text style={s.title}>{session.name}</Text>
        <Text style={s.copy}>Signed in securely on this device</Text>
        <Pressable style={s.row} onPress={() => setProfileOpen(true)}><Text style={s.rowTitle}>Your profile</Text><Text style={s.rowCopy}>View account details and update your name</Text></Pressable>
        <Pressable style={s.row} onPress={() => setAddressesOpen(true)}><Text style={s.rowTitle}>Saved addresses</Text><Text style={s.rowCopy}>Add or update your delivery places</Text></Pressable>
        <Pressable style={s.row} onPress={openOrders}>
          <Text style={s.rowTitle}>Your orders</Text>
          <Text style={s.rowCopy}>Track placed orders and cash status</Text>
        </Pressable>
        <Pressable
          style={s.signout}
          onPress={() => {
            void buyerApi
              .logout(session.token)
              .catch(() => undefined)
              .finally(() => void save(null));
          }}
        >
          <Text style={s.signoutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    );
  if (!register) return (
    <View style={login.screen} testID="buyer-sign-in">
      <View style={login.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back from sign in" hitSlop={10} disabled={busy} onPress={back} style={login.backButton}>
          <Text style={login.chevron}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={login.headerText}>Sign in</Text>
      </View>
      <ScrollView style={login.scroll} contentContainerStyle={login.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={login.welcome}>Welcome to{"\n"}JustPackIt</Text>
        <Text style={login.tagline}>Your Neighbourhood, Delivered.</Text>
        <View style={login.card}>
          <Text accessibilityRole="header" style={login.cardTitle}>{fromBag ? "Sign in to checkout" : "Sign in to shop"}</Text>
          <Text style={login.description}>{fromBag ? "We'll bring you back to your bag." : "View orders and save delivery addresses."}</Text>
          <Text style={login.label}>Mobile number</Text>
          <TextInput
            accessibilityLabel="Mobile number"
            editable={!busy}
            maxLength={20}
            value={phone}
            onChangeText={value => { setPhone(value); setSignInError(""); }}
            placeholder="+91 98765 43210"
            placeholderTextColor={login.label.color}
            keyboardType="phone-pad"
            autoComplete="tel"
            style={[login.field, login.phone]}
          />
          <Text style={login.label}>Password</Text>
          <View style={login.field}>
            <TextInput
              accessibilityLabel="Password"
              editable={!busy}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              maxLength={128}
              value={password}
              onChangeText={value => { setPassword(value); setSignInError(""); }}
              placeholder="••••••••"
              placeholderTextColor={login.label.color}
              secureTextEntry={!passwordVisible}
              onSubmitEditing={() => void submit()}
              style={login.password}
            />
            <Pressable accessibilityRole="button" accessibilityLabel={passwordVisible ? "Hide password" : "Show password"} disabled={busy} onPress={() => setPasswordVisible(value => !value)} style={login.visibility}>
              <Text style={login.visibilityText}>{passwordVisible ? "Hide" : "Show"}</Text>
            </Pressable>
          </View>
          {signInError ? <Text accessibilityRole="alert" style={login.error}>{signInError}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={[login.button, login.primary]}>
            {busy && <ActivityIndicator size="small" color="#fff" />}
            <Text style={[login.buttonText, login.primaryText]}>{busy ? "Signing in…" : "Sign in"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setPasswordVisible(false); setSignInError(""); setRecoveryOpen(true); }} style={login.recovery}>
            <Text style={login.buttonText}>Forgot password?</Text>
          </Pressable>
        </View>
        <Text style={login.newAccount}>New to the neighbourhood?</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setRegister(true); setSignInError(""); }} style={[login.button, login.create]}>
          <Text style={login.buttonText}>Create account</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={browseAsGuest} style={[login.button, login.guest]}>
          <Text style={login.buttonText}>Continue browsing as guest</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text style={s.kicker}>Buyer account</Text>
      <Text style={s.title}>
        {register ? "Create your account" : "Sign in to shop"}
      </Text>
      <Text style={s.copy}>
        {register
          ? "Use your mobile number and a secure password"
          : "View orders and save delivery addresses"}
      </Text>
      {register ? (
        <View><Text style={s.copy}>Your name</Text>
        <TextInput
          accessibilityLabel="Your name"
          editable={!busy}
          maxLength={100}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={c.muted}
          style={s.input}
        />
        </View>
      ) : null}
      <Text style={s.copy}>Mobile number</Text>
      <TextInput
        accessibilityLabel="Mobile number"
        editable={!busy}
        maxLength={16}
        value={phone}
        onChangeText={setPhone}
        placeholder="Mobile number with +91"
        placeholderTextColor={c.muted}
        keyboardType="phone-pad"
        style={s.input}
      />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}><Text style={s.copy}>Password</Text><Pressable accessibilityRole="button" accessibilityLabel={passwordVisible ? "Hide password" : "Show password"} disabled={busy} onPress={() => setPasswordVisible((value) => !value)} style={{ padding: 12 }}><Text style={{ color: c.green, fontWeight: "600" }}>{passwordVisible ? "Hide" : "Show"}</Text></Pressable></View>
      <TextInput
        accessibilityLabel="Password"
        editable={!busy}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={128}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={c.muted}
        secureTextEntry={!passwordVisible}
        style={s.input}
      />
      {register ? <Text style={s.copy}>Use 12–128 characters for your password</Text> : null}
      <Pressable
        disabled={busy || (register && (!options || (options.emailOtpRequired && !options.emailOtpAvailable)))}
        style={s.primary}
        onPress={() => void submit()}
      >
        <Text style={s.primaryText}>
          {busy ? "Please wait" : register ? "Create account" : "Sign in"}
        </Text>
      </Pressable>
      {register && optionsError ? <Text style={s.copy}>Registration settings could not load. Reopen Account to retry.</Text> : null}
      {register && options?.emailOtpRequired ? <View><Text style={s.copy}>Verify your email to create an account</Text><TextInput editable={!busy} accessibilityLabel="Email" value={email} onChangeText={(value) => { setEmail(value); setChallenge(null); setOtp(""); }} autoCapitalize="none" keyboardType="email-address" placeholder="Email address" style={s.input} /><Pressable disabled={busy || !options.emailOtpAvailable} onPress={() => void sendCode()} style={s.signout}><Text style={s.signoutText}>{challenge ? "Resend email code" : "Send email code"}</Text></Pressable>{challenge ? <TextInput editable={!busy} accessibilityLabel="Email verification code" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} placeholder="6-digit email code" style={s.input} /> : null}{!options.emailOtpAvailable ? <Text style={s.copy}>Email verification is temporarily unavailable</Text> : null}</View> : null}
      <Pressable disabled={busy} onPress={() => setRegister((old) => !old)}>
        <Text style={s.switch}>
          {register
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
export function BuyerOrders({
  session,
  back,
  signIn,
  browse,
}: {
  session: Session | null;
  back: () => void;
  signIn: () => void;
  browse: () => void;
}) {
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  useAndroidBack(() => { if (!selectedOrder) return false; setSelectedOrder(null); return true; }, 10);
  const [cursor, setCursor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const pageLock = useRef(false);
  const [state, setState] = useState<"loading" | "ready" | "error">(
    session ? "loading" : "ready",
  );
  useEffect(() => {
    if (!session) return;
    let active = true;
    void buyerApi
      .ordersPage(session.token)
      .then((data) => {
        if (!active) return;
        setOrders(data.items);
        setCursor(data.cursor);
        setState("ready");
      })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [session, attempt]);
  const more = async () => {
    if (!session || !cursor || pageLock.current) return;
    pageLock.current = true; setMoreBusy(true); setMoreError(false);
    try { const page = await buyerApi.ordersPage(session.token, cursor); setOrders((current) => [...current, ...page.items.filter((item) => !current.some((old) => old.id === item.id))]); setCursor(page.cursor); }
    catch { setMoreError(true); }
    finally { pageLock.current = false; setMoreBusy(false); }
  };
  const closeOrder = () => { setSelectedOrder(null); setAttempt(value => value + 1); };
  return (
    <View style={ordersUI.screen} testID="buyer-orders">
      <View style={ordersUI.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back from orders" onPress={back} hitSlop={8} style={ordersUI.back}>
          <Text style={ordersUI.chevron}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={ordersUI.headerTitle}>Your orders</Text>
      </View>
      {!session ? (
        <ScrollView contentContainerStyle={ordersUI.list}>
          <View style={[ordersUI.card, ordersUI.sage]}>
            <MarketIcon name="orders" color="#07552F" />
            <Text accessibilityRole="header" style={ordersUI.title}>Sign in to view orders</Text>
            <Text style={ordersUI.copy}>Track deliveries and see orders from your neighbourhood shops.</Text>
            <Pressable accessibilityRole="button" onPress={signIn} style={ordersUI.button}>
              <Text style={ordersUI.buttonText}>Sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : state === "loading" ? (
        <View style={ordersUI.feedback}><ActivityIndicator color="#07552F" /><Text style={ordersUI.copy}>Loading your orders</Text></View>
      ) : state === "error" ? (
        <View style={ordersUI.feedback}>
          <View style={ordersUI.card}>
            <Text accessibilityRole="alert" style={ordersUI.title}>Orders could not load</Text>
            <Pressable accessibilityRole="button" style={ordersUI.button} onPress={() => { setState("loading"); setAttempt(value => value + 1); }}>
              <Text style={ordersUI.buttonText}>Try again</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          contentContainerStyle={ordersUI.list}
          ListEmptyComponent={
            <View style={ordersUI.card}>
              <MarketIcon name="orders" color="#07552F" />
              <Text style={ordersUI.title}>No orders yet</Text>
              <Text style={ordersUI.copy}>Confirmed orders will appear here.</Text>
              <Pressable accessibilityRole="button" style={ordersUI.button} onPress={browse}>
                <Text style={ordersUI.buttonText}>Start shopping</Text>
              </Pressable>
            </View>
          }
          ListFooterComponent={cursor ? <View style={ordersUI.footer}>
            {moreError && <Text accessibilityRole="alert" style={ordersUI.copy}>Older orders could not load. Please retry.</Text>}
            <Pressable accessibilityRole="button" disabled={moreBusy} style={[ordersUI.button, ordersUI.sage]} onPress={() => void more()}>
              <Text style={ordersUI.action}>{moreBusy ? "Loading…" : "Load older orders"}</Text>
            </Pressable>
          </View> : undefined}
          renderItem={({ item }) => {
            const names = item.subOrders.map(shop => shop.shopName);
            const statuses = [...new Set(item.subOrders.map(shop => shop.status))];
            const status = statuses.length === 1 ? statuses[0].replaceAll("_", " ") : statuses.length ? "Mixed shop statuses" : "Status unavailable";
            const due = item.amountDue ?? (item.paymentStatus === "paid" ? 0 : item.total);
            return (
              <Pressable accessibilityRole="button" style={ordersUI.card} onPress={() => setSelectedOrder(item.id)}>
                <Text style={ordersUI.action}>{status.charAt(0).toUpperCase() + status.slice(1)}</Text>
                <Text style={ordersUI.orderTitle}>{names.join(" · ") || "Local order"}</Text>
                <Text style={ordersUI.copy}>#{item.id} · {new Date(item.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</Text>
                <View style={ordersUI.orderFooter}>
                  <Text style={ordersUI.orderTitle}>{due > 0 && item.paymentMethod === "cod" ? `₹${due.toLocaleString("en-IN")} due` : `₹${item.total.toLocaleString("en-IN")}`}</Text>
                  <Text style={ordersUI.action}>View details →</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
      {session && selectedOrder ? (
        <Modal visible onRequestClose={closeOrder}>
          <SafeAreaProvider>
            <SafeAreaView style={ordersUI.screen}>
              <BuyerOrderDetails token={session.token} id={selectedOrder} back={closeOrder} />
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      ) : null}
    </View>
  );
}

const ordersUI = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FAF8F1" },
  header: { height: 64, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  back: { minHeight: 44, justifyContent: "center" },
  chevron: { color: "#07552F", fontSize: 27, lineHeight: 30 },
  headerTitle: { color: "#07552F", fontSize: 21, fontWeight: "600" },
  list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 16 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#E0E3D8", backgroundColor: "#fff", gap: 8 },
  sage: { backgroundColor: "#EAF0D9" },
  title: { fontSize: 23, lineHeight: 30, color: "#252D25", fontWeight: "600" },
  copy: { fontSize: 13, lineHeight: 19, color: "#73796E" },
  button: { backgroundColor: "#07552F", borderRadius: 14, minHeight: 50, padding: 12, alignItems: "center", justifyContent: "center", marginTop: 6 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  action: { color: "#07552F", fontSize: 14, fontWeight: "600" },
  orderTitle: { color: "#252D25", fontSize: 16, fontWeight: "600" },
  orderFooter: { borderTopWidth: 1, borderColor: "#E0E3D8", paddingTop: 12, marginTop: 4, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  feedback: { padding: 20, gap: 10 },
  footer: { gap: 8 },
});
const s = StyleSheet.create({
  page: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 96,
    backgroundColor: c.paper,
  },
  kicker: { color: c.green, fontSize: 13, fontWeight: "600" },
  title: { color: c.ink, marginTop: 8, fontSize: 28, fontWeight: "500" },
  copy: { color: c.secondary, marginTop: 8, fontSize: 14, lineHeight: 20 },
  input: {
    height: 48,
    paddingHorizontal: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 10,
    backgroundColor: c.card,
    color: c.ink,
    fontSize: 15,
  },
  primary: {
    height: 48,
    paddingHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.green,
  },
  primaryText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  switch: {
    color: c.green,
    marginTop: 20,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
  },
  row: {
    padding: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
    backgroundColor: c.card,
  },
  rowTitle: { color: c.ink, fontSize: 16, fontWeight: "600" },
  rowCopy: { color: c.secondary, marginTop: 5, fontSize: 13 },
  signout: {
    height: 44,
    marginTop: 20,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  signoutText: { color: c.secondary, fontSize: 14, fontWeight: "600" },
});

const login = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FAF8F1" },
  header: { height: 64, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  backButton: { minHeight: 44, justifyContent: "center" },
  chevron: { color: "#07552F", fontSize: 27, lineHeight: 30 },
  headerText: { color: "#07552F", fontSize: 21, fontWeight: "600" },
  scroll: { flex: 1 },
  content: { paddingTop: 16, paddingHorizontal: 20, paddingBottom: 12, width: "100%", maxWidth: 520, alignSelf: "center" },
  welcome: { color: "#07552F", fontSize: 32, lineHeight: 45, fontWeight: "700" },
  tagline: { color: "#73796E", fontSize: 14, lineHeight: 20, marginTop: 20 },
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#E0E3D8", borderRadius: 16, marginTop: 20, padding: 16 },
  cardTitle: { color: "#252D25", fontSize: 20, lineHeight: 28, fontWeight: "600" },
  description: { color: "#73796E", fontSize: 13, lineHeight: 18, marginTop: 10 },
  label: { color: "#73796E", fontSize: 12, lineHeight: 16, fontWeight: "600", marginTop: 10 },
  field: { flexDirection: "row", minHeight: 52, borderWidth: 1, borderColor: "#E0E3D8", borderRadius: 12, backgroundColor: "#fff", marginTop: 11 },
  phone: { paddingHorizontal: 16, fontSize: 14, color: "#252D25" },
  password: { flex: 1, minWidth: 0, paddingHorizontal: 16, fontSize: 14, color: "#252D25" },
  visibility: { minWidth: "46%", justifyContent: "center", alignItems: "flex-start", paddingHorizontal: 8 },
  visibilityText: { color: "#73796E", fontSize: 14 },
  error: { color: "#A23425", marginTop: 10, fontSize: 13, lineHeight: 18 },
  button: { minHeight: 50, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 12, gap: 8 },
  buttonText: { color: "#07552F", fontSize: 15, fontWeight: "600", textAlign: "center" },
  primary: { backgroundColor: "#07552F", marginTop: 10 },
  primaryText: { color: "#fff" },
  recovery: { minHeight: 50, marginTop: 10, alignItems: "center", justifyContent: "center" },
  newAccount: { color: "#73796E", fontSize: 14, lineHeight: 20, marginTop: 20 },
  create: { backgroundColor: "#EAF0D9", marginTop: 20 },
  guest: { backgroundColor: "#fff", marginTop: 20 },
});
