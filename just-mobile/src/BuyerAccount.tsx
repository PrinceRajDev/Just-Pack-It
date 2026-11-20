import { BuyerStateCard, BuyerStateSkeleton } from "./BuyerStateCard";
import { BuyerAccountHub } from "./BuyerAccountHub";


import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ApiError, buyerApi, type BuyerOrder, type Product, type Session, type Shop } from "./api";
import { BuyerAuthNotice } from "./BuyerAuthNotice";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { MarketIcon } from "./MarketIcon";
import { BuyerAddresses } from "./BuyerAddresses";
import { BuyerOrderDetails, isPastOrder, money, orderDue, OrderSymbol, orderStage, statusLabel } from "./BuyerOrderDetails";
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
  initialFavourites, signInOpen, startSignIn, area, shops, products, browse, openShop, add,
}: {
  session: Session | null;
  save: (next: Session | null) => Promise<void>;
  openOrders: () => void;
  fromBag: boolean;
  back: () => void;
  browseAsGuest: () => void;
  initialFavourites?: boolean;
  signInOpen: boolean;
  startSignIn: () => void;
  area?: string;
  shops: Shop[];
  products: Product[];
  browse: () => void;
  openShop: (shop: Shop) => void;
  add: (product: Product) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signInError, setSignInError] = useState("");
  const [signInServerError, setSignInServerError] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
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
  const [emailClock, setEmailClock] = useState(0);
  const signupExpired = !!challenge && emailClock >= Date.parse(challenge.expiresAt);
  const signupCooldown = challenge ? Math.max(0, Math.ceil((challenge.resendAt - emailClock) / 1000)) : 0;
  const [optionsError, setOptionsError] = useState(false);
  const authLock = useRef(false);
  useEffect(() => { let active = true; void buyerApi.registrationOptions().then((value) => { if (active) setOptions(value); }).catch(() => { if (active) setOptionsError(true); }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!challenge || !register) return;
    const timer = setInterval(() => setEmailClock(Date.now()), 500);
    return () => clearInterval(timer);
  }, [challenge, register]);
  const sendCode = async () => {
    if (authLock.current) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setSignInError("Enter a valid email address."); return; }
    if (challenge && Date.now() < challenge.resendAt) { setSignInError("Wait before requesting another email code."); return; }
    setSignInError("");
    authLock.current = true; setBusy(true);
    try { const address = email.trim().toLowerCase(); const result = await buyerApi.sendEmailOtp(address); const issued = Date.now(); setEmailClock(issued); setChallenge({ id: result.challengeId, email: address, expiresAt: result.expiresAt, resendAt: issued + result.resendAfterSeconds * 1000 }); setOtp(""); }
    catch (reason) { setSignInError(reason instanceof Error ? reason.message : "Could not send the email code. Please retry."); }
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
      if (register && password !== confirmPassword) throw new Error("The passwords must match.");
      if (register && options?.emailOtpRequired && (!challenge || challenge.email !== email.trim().toLowerCase() || Date.now() >= Date.parse(challenge.expiresAt) || !/^\d{6}$/.test(otp))) throw new Error("Request an email code and enter the valid 6-digit code before creating your account.");
      const next = register
        ? await buyerApi.register(name.trim(), normalizedPhone, password, options?.emailOtpRequired && challenge ? { email: challenge.email, emailChallengeId: challenge.id, emailOtp: otp } : undefined)
        : await buyerApi.login(normalizedPhone, password);
      if (next.role !== "buyer")
        throw new Error("Use the matching workspace for this account.");
      await save(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      setSignInServerError(error instanceof ApiError);
      setSignInError(message);
    } finally {
      authLock.current = false;
      setBusy(false);
    }
  };
  if (session && addressesOpen) return <Modal onRequestClose={() => setAddressesOpen(false)}><SafeAreaView style={{ flex: 1, backgroundColor: "#F8F6EE" }}><BuyerAddresses key={session.userId} token={session.token} userId={session.userId} area={area} back={() => setAddressesOpen(false)} /></SafeAreaView></Modal>;
  if (!session && recoveryOpen) return <BuyerRecovery back={() => { setPassword(""); setRecoveryOpen(false); }} />;
  if (session && profileOpen) return <Modal onRequestClose={() => setProfileOpen(false)}><SafeAreaView style={{ flex: 1, backgroundColor: "#F8F6EE" }}><BuyerProfile key={session.userId} token={session.token} back={() => setProfileOpen(false)} onSaved={(updatedName) => save({ ...session, name: updatedName })} /></SafeAreaView></Modal>;
  if (session || !signInOpen) return (
    <BuyerAccountHub initialFavourites={initialFavourites} session={session} area={area} shops={shops} products={products}
      back={back} signIn={startSignIn} profile={() => setProfileOpen(true)} addresses={() => setAddressesOpen(true)}
      orders={openOrders} browse={browse} openShop={openShop} add={add}
      signOut={async () => {
        if (session) {
          await buyerApi.logout(session.token);
          await save(null);
        }
      }}
    />
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
        {signInError ? <BuyerAuthNotice title={signInServerError ? "Couldn’t sign you in" : "Check your details"} copy={signInError} warning /> : busy ? <BuyerAuthNotice title="Signing you in…" copy="Your bag is saved. Please wait." busyLabel="Signing in…" /> : passwordVisible ? <BuyerAuthNotice title="Password is visible" copy="Use Hide to keep your password private." tone="info" /> : null}
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
  const canCreate = !busy && !!options && (!options.emailOtpRequired || (options.emailOtpAvailable && !!challenge && !signupExpired && /^\d{6}$/.test(otp)));
  return (
    <View style={login.screen}>
    <ScrollView style={login.scroll} contentContainerStyle={login.content} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" accessibilityLabel="Back to sign in" disabled={busy} onPress={() => { setSignInError(""); setPasswordVisible(false); setRegister(false); }} style={login.backButton}><Text style={login.headerText}>‹  Sign in</Text></Pressable>
      <BuyerAuthNotice title="Join your neighbourhood." tone="success" icon="account" copy="Create an account to order from independent shops." />
      {signInError ? <BuyerAuthNotice title="Check your details" copy={signInError} warning /> : null}
      <View style={login.card}>
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
      <Text style={s.copy}>Confirm password</Text>
      <TextInput accessibilityLabel="Confirm password" editable={!busy} maxLength={128} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!passwordVisible} autoCapitalize="none" style={s.input} />
      {challenge ? <BuyerAuthNotice title={signupExpired ? "This code has expired." : "Check your email."} tone={signupExpired ? "warning" : "success"} icon={signupExpired ? "clock" : "mail"} copy={signupExpired ? "Request a new code to continue." : "Enter the six-digit code sent to your inbox."} /> : null}
      {register && optionsError ? <Text style={s.copy}>Registration settings could not load. Reopen Account to retry.</Text> : null}
      {register && options?.emailOtpRequired ? <View><Text style={s.copy}>Verify your email to create an account</Text><TextInput editable={!busy} accessibilityLabel="Email" value={email} onChangeText={(value) => { setEmail(value); setChallenge(null); setOtp(""); }} autoCapitalize="none" keyboardType="email-address" placeholder="Email address" style={s.input} /><Pressable disabled={busy || !options.emailOtpAvailable || signupCooldown > 0} onPress={() => void sendCode()} style={s.signout}><Text style={s.signoutText}>{signupCooldown > 0 ? `Resend in ${signupCooldown}s` : challenge ? "Resend email code" : "Send email code"}</Text></Pressable>{challenge && !signupExpired ? <TextInput editable={!busy} accessibilityLabel="Email verification code" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} placeholder="6-digit email code" style={s.input} /> : null}{!options.emailOtpAvailable ? <Text style={s.copy}>Email verification is temporarily unavailable</Text> : null}</View> : null}

      <Pressable disabled={busy} onPress={() => { setSignInError(""); setPasswordVisible(false); setRegister(false); }}>
        <Text style={s.switch}>
          {register
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </Text>
      </Pressable>
      </View>
    </ScrollView>
    <View style={login.stickyFooter}><Pressable accessibilityRole="button" disabled={!canCreate} onPress={() => void submit()} style={[login.button, login.primary, !canCreate && login.disabledAction]}><Text style={[login.buttonText, canCreate ? login.primaryText : login.disabledLabel]}>{busy ? "Please wait…" : "Create account"}</Text></Pressable></View>
    </View>
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
  const [tab, setTab] = useState<"Active" | "Past">("Active");
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
        <ScrollView contentContainerStyle={ordersUI.list}><BuyerStateCard title="Loading your orders" tone="info" compact loading /><BuyerStateSkeleton /></ScrollView>
      ) : state === "error" ? (
        <ScrollView contentContainerStyle={ordersUI.list}><BuyerStateCard title="Couldn’t load your orders." copy="Your orders are safe. Check your connection and try again." tone="error" icon="network" action="Retry orders" onAction={() => { setState("loading"); setAttempt(value => value + 1); }} /></ScrollView>
      ) : (
        <FlatList
          data={orders.filter(item => isPastOrder(item) === (tab === "Past"))}
          ListHeaderComponent={!orders.length && !cursor ? undefined : <View style={ordersUI.listHeader}>
            <View style={ordersUI.hero}>
              <Text style={ordersUI.heroLabel}>YOUR LOCAL ORDERS</Text>
              <Text style={ordersUI.heroTitle}>From your neighbourhood.</Text>
            </View>
            <View style={ordersUI.tabs}>
              {(["Active", "Past"] as const).map(option => <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: tab === option }} onPress={() => setTab(option)} style={[ordersUI.tab, tab === option && ordersUI.tabSelected]}>
                <Text style={[ordersUI.tabText, tab === option && ordersUI.tabTextSelected]}>{option}</Text>
              </Pressable>)}
            </View>
            {tab === "Past" && <Text style={ordersUI.action}>Past orders</Text>}
          </View>}
          keyExtractor={item => item.id}
          contentContainerStyle={ordersUI.list}
          ListEmptyComponent={
            <BuyerStateCard title={!orders.length && !cursor ? "Your first local find awaits." : tab === "Past" ? "No past orders here yet" : "No active orders here yet"} icon="orders"
              copy={cursor ? "Load more orders to check earlier activity." : "Discover shops nearby and start your first bag."} action="Start shopping" onAction={browse} />
          }
          ListFooterComponent={cursor ? <View style={ordersUI.footer}>
            {moreError && <Text accessibilityRole="alert" style={ordersUI.copy}>Older orders could not load. Please retry.</Text>}
            <Pressable accessibilityRole="button" disabled={moreBusy} style={[ordersUI.button, ordersUI.sage]} onPress={() => void more()}>
              <Text style={ordersUI.action}>{moreBusy ? "Loading…" : "Load more orders"}</Text>
            </Pressable>
          </View> : undefined}
          renderItem={({ item, index }) => {
            const names = item.subOrders.map(shop => shop.shopName);
            const stage = orderStage(item);
            const due = orderDue(item);
            const cod = item.paymentMethod === "cod";
            const hasActiveCash = cod && due > 0;
            const displayedTotal = cod
              ? due || item.cashRecordedAmount || Math.max(0, item.total - (item.cancelledAmount ?? 0))
              : item.onlinePaidAmount || item.total;
            return (
              <Pressable accessibilityRole="button" style={[ordersUI.card, ordersUI.orderCard, tab === "Active" && index === 0 && ordersUI.lead]} onPress={() => setSelectedOrder(item.id)}>
                <View style={ordersUI.cardTop}>
                  <Text style={ordersUI.badge}>{statusLabel(stage)}{hasActiveCash && stage !== "out_for_delivery" ? " · Active COD" : ""}</Text>
                  <OrderSymbol name={stage} />
                </View>
                <Text style={ordersUI.orderTitle}>{names[0] || "Local order"}{names.length > 1 ? ` + ${names.length - 1} ${names.length === 2 ? "shop" : "shops"}` : ""}</Text>
                <Text style={ordersUI.copy}>#{item.id} · {new Date(item.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</Text>
                <View style={ordersUI.orderFooter}>
                  <Text style={ordersUI.total}>{money(displayedTotal)}</Text>
                  <Text style={ordersUI.detailsLink}>View details →</Text>
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
  screen: { flex: 1, backgroundColor: "#F8F6EE" },
  header: { height: 64, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  back: { minHeight: 44, justifyContent: "center" },
  chevron: { color: "#07552F", fontSize: 27, lineHeight: 30 },
  headerTitle: { color: "#07552F", fontSize: 18, fontWeight: "500" },
  list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 20 },
  listHeader: { gap: 20 },
  hero: { minHeight: 99, justifyContent: "center", padding: 20, gap: 10, backgroundColor: "#07552F", borderRadius: 24 },
  heroLabel: { color: "#EDF2DD", fontSize: 12 },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "500" },
  tabs: { padding: 4, borderWidth: 1, borderColor: "#DADFD0", borderRadius: 16, flexDirection: "row", backgroundColor: "#fff", gap: 4 },
  tab: { flex: 1, minHeight: 50, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tabSelected: { backgroundColor: "#07552F" },
  orderCard: { borderRadius: 24, padding: 20, gap: 10 },
  lead: { borderColor: "#07552F" },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  badge: { color: "#07552F", backgroundColor: "#EAF0D9", fontSize: 12, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 6, flexShrink: 1 },
  tabText: { color: "#73796E", fontSize: 15, fontWeight: "500" },
  tabTextSelected: { color: "#fff" },
  total: { fontSize: 24, fontWeight: "600", color: "#252D25" },
  detailsLink: { color: "#07552F", backgroundColor: "#EAF0D9", fontSize: 12, borderRadius: 12, padding: 10 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#E0E3D8", backgroundColor: "#fff", gap: 8 },
  sage: { backgroundColor: "#EAF0D9" },
  title: { fontSize: 23, lineHeight: 30, color: "#252D25", fontWeight: "600" },
  copy: { fontSize: 13, lineHeight: 19, color: "#73796E" },
  button: { backgroundColor: "#07552F", borderRadius: 14, minHeight: 50, padding: 12, alignItems: "center", justifyContent: "center", marginTop: 6 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  action: { color: "#07552F", fontSize: 14, fontWeight: "600" },
  orderTitle: { color: "#252D25", fontSize: 18, fontWeight: "500" },
  orderFooter: { borderTopWidth: 1, borderColor: "#E0E3D8", paddingTop: 12, marginTop: 2, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 },
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
  screen: { flex: 1, backgroundColor: "#F8F6EE" },
  header: { height: 64, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  backButton: { minHeight: 44, justifyContent: "center" },
  chevron: { color: "#07552F", fontSize: 27, lineHeight: 30 },
  headerText: { color: "#07552F", fontSize: 21, fontWeight: "600" },
  scroll: { flex: 1 },
  content: { paddingTop: 16, paddingHorizontal: 20, paddingBottom: 12, width: "100%", maxWidth: 520, alignSelf: "center" },
  stickyFooter: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 6, borderTopWidth: 1, borderColor: "#DADFD0", backgroundColor: "#fff" },
  disabledAction: { backgroundColor: "#DDE2D5" },
  disabledLabel: {color:"#697267"},
  checkoutIntro: { backgroundColor: "#07552F", borderRadius: 24, padding: 20 },
  checkoutWelcome: { color: "#fff", fontSize: 28, lineHeight: 39, fontWeight: "500" },
  checkoutTagline: { color: "#EAF0D9", marginTop: 8 },
  checkoutCard: { borderRadius: 24, marginTop: 16, padding: 20 },
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
