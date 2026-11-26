import { cardShadow, theme, themedStyles } from "./theme";
import { BuyerStateCard, BuyerStateSkeleton } from "./BuyerStateCard";
import { BuyerAccountHub } from "./BuyerAccountHub";


import { useEffect, useRef, useState } from "react";
import { StyleSheet,
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
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
import { SellerAccess } from "./SellerAccess";
import { BuyerRecovery } from "./BuyerRecovery";



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
  const [sellerOpen, setSellerOpen] = useState(false);
  const [sellerHandoff, setSellerHandoff] = useState<Session>();
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
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const authLock = useRef(false);
  useEffect(() => {
    let active = true;
    void buyerApi.registrationOptions()
      .then(value => { if (active) setOptions(value); })
      .catch(() => { if (active) setOptionsError(true); });
    return () => { active = false; };
  }, [optionsAttempt]);
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
      if (!register && next.role === "seller") {
        setPassword("");
        setPasswordVisible(false);
        setSellerHandoff(next);
        setSellerOpen(true);
        return;
      }
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
  if (sellerOpen) return <SellerAccess initialSession={sellerHandoff} close={() => { setSellerHandoff(undefined); setSellerOpen(false); }} />;
  if (session && addressesOpen) return <Modal onRequestClose={() => setAddressesOpen(false)}><SafeAreaView style={{ flex: 1, backgroundColor: theme.canvas }}><BuyerAddresses key={session.userId} token={session.token} userId={session.userId} area={area} back={() => setAddressesOpen(false)} /></SafeAreaView></Modal>;
  if (!session && recoveryOpen) return <BuyerRecovery back={() => { setPassword(""); setRecoveryOpen(false); }} />;
  if (session && profileOpen) return <Modal onRequestClose={() => setProfileOpen(false)}><SafeAreaView style={{ flex: 1, backgroundColor: theme.canvas }}><BuyerProfile key={session.userId} token={session.token} back={() => setProfileOpen(false)} onSaved={(updatedName) => save({ ...session, name: updatedName })} /></SafeAreaView></Modal>;
  if (session || !signInOpen) return (
    <BuyerAccountHub initialFavourites={initialFavourites} session={session} area={area} shops={shops} products={products}
      back={back} signIn={startSignIn} profile={() => setProfileOpen(true)} addresses={() => setAddressesOpen(true)}
      seller={() => setSellerOpen(true)}
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
          <MarketIcon name="chevron-left" />
        </Pressable>
        <Text accessibilityRole="header" style={login.headerText}>Sign in</Text>
      </View>
      <ScrollView style={login.scroll} contentContainerStyle={[login.content, login.signInContent]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <AuthHero title={fromBag ? "Sign in to checkout" : "Welcome back."}
          copy={fromBag ? "We'll bring you back to your bag." : "Track your orders and keep delivery addresses handy."} />
        {signInError ? (
          <BuyerAuthNotice
            title={signInServerError ? "Couldn’t sign you in" : "Check your details"}
            copy={signInError}
            warning
          />
        ) : null}
        <View style={[login.card, login.signInCard]}>
          <Text style={[login.label, login.signInLabel]}>Mobile number</Text>
          <TextInput
            accessibilityLabel="Mobile number"
            editable={!busy}
            maxLength={20}
            value={phone}
            onChangeText={value => { setPhone(value); setSignInError(""); }}
            placeholder="+91 98765 43210"
            placeholderTextColor={theme.muted}
            keyboardType="phone-pad"
            autoComplete="tel"
            style={[login.field, login.phone]}
          />
          <Text style={[login.label, login.signInLabel, login.signInPasswordLabel]}>Password</Text>
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
              placeholderTextColor={theme.muted}
              secureTextEntry={!passwordVisible}
              onSubmitEditing={() => void submit()}
              style={login.password}
            />
            <Pressable accessibilityRole="button" accessibilityLabel={passwordVisible ? "Hide password" : "Show password"} disabled={busy} onPress={() => setPasswordVisible(value => !value)} style={login.visibility}>
              <Text style={login.visibilityText}>{passwordVisible ? "Hide" : "Show"}</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ busy }} disabled={busy} onPress={() => void submit()} style={[login.button, login.signInPrimary]}>
            {busy && <ActivityIndicator size="small" color={theme.onPrimary} />}
            <Text style={[login.buttonText, login.primaryText]}>{busy ? "Signing in…" : "Sign in"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setPasswordVisible(false); setSignInError(""); setRecoveryOpen(true); }} style={login.recovery}>
            <Text style={login.buttonText}>Forgot password?</Text>
          </Pressable>
        </View>
        <View style={login.signInOptions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setRegister(true); setSignInError(""); }} style={[login.button, login.create]}>
            <Text style={login.buttonText}>Create account</Text>
            <MarketIcon name="chevron-right" />
          </Pressable>
          {!fromBag && (
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setSellerOpen(true)} style={login.button}>
              <Text style={login.buttonText}>Seller access</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" disabled={busy} onPress={browseAsGuest} style={login.button}>
            <Text style={login.guestText}>Continue browsing as guest</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
  const canCreate = !busy && !!options && (!options.emailOtpRequired || (options.emailOtpAvailable && !!challenge && !signupExpired && /^\d{6}$/.test(otp)));
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const codeDisabled = busy || !options?.emailOtpAvailable || signupCooldown > 0;
  const returnToSignIn = () => {
    setSignInError("");
    setPasswordVisible(false);
    setRegister(false);
  };

  return (
    <View style={login.screen} testID="buyer-sign-up">
      <View style={login.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to sign in" hitSlop={10} disabled={busy} onPress={returnToSignIn} style={login.backButton}>
          <MarketIcon name="chevron-left" />
        </Pressable>
        <Text accessibilityRole="header" style={login.headerText}>Create account</Text>
      </View>
      <ScrollView style={login.scroll} contentContainerStyle={[login.content, login.signInContent]} keyboardShouldPersistTaps="handled">
        <AuthHero title="Shop close to home" copy="Create an account to order from independent shops." />
        {signInError ? <BuyerAuthNotice title="Check your details" copy={signInError} warning /> : null}
        <View style={[login.card, login.signInCard]}>
          <Text accessibilityRole="header" style={login.verificationTitle}>Account details</Text>
          <Text style={login.label}>Your name</Text>
          <TextInput accessibilityLabel="Your name" editable={!busy} autoComplete="name" maxLength={100} value={name} onChangeText={value => { setName(value); setSignInError(""); }} placeholder="Full name" placeholderTextColor={theme.muted} style={[login.field, login.phone]} />

          <Text style={login.label}>Mobile number</Text>
          <TextInput accessibilityLabel="Mobile number" editable={!busy} autoComplete="tel" maxLength={16} value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" placeholderTextColor={theme.muted} keyboardType="phone-pad" style={[login.field, login.phone]} />

          <Text style={login.label}>Password</Text>
          <View style={login.field}>
            <TextInput accessibilityLabel="Password" editable={!busy} autoComplete="new-password" autoCapitalize="none" autoCorrect={false} maxLength={128} value={password} onChangeText={value => { setPassword(value); setSignInError(""); }} placeholder="Choose a password" placeholderTextColor={theme.muted} secureTextEntry={!passwordVisible} style={login.password} />
            <Pressable accessibilityRole="button" accessibilityLabel={passwordVisible ? "Hide password" : "Show password"} disabled={busy} onPress={() => setPasswordVisible(value => !value)} style={login.visibility}>
              <Text style={login.visibilityText}>{passwordVisible ? "Hide" : "Show"}</Text>
            </Pressable>
          </View>
          <Text style={login.fieldHint}>Use at least 12 characters.</Text>

          <Text style={login.label}>Confirm password</Text>
          <TextInput accessibilityLabel="Confirm password" editable={!busy} autoComplete="new-password" autoCapitalize="none" autoCorrect={false} maxLength={128} value={confirmPassword} onChangeText={value => { setConfirmPassword(value); setSignInError(""); }} placeholder="Re-enter password" placeholderTextColor={theme.muted} secureTextEntry={!passwordVisible} style={[login.field, login.phone, passwordMismatch && login.invalidField]} />
          {passwordMismatch && <Text style={login.error}>Passwords must match.</Text>}
        </View>

        {optionsError ? (
          <BuyerAuthNotice title="Couldn’t load registration settings" copy="Check your connection and try again." warning
            action="Retry registration settings" onAction={() => { setOptionsError(false); setOptionsAttempt(attempt => attempt + 1); }} />
        ) : !options ? (
          <View style={[login.card, login.signInCard, login.verificationHeading]} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={theme.accentInk} />
            <Text style={login.description}>Loading registration settings…</Text>
          </View>
        ) : null}
        {options?.emailOtpRequired ? (
          <View style={[login.card, login.signInCard]}>
            <View style={login.verificationHeading}>
              <View style={login.verificationIcon}><MarketIcon name="account" /></View>
              <View style={login.verificationCopy}>
                <Text accessibilityRole="header" style={login.verificationTitle}>Verify your email</Text>
                <Text style={login.description}>We’ll send a six-digit code to your email address.</Text>
              </View>
            </View>
            <Text style={login.label}>Email address</Text>
            <TextInput editable={!busy} accessibilityLabel="Email" value={email} onChangeText={value => { setEmail(value); setChallenge(null); setOtp(""); }} autoComplete="email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={theme.muted} style={[login.field, login.phone]} />
            <Pressable accessibilityRole="button" disabled={codeDisabled} onPress={() => void sendCode()} style={[login.button, login.create, login.codeAction, codeDisabled && login.disabledAction]}>
              <Text style={[login.buttonText, codeDisabled && login.disabledLabel]}>
                {signupCooldown > 0 ? `Resend in ${signupCooldown}s` : challenge ? "Resend email code" : "Send email code"}
              </Text>
            </Pressable>
            {challenge ? (
              <View style={login.codeStatus}>
                <BuyerAuthNotice title={signupExpired ? "This code has expired." : "Check your email."} tone={signupExpired ? "warning" : "success"} icon={signupExpired ? "clock" : "mail"} copy={signupExpired ? "Request a new code to continue." : "Enter the six-digit code sent to your inbox."} />
                {!signupExpired ? (
                  <>
                    <Text style={login.label}>Email verification code</Text>
                    <TextInput editable={!busy} accessibilityLabel="Email verification code" autoComplete="one-time-code" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} placeholder="6-digit email code" placeholderTextColor={theme.muted} style={[login.field, login.phone]} />
                  </>
                ) : null}
              </View>
            ) : null}
            {!options.emailOtpAvailable ? <Text style={login.description}>Email verification is temporarily unavailable.</Text> : null}
          </View>
        ) : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={returnToSignIn} style={login.button}>
          <Text style={login.buttonText}>Already have an account? Sign in</Text>
        </Pressable>
      </ScrollView>
      <View style={login.stickyFooter}>
        <Pressable accessibilityRole="button" accessibilityState={{ busy }} disabled={!canCreate} onPress={() => void submit()} style={[login.button, login.footerButton, !canCreate && login.disabledAction]}>
          <Text style={[login.buttonText, canCreate ? login.primaryText : login.disabledLabel]}>{busy ? "Please wait…" : "Create account"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AuthHero({ title, copy }: { title: string; copy: string }) {
  return <View style={login.signInHero}>
    <View style={login.signInIntro}>
      <Text style={login.signInBrand}>JustPackIt</Text>
      <Text accessibilityRole="header" style={login.signInTitle}>{title}</Text>
      <Text style={login.signInDescription}>{copy}</Text>
    </View>
    <Image source={require("../assets/startup-parcel.jpg")} style={login.signInArt} accessible={false} />
  </View>;
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
            <MarketIcon name="orders" color={theme.accentInk} />
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

const ordersUI = themedStyles(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.canvas },
  header: { height: 64, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  back: { minHeight: 44, justifyContent: "center" },
  chevron: { color: theme.accentInk, fontSize: 27, lineHeight: 30 },
  headerTitle: { color: theme.accentInk, fontSize: 18, fontWeight: "500" },
  list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 20 },
  listHeader: { gap: 20 },
  hero: { minHeight: 99, justifyContent: "center", padding: 20, gap: 10, backgroundColor:theme.hero, borderRadius: 24 },
  heroLabel: { color: theme.ink, fontSize: 12 },
  heroTitle: { color: theme.ink, fontSize: 24, fontWeight: "500" },
  tabs: { padding: 4, borderWidth: 1, borderColor: theme.border, borderRadius: 16, flexDirection: "row", backgroundColor: theme.surface, gap: 4 },
  tab: { flex: 1, minHeight: 50, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tabSelected: { backgroundColor:theme.selected },
  orderCard: { borderRadius: 24, padding: 20, gap: 10 },
  lead: { borderColor: theme.accentInk },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  badge: { color: theme.accentInk, backgroundColor: theme.selected, fontSize: 12, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 6, flexShrink: 1 },
  tabText: { color: theme.muted, fontSize: 15, fontWeight: "500" },
  tabTextSelected: { color: theme.ink },
  total: { fontSize: 24, fontWeight: "600", color: theme.ink },
  detailsLink: { color: theme.accentInk, backgroundColor: theme.selected, fontSize: 12, borderRadius: 12, padding: 10 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, gap: 8 },
  sage: { backgroundColor: theme.selected },
  title: { fontSize: 23, lineHeight: 30, color: theme.ink, fontWeight: "600" },
  copy: { fontSize: 13, lineHeight: 19, color: theme.muted },
  button: { backgroundColor: theme.primary, borderRadius: 14, minHeight: 50, padding: 12, alignItems: "center", justifyContent: "center", marginTop: 6 },
  buttonText: { color: theme.ink, fontSize: 15, fontWeight: "600" },
  action: { color: theme.accentInk, fontSize: 14, fontWeight: "600" },
  orderTitle: { color: theme.ink, fontSize: 18, fontWeight: "500" },
  orderFooter: { borderTopWidth: 1, borderColor: theme.border, paddingTop: 12, marginTop: 2, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 },
  feedback: { padding: 20, gap: 10 },
  footer: { gap: 8 },
}));
const login = themedStyles(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.canvas },
  header: { minHeight: 64, width: "100%", maxWidth: 520, alignSelf: "center", paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, alignItems: "center", justifyContent: "center" },
  headerText: { color: theme.ink, fontSize: 22, fontWeight: "700", flex: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: 8, paddingHorizontal: 20, width: "100%", maxWidth: 520, alignSelf: "center" },
  stickyFooter: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  disabledAction: { backgroundColor: theme.disabled },
  disabledLabel: {color:theme.muted},
  signInContent: { gap: 16, paddingBottom: 24 },
  signInHero: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, padding: 16, borderRadius: 24, backgroundColor: theme.hero, borderWidth: 1, borderColor: theme.border },
  signInIntro: { flexGrow: 1, flexShrink: 1, flexBasis: 144, gap: 6 },
  signInBrand: { color: theme.accentInk, fontSize: 14, fontWeight: "800" },
  signInTitle: { color: theme.ink, fontSize: 28, lineHeight: 32, fontWeight: "800" },
  signInDescription: { color: theme.ink, fontSize: 14, lineHeight: 20 },
  signInArt: { width: 100, height: 100, borderRadius: 16 },
  card: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 16, marginTop: 20, padding: 16 },
  signInCard: { marginTop: 0, borderRadius: 20, padding: 16, ...cardShadow },
  description: { color: theme.secondary, fontSize: 14, lineHeight: 20 },
  verificationTitle: { color: theme.ink, fontWeight: "700", fontSize: 18, lineHeight: 24, marginBottom: 4 },
  verificationHeading: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  verificationIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.selected, alignItems: "center", justifyContent: "center" },
  verificationCopy: { flex: 1 },
  fieldHint: { color: theme.secondary, fontSize: 13, lineHeight: 18, marginTop: 6 },
  codeAction: { marginTop: 10, marginBottom: 4 },
  codeStatus: { marginTop: 8 },
  label: { color: theme.ink, fontSize: 14, lineHeight: 20, fontWeight: "600", marginTop: 12 },
  signInLabel: { color: theme.ink, fontSize: 14, marginTop: 0 },
  signInPasswordLabel: { marginTop: 16 },
  field: { flexDirection: "row", minHeight: 52, borderWidth: 1, borderColor: theme.controlBorder, borderRadius: 12, backgroundColor: theme.surfaceSoft, marginTop: 8 },
  phone: { paddingHorizontal: 16, fontSize: 14, color: theme.ink },
  password: { flex: 1, minWidth: 0, paddingHorizontal: 16, fontSize: 14, color: theme.ink },
  visibility: { minWidth: 56, justifyContent: "center", alignItems: "center", paddingHorizontal: 12 },
  visibilityText: { color: theme.accentInk, fontWeight: "600", fontSize: 14 },
  error: { color: theme.error, marginTop: 10, fontSize: 13, lineHeight: 18 },
  invalidField: { borderColor: theme.errorBorder },
  button: { minHeight: 50, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 12, gap: 8 },
  buttonText: { color: theme.accentInk, fontSize: 15, fontWeight: "600", textAlign: "center" },
  footerButton: { backgroundColor: theme.accentInk, width: "100%", maxWidth: 480, alignSelf: "center" },
  signInPrimary: { backgroundColor: theme.accentInk, marginTop: 16 },
  primaryText: { color: theme.onPrimary },
  recovery: { minHeight: 44, marginTop: 2, alignItems: "center", justifyContent: "center" },
  signInOptions: { gap: 4 },
  create: { backgroundColor: theme.selected, borderWidth: 1, borderColor: theme.border, marginTop: 4 },
  guestText: { color: theme.secondary, fontSize: 14, fontWeight: "600", textAlign: "center" },
}));
