import { theme } from "./theme";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ApiError, buyerApi, marketApi, type Category, type ServiceArea, type Session } from "./api";
import { StatusBar } from "expo-status-bar";
import { SellerWorkspace } from "./SellerWorkspace";
import { BuyerRecovery } from "./BuyerRecovery";
import { BuyerStateCard } from "./BuyerStateCard";
import * as storage from "./deviceStorage";

const pendingRequests = new WeakSet<object>();
const clockNow = () => Date.now();

const sessionKey = "jpi.seller.session";
const storefront = require("../assets/seller-storefront.jpg");
const methods = [["pickup", "Customer pickup"], ["seller_delivery", "Shop delivery"], ["platform_delivery", "Platform rider"]] as const;
type Step = "login" | "account" | "email" | "shop" | "delivery" | "review" | "status" | "recovery";
const backSteps: Partial<Record<Step, Step>> = { account:"login", email:"account", delivery:"shop", review:"delivery", recovery:"login" };

export function SellerAccess({ close, initialSession }: { close: () => void; initialSession?: Session }) {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [step, setStep] = useState<Step>(() => initialSession ? "status" : "login");
  const [session, setSession] = useState<Session | null>(() => initialSession ?? null);
  const [shop, setShop] = useState<Awaited<ReturnType<typeof buyerApi.sellerShop>>>();
  const [shopError, setShopError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [restoring, setRestoring] = useState(!initialSession);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [requestOwner] = useState(() => ({}));
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<{ id:string; expires:number; retryAt:number; address:string }>();
  const [otp, setOtp] = useState("");
  const [verify, setVerify] = useState(false);
  const [now, setNow] = useState(0);
  const [shopName, setShopName] = useState("");
  const [address, setAddress] = useState("");
  const [since, setSince] = useState("");
  const [category, setCategory] = useState<Category>();
  const [area, setArea] = useState<ServiceArea>();
  const [fulfilment, setFulfilment] = useState<string[]>([]);
  const [catalogue, setCatalogue] = useState<{categories:Category[]; areas:ServiceArea[]}>();
  const [picker, setPicker] = useState<"category" | "area" | null>(null);
  const enteredPhone = phone.replace(/[\s()-]/g, "");
  const normalizedPhone = /^[6-9]\d{9}$/.test(enteredPhone) ? "+91" + enteredPhone
    : /^91[6-9]\d{9}$/.test(enteredPhone) ? "+" + enteredPhone
    : enteredPhone;
  const validPhone = /^\+[1-9]\d{9,14}$/.test(normalizedPhone);
  const expires = challenge ? now >= challenge.expires : false;
  const cooldown = challenge ? Math.max(0, Math.ceil((challenge.retryAt - now) / 1000)) : 0;

  useEffect(() => {
    if (initialSession) {
      void storage.setItemAsync(sessionKey, JSON.stringify(initialSession)).catch(() => undefined);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const saved = await storage.getItemAsync(sessionKey);
        if (!saved) return;
        const candidate = JSON.parse(saved) as Session;
        if (candidate.role !== "seller" || typeof candidate.token !== "string") return;
        const verified = await buyerApi.me(candidate.token);
        if (active && verified.role === "seller" && verified.userId === candidate.userId) {
          setSession({ ...verified, token: candidate.token });
          setStep("status");
        }
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 401) await storage.deleteItemAsync(sessionKey).catch(() => undefined);
      } finally { if (active) setRestoring(false); }
    })();
    return () => { active = false; };
  }, [initialSession]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void buyerApi.sellerShop(session.token).then(value => {
      if (active) { setShop(value); setShopError(""); }
    }).catch(reason => {
      if (active) setShopError(reason instanceof Error ? reason.message : "Could not load shop status.");
    });
    return () => { active = false; };
  }, [session, refresh]);

  useEffect(() => {
    if (!challenge || step !== "email") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge, step]);

  const go = (next: Step) => { setVisible(false); setError(""); setRequestId(undefined); setStep(next); };
  const run = async (action: () => Promise<void>) => {
    if (pendingRequests.has(requestOwner)) return;
    pendingRequests.add(requestOwner); setBusy(true); setError(""); setRequestId(undefined);
    try { await action(); }
    catch (reason) {
      if (reason instanceof ApiError) {
        setRequestId(reason.requestId);
        setError(reason.message);
      } else {
        setError(reason instanceof Error ? reason.message : "Try again. Your details are still here.");
      }
    }
    finally { pendingRequests.delete(requestOwner); setBusy(false); }
  };
  const acceptSession = async (next: Session) => {
    if (next.role !== "seller") {
      await buyerApi.logout(next.token).catch(() => undefined);
      throw new Error("This mobile number is not registered as a seller.");
    }
    setSession(next);
    setPassword(""); setOtp(""); setChallenge(undefined);
    go("status");
    await storage.setItemAsync(sessionKey, JSON.stringify(next)).catch(() => undefined);
  };
  const loadCatalogue = async () => {
    const [categories, areas] = await Promise.all([marketApi.categories(), marketApi.areas()]);
    setCatalogue({ categories, areas: areas.filter(item => item.active) });
  };
  const send = async () => {
    const address = email.trim().toLowerCase();
    const reply = await buyerApi.sendEmailOtp(address);
    const time = clockNow();
    setNow(time); setOtp("");
    setChallenge({ address, id: reply.challengeId, expires: Date.parse(reply.expiresAt), retryAt: time + reply.resendAfterSeconds * 1000 });
    go("email");
  };
  const clearSeller = () => {
    setWorkspaceOpen(false);
    setSession(null);
    setShop(undefined);
    setShopError("");
    go("login");
  };
  const signOut = async () => {
    if (!session) return;
    await buyerApi.logout(session.token);
    await storage.deleteItemAsync(sessionKey);
    clearSeller();
  };
  const expire = () => {
    void storage.deleteItemAsync(sessionKey).catch(() => undefined);
    clearSeller();
    setError("Your seller session expired. Sign in again.");
  };
  const back = () => {
    if (busy) return;
    if (workspaceOpen) { setWorkspaceOpen(false); setRefresh(value => value+1); return; }
    if (picker) { setPicker(null); return; }
    if (step === "shop") go(verify ? "email" : "account");
    else if (backSteps[step]) go(backSteps[step]!);
    else close();
  };

  if (workspaceOpen && session) return <Modal onRequestClose={back}><SafeAreaProvider><SafeAreaView style={s.screen}><StatusBar style="dark" /><SellerWorkspace session={session} back={back} signOut={signOut} expired={expire} /></SafeAreaView></SafeAreaProvider></Modal>;
  if (step === "recovery") return <Modal onRequestClose={back}><SafeAreaProvider><SafeAreaView style={s.screen}><BuyerRecovery back={() => go("login")} /></SafeAreaView></SafeAreaProvider></Modal>;
  const title = picker === "area" ? "Choose service area" : picker === "category" ? "Choose category" :
    {login:"Welcome back", account:"Create seller account", email:"Check your email", shop:"Tell us about your shop", delivery:"Address & fulfilment", review:"Review your shop", status:"Your seller workspace"}[step];
  const hasCover = !picker && (step === "login" || step === "status");
  const button = (label:string, action:()=>void, disabled = false) => <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={action} style={[s.button, (disabled || busy) && s.disabled]}><Text style={[s.buttonText,(disabled || busy) && s.disabledText]}>{busy ? "Please wait…" : label}</Text></Pressable>;
  const link = (label:string, action:()=>void) => <Pressable accessibilityRole="button" disabled={busy} onPress={action} style={s.link}><Text style={s.linkText}>{label}</Text></Pressable>;
  const passwordField = <Field label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword} secureTextEntry={!visible} maxLength={128} autoCapitalize="none" autoCorrect={false} autoComplete={step === "login" ? "current-password" : "new-password"} suffix={link(visible ? "Hide" : "Show", () => setVisible(value => !value))} />;
  let action;
  if (!picker && step === "login") action = button("Sign in", () => void run(async () => {
    if (!validPhone) throw new Error("Enter your registered mobile number, including the country code if needed.");
    await acceptSession(await buyerApi.login(normalizedPhone, password));
  }), !phone || !password);
  if (!picker && step === "account") action = button("Continue", () => void run(async () => {
    if (name.trim().length < 2 || !validPhone || password.length < 12) throw new Error("Enter your name, valid mobile number and a password with at least 12 characters.");
    const options = await buyerApi.registrationOptions();
    setVerify(options.emailOtpRequired);
    if (options.emailOtpRequired) {
      if (!options.emailOtpAvailable) throw new Error("Email verification is unavailable right now. Try again later.");
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error("Enter a valid email address.");
      await send();
    } else { if (!catalogue) await loadCatalogue(); go("shop"); }
  }));
  if (!picker && step === "email") action = button("Continue with code", () => void run(async () => {
    if (!challenge || expires || !/^\d{6}$/.test(otp)) throw new Error("Enter a valid six-digit email code.");
    if (!catalogue) await loadCatalogue();
    go("shop");
  }), !challenge || expires || otp.length !== 6);
  if (!picker && step === "shop") action = button("Continue", () => {
    if (shopName.trim().length < 2 || !category || !/^\d{4}$/.test(since) || Number(since) < 1900 || Number(since) > new Date().getFullYear()) {
      setError("Enter a shop name, category and valid opening year."); return;
    }
    go("delivery");
  });
  if (!picker && step === "delivery") action = button("Review shop", () => {
    if (address.trim().length < 2 || !area || !fulfilment.length) { setError("Enter the shop address and choose a service area and fulfilment method."); return; }
    go("review");
  });
  if (!picker && step === "review") action = button("Submit shop for approval", () => void run(async () => {
    if (verify && (!challenge || clockNow() >= challenge.expires)) { go("email"); throw new Error("Your email code has expired. Send a new code."); }
    try {
      const result = await buyerApi.registerSeller({
        name:name.trim(), phone:normalizedPhone, password,
        ...(verify && challenge ? {email:challenge.address, emailChallengeId:challenge.id, emailOtp:otp} : {}),
        shop:{name:shopName.trim(),address:address.trim(),since:Number(since),categoryIds:[category!.id],serviceAreaIds:[area!.id],fulfilment},
      });
      await acceptSession(result);
    } catch (reason) {
      if (reason instanceof ApiError && /EMAIL|OTP/.test(reason.code ?? "")) go("email");
      throw reason;
    }
  }));
  if (!picker && step === "status") action = button("Open seller workspace", () => setWorkspaceOpen(true));

  return <Modal onRequestClose={back}><SafeAreaProvider><SafeAreaView style={s.screen}><StatusBar style="dark" />
    <View style={s.header}><Text style={s.brand}>JustPackIt</Text><Text style={s.kicker}>SELLER</Text>{link(step === "login" || step === "status" ? "Close" : "Back", back)}</View>
    {restoring ? <ActivityIndicator style={s.loader} color={theme.accentInk} /> : <>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        {hasCover ? <View style={s.cover}>
          <Image source={storefront} resizeMode="cover" style={s.coverPhoto} accessible={false} testID="seller-access-cover" />
          <View style={s.coverCopy}>
            <Text accessibilityRole="header" style={s.coverTitle}>{title}</Text>
            <Text style={s.coverCaption}>{step === "login" ? "Sign in with your registered mobile number." : shop?.name ?? session?.name ?? "Seller account"}</Text>
          </View>
        </View> : <View style={s.stepHeading}>
          {!picker && step === "email" && <Text style={s.kicker}>Verify email</Text>}
          <Text accessibilityRole="header" style={s.title}>{title}</Text>
        </View>}
        {!!error && <View style={s.field}><Text accessibilityRole="alert" style={s.error}>{error}</Text>{requestId && <Text selectable style={s.copy}>Support reference: {requestId}</Text>}</View>}
        {picker && (picker === "area" ? catalogue?.areas : catalogue?.categories)?.map(item => <Pressable accessibilityRole="button" key={item.id} style={s.panel} onPress={() => {
          if (picker === "area") setArea(item as ServiceArea); else setCategory(item as Category);
          setPicker(null);
        }}><Text style={s.label}>{item.name}</Text>{"city" in item && <Text style={s.copy}>{item.city}</Text>}</Pressable>)}
        {picker && !(picker === "area" ? catalogue?.areas.length : catalogue?.categories.length) && <BuyerStateCard title="No options available" copy="Try again to refresh available choices." action="Refresh options" onAction={() => void run(loadCatalogue)} />}
        {!picker && step === "login" && <View style={s.panel}>
          <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91  Enter 10-digit number" />
          {passwordField}
          {link("Forgot password?", () => { setPassword(""); go("recovery"); })}
        </View>}
        {!picker && step === "account" && <View style={s.panel}>
          <Field label="Full name" value={name} onChangeText={setName} maxLength={100} />
          <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91" />
          {verify && <Field label="Email address" value={email} onChangeText={value => { setEmail(value); setChallenge(undefined); setOtp(""); }} autoCapitalize="none" keyboardType="email-address" />}
          {passwordField}<Text style={s.copy}>Use at least 12 characters.</Text>
        </View>}
        {!picker && step === "email" && <>
          <Text style={s.copy}>Enter the 6-digit code sent to</Text>
          <Text style={s.label}>{challenge?.address ?? email}</Text>
          {link("Change email address", () => go("account"))}
          <View style={s.field}>
            <Text style={s.label}>6-digit verification code</Text>
            <View style={s.codeRow}>
              {Array.from({length:6}, (_, index) => <View key={index} style={[s.codeCell, (index === otp.length || !!otp[index]) && s.codeCellFilled]}><Text style={s.codeDigit}>{otp[index] ?? ""}</Text></View>)}
              <TextInput accessibilityLabel="6-digit verification code" value={otp} onChangeText={value => setOtp(value.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" caretHidden style={s.codeInput} />
            </View>
            <Text style={s.copy}>Paste the full code from your email.</Text>
          </View>
          {cooldown ? <Text style={s.copy}>Resend in {cooldown}s</Text> : link("Send a new code", () => void run(send))}
          {expires && <Text style={s.error}>This code has expired.</Text>}
          <View style={s.sage}><Text style={s.copy}>The email code is checked when you submit your shop. Shop approval is a separate step.</Text></View>
        </>}
        {!picker && step === "shop" && <View style={s.panel}>
          <Field label="Shop name" value={shopName} onChangeText={setShopName} maxLength={100} />
          {link(category?.name ?? "Choose shop category", () => setPicker("category"))}
          <Field label="Year opened" value={since} onChangeText={setSince} keyboardType="number-pad" maxLength={4} />
        </View>}
        {!picker && step === "delivery" && <View style={s.panel}>
          <Field label="Street address" value={address} onChangeText={setAddress} maxLength={500} multiline />
          {link(area ? area.name + ", " + area.city : "Choose service area", () => setPicker("area"))}
          <Text style={s.label}>Fulfilment methods</Text>
          {methods.map(([key, label]) => <Pressable accessibilityRole="checkbox" accessibilityState={{checked:fulfilment.includes(key)}} key={key} style={[s.panel, fulfilment.includes(key) && s.sage]} onPress={() => setFulfilment(old => old.includes(key) ? old.filter(item => item !== key) : [...old,key])}><Text style={s.label}>{label}</Text></Pressable>)}
        </View>}
        {!picker && step === "review" && <View style={s.panel}><Text style={s.label}>{shopName}</Text><Text style={s.copy}>{category?.name} · Opened {since}</Text><Text style={s.copy}>{address}</Text><Text style={s.copy}>{area?.name}, {area?.city}</Text><Text style={s.copy}>{methods.filter(([key]) => fulfilment.includes(key)).map(([,label]) => label).join(" · ")}</Text><Text style={s.copy}>Submitting creates your seller account and sends your shop for review.</Text></View>}
        {!picker && step === "status" && <>
          {shop ? <BuyerStateCard title={shop.status === "pending" ? "Your shop is under review" : shop.status === "approved" ? "Your shop is approved" : shop.status === "rejected" ? "Changes requested" : "Shop suspended"} copy={shop.review?.reason || shop.name} tone={shop.status === "approved" ? "success" : "warning"} /> :
            shopError ? <BuyerStateCard title="Shop status unavailable" copy={shopError} tone="error" action="Retry status" onAction={() => setRefresh(value => value + 1)} /> : <ActivityIndicator color={theme.accentInk} />}
          <Text style={s.copy}>Signed in as {session?.name}.</Text>
          {link("Sign out of seller account", () => void run(signOut))}
        </>}
      </ScrollView>
      {action && <View style={s.footer}>{action}{step === "login" && link("New to JustPackIt? Create account", () => void run(async () => { const options = await buyerApi.registrationOptions(); setVerify(options.emailOtpRequired); go("account"); }))}{step === "account" && link("Already have an account? Sign in", () => go("login"))}</View>}
    </>}
  </SafeAreaView></SafeAreaProvider></Modal>;
}

function Field({label,suffix,...props}:TextInputProps & {label:string; suffix?:React.ReactNode}) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><View style={s.inputRow}><TextInput {...props} accessibilityLabel={label} placeholderTextColor={theme.secondary} style={s.input}/>{suffix}</View></View>;
}

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:theme.canvas}, header:{minHeight:64,paddingHorizontal:20,flexDirection:"row",alignItems:"center",gap:16,width:"100%",maxWidth:540,alignSelf:"center"},
  brand:{color:theme.accentInk,fontSize:22,fontWeight:"700",flex:1}, kicker:{fontSize:11,color:theme.accentInk,fontWeight:"700"},
  content:{padding:20,paddingTop:20,gap:16,width:"100%",maxWidth:540,alignSelf:"center"}, title:{fontSize:29,lineHeight:38,color:theme.ink,fontWeight:"700"},
  cover:{borderRadius:22,overflow:"hidden",backgroundColor:theme.peach},
  coverPhoto:{width:"100%",height:120},
  coverCopy:{padding:16,gap:4},
  coverTitle:{color:theme.ink,fontSize:29,lineHeight:34,letterSpacing:-0.7,fontWeight:"700"},
  coverCaption:{color:theme.secondary,fontSize:14,lineHeight:20},
  stepHeading:{gap:4,paddingHorizontal:12,paddingVertical:8,borderLeftWidth:4,borderColor:theme.warningBorder},
  copy:{fontSize:14,lineHeight:20,color:theme.secondary}, sage:{backgroundColor:theme.lime,borderRadius:16,padding:14,gap:6}, panel:{backgroundColor:theme.surface,borderRadius:16,borderWidth:1,borderColor:theme.border,padding:16,gap:8},
  field:{gap:8},label:{fontSize:15,fontWeight:"600",color:theme.ink},inputRow:{flexDirection:"row",alignItems:"center",backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border,borderRadius:12},
  input:{flex:1,minHeight:50,padding:12,color:theme.ink,fontSize:15},link:{minHeight:44,justifyContent:"center",alignItems:"center",paddingHorizontal:10},linkText:{color:theme.accentInk,textAlign:"center",fontWeight:"600"},
  codeRow:{flexDirection:"row",gap:8,position:"relative"},
  codeCell:{flex:1,minHeight:54,borderWidth:1,borderColor:theme.border,borderRadius:10,backgroundColor:theme.surface,alignItems:"center",justifyContent:"center"},
  codeCellFilled:{borderColor:theme.accentInk},
  codeDigit:{fontSize:24,color:theme.ink,fontWeight:"700"},
  codeInput:{position:"absolute",top:0,right:0,bottom:0,left:0,opacity:0,color:"transparent",backgroundColor:"transparent",fontSize:18},
  disabledText:{color:theme.secondary},
  footer:{paddingHorizontal:20,paddingVertical:12,gap:4,width:"100%",maxWidth:540,alignSelf:"center",backgroundColor:theme.surface,borderTopWidth:1,borderColor:theme.border},button:{minHeight:50,backgroundColor:theme.coral,borderRadius:12,justifyContent:"center",alignItems:"center"},buttonText:{color:theme.ink,fontSize:15,fontWeight:"600"},disabled:{backgroundColor:theme.disabled},error:{color:theme.error,fontSize:14,lineHeight:20},loader:{padding:30},
});
