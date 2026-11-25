import { theme, themedStyles } from "./theme";
import { useEffect, useState } from "react";
import { StyleSheet, ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ApiError, buyerApi, marketApi, type Category, type ServiceArea, type Session } from "./api";
import { StatusBar } from "expo-status-bar";
import { SellerWorkspace } from "./SellerWorkspace";
import { BuyerRecovery } from "./BuyerRecovery";
import { BuyerStateCard } from "./BuyerStateCard";
import { launchImageLibraryAsync, type ImagePickerAsset } from "expo-image-picker";
import { onboardingPhotoLimits, photoBody } from "./SellerPhotoEditor";
import { sellerApi } from "./sellerApi";
import { resolveImage } from "./images";
import * as storage from "./deviceStorage";

const pendingRequests = new WeakSet<object>();
const clockNow = () => Date.now();

const sessionKey = "jpi.seller.session";
const storefront = require("../assets/seller-storefront.jpg");
const methods = [
  ["pickup", "Customer pickup", "Customers collect their orders at your shop."],
  ["seller_delivery", "Shop delivery", "You or your team deliver the orders."],
  ["platform_delivery", "Platform rider", "A platform rider collects orders when available."],
] as const;
type Step = "login" | "account" | "email" | "shop" | "delivery" | "review" | "status" | "recovery";
const backSteps: Partial<Record<Step, Step>> = { account:"login", email:"account", delivery:"shop", review:"delivery", recovery:"login" };
const setupCopy = {
  account: ["Account details", "Use a mobile number you can sign in with later."],
  email: ["Email verification", "Have your email code ready to finish setting up your shop."],
  shop: ["Shop profile", "Add the details customers will use to recognise your shop."],
  delivery: ["Order handover", "Choose where your shop operates and how customers get their orders."],
  review: ["Review & submit", "Double-check your details before sending your application."],
} as const;

export function SellerAccess({ close, initialSession }: { close: () => void; initialSession?: Session }) {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [step, setStep] = useState<Step>(() => initialSession ? "status" : "login");
  const [session, setSession] = useState<Session | null>(() => initialSession ?? null);
  const [shop, setShop] = useState<Awaited<ReturnType<typeof buyerApi.sellerShop>>>();
  const [shopError, setShopError] = useState("");
  const [checkingShop, setCheckingShop] = useState(true);
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
  const [accountSubmitted, setAccountSubmitted] = useState(false);
  const [loginSubmitted, setLoginSubmitted] = useState(false);
  const [now, setNow] = useState(0);
  const [shopName, setShopName] = useState("");
  const [address, setAddress] = useState("");
  const [since, setSince] = useState("");
  const [shopSubmitted, setShopSubmitted] = useState(false);
  const [coverAsset, setCoverAsset] = useState<ImagePickerAsset>();
  const [coverError, setCoverError] = useState("");
  const [coverSaved, setCoverSaved] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [failedCover, setFailedCover] = useState<string>();
  const [deliverySubmitted, setDeliverySubmitted] = useState(false);
  const [editingReview, setEditingReview] = useState(false);
  const [category, setCategory] = useState<Category>();
  const [area, setArea] = useState<ServiceArea>();
  const [fulfilment, setFulfilment] = useState<string[]>([]);
  const [catalogue, setCatalogue] = useState<{categories:Category[]; areas:ServiceArea[]}>();
  const [picker, setPicker] = useState<"category" | "area" | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const openPicker = (next: "area" | "category") => {
    setPickerSearch("");
    setPicker(next);
  };
  const enteredPhone = phone.replace(/[\s()-]/g, "");
  const normalizedPhone = /^[6-9]\d{9}$/.test(enteredPhone) ? "+91" + enteredPhone
    : /^91[6-9]\d{9}$/.test(enteredPhone) ? "+" + enteredPhone
    : enteredPhone;
  const validPhone = /^\+[1-9]\d{9,14}$/.test(normalizedPhone);
  const codeClock = Math.max(now, clockNow());
  const expires = challenge ? codeClock >= challenge.expires : false;
  const cooldown = challenge ? Math.max(0, Math.ceil((challenge.retryAt - codeClock) / 1000)) : 0;
  const codeSecondsLeft = challenge ? Math.max(0, Math.ceil((challenge.expires - codeClock) / 1000)) : 0;
  const codeTimeLeft = `${Math.floor(codeSecondsLeft / 60)}:${String(codeSecondsLeft % 60).padStart(2, "0")}`;

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
    }).finally(() => {
      if (active) setCheckingShop(false);
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
    setCheckingShop(true);
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
    setCoverAsset(undefined);
    setCoverSaved(false);
    setCoverError("");
    setShop(undefined);
    setCheckingShop(false);
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
  const refreshShop = () => {
    setFailedCover(undefined);
    setCheckingShop(true);
    setShopError("");
    setRefresh(value => value + 1);
  };
  const uploadCover = async (token: string, asset: ImagePickerAsset) => {
    setCoverUploading(true);
    try {
      const limits = await sellerApi.photoCapability(token);
      if (!limits.enabled) throw new Error("Shop photo uploads are unavailable right now.");
      const { buffer, type } = photoBody(asset, limits);
      const currentShop = await sellerApi.shop(token);
      const uploaded = await sellerApi.uploadShopCover(token, currentShop, buffer, type);
      setFailedCover(undefined);
      setShop({ ...currentShop, coverImage: uploaded.coverImage, status: uploaded.status });
      setCoverAsset(undefined);
      setCoverSaved(true);
      refreshShop();
    } finally {
      setCoverUploading(false);
    }
  };
  const back = () => {
    if (busy) return;
    if (workspaceOpen) { setWorkspaceOpen(false); refreshShop(); return; }
    if (picker) { setPicker(null); return; }
    if (editingReview && (step === "account" || step === "shop" || step === "delivery")) {
      setEditingReview(false);
      go("review");
      return;
    }
    if (step === "shop") go(verify ? "email" : "account");
    else if (backSteps[step]) go(backSteps[step]!);
    else close();
  };

  if (workspaceOpen && session) return <Modal onRequestClose={back}><SafeAreaProvider><SafeAreaView style={s.screen}><StatusBar style="dark" /><SellerWorkspace session={session} back={back} signOut={signOut} expired={expire} /></SafeAreaView></SafeAreaProvider></Modal>;
  if (step === "recovery") return <Modal onRequestClose={back}><SafeAreaProvider><SafeAreaView style={s.screen}><BuyerRecovery back={() => go("login")} /></SafeAreaView></SafeAreaProvider></Modal>;
  const title = picker === "area" ? "Choose service area" : picker === "category" ? "Choose category" :
    {login:"Welcome back", account:"Create seller account", email:"Check your email", shop:"Tell us about your shop", delivery:"Address & fulfilment", review:"Review your shop", status:"Your seller workspace"}[step];
  const hasCover = !picker && (step === "login" || step === "status");
  const savedCover = step === "status" ? resolveImage(shop?.coverImage) : undefined;
  const showSavedCover = !!savedCover && savedCover !== failedCover;
  const approval = shop ? ({
    pending: { title: "Your shop is under review", copy: "You can prepare your catalogue and opening hours while we review your shop.", tone: "info", icon: "clock", action: "Set up your shop" },
    approved: { title: "Your shop is approved", copy: "Open your workspace to manage your catalogue, opening hours and orders.", tone: "success", icon: "check", action: "Open seller workspace" },
    rejected: { title: "Changes requested", copy: "Read the review feedback below, then update your shop details in the workspace.", tone: "warning", icon: "warning", action: "Open workspace to make changes" },
    suspended: { title: "Shop suspended", copy: "Check the feedback below for any details about your shop’s suspension.", tone: "error", icon: "warning", action: "Open seller workspace" },
  } as const)[shop.status] : undefined;
  const setupSteps = verify
    ? ["account", "email", "shop", "delivery", "review"]
    : ["account", "shop", "delivery", "review"];
  const setupStep = setupSteps.indexOf(step) + 1;
  const pickerOptions = picker === "area" ? catalogue?.areas : catalogue?.categories;
  const searchTerms = pickerSearch.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
  const visibleOptions = pickerOptions?.filter(item => {
    const searchable = ("city" in item ? [item.name, item.city, ...item.pincodes].join(" ") : item.name).toLowerCase();
    return searchTerms.every(term => searchable.includes(term));
  });
  const currentYear = new Date().getFullYear();
  const shopNameError = shopName.trim().length < 2 ? "Enter at least 2 characters for your shop name." : "";
  const categoryError = category ? "" : "Select a category for your shop.";
  const addressError = address.trim().length < 2 ? "Enter your shop’s street address." : "";
  const areaError = area ? "" : "Select your shop’s service area.";
  const fulfilmentError = fulfilment.length ? "" : "Select at least one way to hand over orders.";
  const yearError = /^\d{4}$/.test(since) && Number(since) >= 1900 && Number(since) <= currentYear
    ? "" : `Enter a four-digit year from 1900 to ${currentYear}.`;
  const button = (label:string, action:()=>void, disabled = false) => <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={action} style={[s.button, (disabled || busy) && s.disabled]}><Text style={[s.buttonText,(disabled || busy) && s.disabledText]}>{busy ? "Please wait…" : label}</Text></Pressable>;
  const link = (label:string, action:()=>void) => <Pressable accessibilityRole="button" disabled={busy} onPress={action} style={s.link}><Text style={s.linkText}>{label}</Text></Pressable>;
  const nameError = name.trim().length < 2 ? "Enter your full name." : "";
  const phoneError = !validPhone ? "Enter a valid mobile number with its country code." : "";
  const passwordError = password.length < 12 ? "Use at least 12 characters." : "";
  const emailError = !/^\S+@\S+\.\S+$/.test(email.trim()) ? "Enter a valid email address." : "";
  const loginPasswordError = !password.trim() ? "Enter your password." : "";
  const visiblePasswordError = step === "account" && accountSubmitted ? passwordError
    : step === "login" && loginSubmitted ? loginPasswordError : undefined;
  const submitLogin = () => void run(async () => {
    setLoginSubmitted(true);
    if (phoneError || loginPasswordError) return;
    await acceptSession(await buyerApi.login(normalizedPhone, password));
    setLoginSubmitted(false);
  });
  const passwordField = <Field label="Password" placeholder="Enter your password" value={password} onChangeText={value => { setPassword(value); if (step === "login") setError(""); }} secureTextEntry={!visible} maxLength={128} autoCapitalize="none" autoCorrect={false} autoComplete={step === "login" ? "current-password" : "new-password"} returnKeyType={step === "login" ? "go" : undefined} onSubmitEditing={step === "login" ? submitLogin : undefined} editable={!busy} hint={step === "account" ? "Use at least 12 characters." : undefined} error={visiblePasswordError} suffix={link(visible ? "Hide" : "Show", () => setVisible(value => !value))} />;
  let action;
  if (!picker && step === "login") action = button("Sign in", submitLogin);
  if (!picker && step === "account") action = button("Continue", () => void run(async () => {
    setAccountSubmitted(true);
    if (nameError || phoneError || passwordError || (verify && emailError)) return;
    const options = await buyerApi.registrationOptions();
    setVerify(options.emailOtpRequired);
    if (options.emailOtpRequired) {
      if (!options.emailOtpAvailable) throw new Error("Email verification is unavailable right now. Try again later.");
      if (emailError) return;
      if (editingReview && challenge?.address === email.trim().toLowerCase() && clockNow() < challenge.expires && /^\d{6}$/.test(otp)) {
        setEditingReview(false);
        go("review");
        return;
      }
      await send();
    } else {
      if (!catalogue) await loadCatalogue();
      go(editingReview ? "review" : "shop");
      setEditingReview(false);
    }
  }));
  if (!picker && step === "email" && expires) action = button("Send a new code", () => void run(send), cooldown > 0);
  if (!picker && step === "email" && !expires) action = button("Continue with code", () => void run(async () => {
    if (!challenge || expires || !/^\d{6}$/.test(otp)) throw new Error("Enter a valid six-digit email code.");
    if (!catalogue) await loadCatalogue();
    go(editingReview ? "review" : "shop");
    setEditingReview(false);
  }), !challenge || expires || otp.length !== 6);
  if (!picker && step === "shop") action = button(editingReview ? "Back to review" : "Continue", () => {
    setShopSubmitted(true);
    if (shopNameError || categoryError || yearError) return;
    setShopSubmitted(false);
    go(editingReview ? "review" : "delivery");
    setEditingReview(false);
  });
  if (!picker && step === "delivery") action = button(editingReview ? "Back to review" : "Review shop", () => {
    setDeliverySubmitted(true);
    if (addressError || areaError || fulfilmentError) return;
    setDeliverySubmitted(false);
    setEditingReview(false);
    go("review");
  });
  if (!picker && step === "review") action = button("Submit shop for approval", () => void run(async () => {
    if (nameError || phoneError || passwordError || (verify && emailError)) {
      setEditingReview(true);
      setAccountSubmitted(true);
      go("account");
      return;
    }
    if (shopNameError || categoryError || yearError) {
      setEditingReview(true);
      setShopSubmitted(true);
      go("shop");
      return;
    }
    if (addressError || areaError || fulfilmentError) {
      setEditingReview(true);
      setDeliverySubmitted(true);
      go("delivery");
      return;
    }
    if (verify && (!challenge || clockNow() >= challenge.expires)) {
      setEditingReview(true);
      setOtp("");
      go(challenge ? "email" : "account");
      throw new Error("Request a new email code to submit your application.");
    }
    try {
      const result = await buyerApi.registerSeller({
        name:name.trim(), phone:normalizedPhone, password,
        ...(verify && challenge ? {email:challenge.address, emailChallengeId:challenge.id, emailOtp:otp} : {}),
        shop:{name:shopName.trim(),address:address.trim(),since:Number(since),categoryIds:[category!.id],serviceAreaIds:[area!.id],fulfilment},
      });
      await acceptSession(result);
      if (coverAsset) {
        try { await uploadCover(result.token, coverAsset); }
        catch (reason) {
          throw new Error(reason instanceof Error
            ? `Your shop application was submitted. Photo upload failed: ${reason.message}`
            : "Your shop application was submitted. Retry the photo upload below.");
        }
      }
    } catch (reason) {
      if (reason instanceof ApiError && /EMAIL|OTP/.test(reason.code ?? "")) {
        setEditingReview(true);
        setOtp("");
        go("email");
      }
      throw reason;
    }
  }));
  if (!picker && step === "status") action = button(approval?.action ?? "Open seller workspace", () => setWorkspaceOpen(true));

  return <Modal onRequestClose={back}><SafeAreaProvider><SafeAreaView style={s.screen}><StatusBar style="dark" />
    <View style={s.header}>
      <Text style={s.brand}>JustPackIt Seller</Text>
      {link(step === "login" || step === "status" ? "Close" : "Back", back)}
    </View>
    {restoring ? <ActivityIndicator style={s.loader} color={theme.accentInk} /> : <>
      <ScrollView key={picker ?? step} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[s.content, step === "login" && s.loginContent]}>
        {hasCover ? <View style={s.cover}>
          <Image source={showSavedCover ? { uri: savedCover } : storefront} resizeMode="cover" style={[s.coverPhoto, step === "login" && s.loginPhoto]} accessible={showSavedCover} accessibilityLabel={showSavedCover ? "Current shop cover photo" : undefined} onError={showSavedCover ? () => setFailedCover(savedCover) : undefined} testID="seller-access-cover" />
          <View style={s.coverCopy}>
            <Text accessibilityRole="header" style={s.coverTitle}>{title}</Text>
            <Text style={s.coverCaption}>{step === "login" ? "Sign in with your registered mobile number." : shop?.name ?? session?.name ?? "Seller account"}</Text>
          </View>
        </View> : <View style={s.stepHeading}>
          {!picker && setupStep > 0 && <>
            <Text style={s.progressLabel}>Step {setupStep} of {setupSteps.length} · {setupCopy[step as keyof typeof setupCopy][0]}</Text>
            <View style={s.progress} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {setupSteps.map((name, index) => (
                <View key={name} style={[s.progressSegment, index < setupStep && s.progressFilled]} />
              ))}
            </View>
          </>}
          <Text accessibilityRole="header" style={s.title}>{title}</Text>
          {picker === "category" && <Text style={s.copy}>Pick the category that best describes what your shop sells.</Text>}
          {!picker && setupStep > 0 && <Text style={s.setupDescription}>{setupCopy[step as keyof typeof setupCopy][1]}</Text>}
        </View>}
        {!!error && <View style={s.field}><Text accessibilityRole="alert" style={s.error}>{error}</Text>{requestId && <Text selectable style={s.copy}>Support reference: {requestId}</Text>}</View>}
        {picker && !!pickerOptions?.length && (
          <Field label={picker === "area" ? "Search service areas" : "Search categories"} placeholder={picker === "area" ? "Locality, city or PIN code" : "e.g. Grocery"} value={pickerSearch} onChangeText={setPickerSearch} autoCorrect={false} returnKeyType="search"
            suffix={pickerSearch ? link("Clear", () => setPickerSearch("")) : undefined} />
        )}
        {picker && visibleOptions?.map(item => {
          const selected = item.id === (picker === "area" ? area?.id : category?.id);
          return (
            <Pressable accessibilityRole="button" accessibilityState={{ selected }} key={item.id} style={[s.panel, s.pickerOption, selected && s.selectedOption]} onPress={() => {
              if ("city" in item) setArea(item); else setCategory(item);
              setPicker(null);
            }}>
              <View style={s.methodCopy}>
                <Text style={s.label}>{item.name}</Text>
                {"city" in item && <Text style={s.copy}>{[item.city, item.pincodes.join(", ")].filter(Boolean).join(" · ")}</Text>}
              </View>
              {selected && <Text accessible={false} style={s.categoryText}>✓ Selected</Text>}
            </Pressable>
          );
        })}
        {picker && !pickerOptions?.length && <BuyerStateCard title="No options available" copy="Try again to refresh available choices." action="Refresh options" onAction={() => void run(loadCatalogue)} />}
        {picker && !!pickerOptions?.length && !visibleOptions?.length && (
          <BuyerStateCard title={picker === "area" ? "No matching service areas" : "No matching categories"} copy="Try a shorter search or clear it to see all options." action="Clear search" onAction={() => setPickerSearch("")} />
        )}
        {!picker && step === "login" && <>
          <View style={[s.panel, s.loginPanel]}>
            <Field label="Mobile number" value={phone} onChangeText={value => { setPhone(value); setError(""); }} autoComplete="tel" keyboardType="phone-pad" placeholder="+91 98765 43210" editable={!busy} error={loginSubmitted ? phoneError : undefined} />
            {passwordField}
            {action}
            {link("Forgot password?", () => { setPassword(""); go("recovery"); })}
          </View>
          <Pressable accessibilityRole="button" disabled={busy} style={[s.link, s.applyAction]} onPress={() => void run(async () => {
            const options = await buyerApi.registrationOptions();
            setVerify(options.emailOtpRequired);
            setAccountSubmitted(false);
            go("account");
          })}>
            <Text style={s.linkText}>New to JustPackIt? Create account</Text>
          </Pressable>
        </>}
        {!picker && step === "account" && <View style={s.panel}>
          <Field label="Full name" autoComplete="name" value={name} onChangeText={setName} maxLength={100} error={accountSubmitted ? nameError : undefined} />
          <Field label="Mobile number" value={phone} onChangeText={setPhone} autoComplete="tel" keyboardType="phone-pad" placeholder="+91 98765 43210" error={accountSubmitted ? phoneError : undefined} />
          {verify && <Field label="Email address" value={email} onChangeText={value => { setEmail(value); setChallenge(undefined); setOtp(""); }} autoComplete="email" autoCorrect={false} autoCapitalize="none" keyboardType="email-address" hint="We’ll send your verification code here." error={accountSubmitted ? emailError : undefined} />}
          {passwordField}
        </View>}
        {!picker && step === "email" && <View style={[s.panel, s.setupPanel]}>
          <Text style={s.copy}>Enter the 6-digit code sent to</Text>
          <Text selectable style={s.label}>{challenge?.address ?? email}</Text>
          {link("Change email address", () => go("account"))}
          <View style={s.field}>
            <Text style={s.label}>6-digit verification code</Text>
            <View style={s.codeRow}>
              {Array.from({length:6}, (_, index) => <View key={index} style={[s.codeCell, (index === otp.length || !!otp[index]) && s.codeCellFilled]}><Text style={s.codeDigit}>{otp[index] ?? ""}</Text></View>)}
              <TextInput accessibilityLabel="6-digit verification code" value={otp} editable={!expires && !busy} onChangeText={value => { setOtp(value.replace(/\D/g, "")); setError(""); }} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" caretHidden style={s.codeInput} />
            </View>
            {!expires && <Text style={s.copy}>Paste the full code from your email. Expires in {codeTimeLeft}.</Text>}
          </View>
          {cooldown > 0 ? <Text style={s.copy}>Resend available in {cooldown}s</Text> : !expires && link("Send a new code", () => void run(send))}
          {expires && <Text accessibilityRole="alert" style={s.error}>This code has expired. Request a new code to continue.</Text>}
          <View style={s.sage}><Text style={s.copy}>The email code is checked when you submit your shop for approval.</Text></View>
        </View>}
        {!picker && step === "shop" && <>
        <View style={[s.panel, s.shopPanel]}>
          <Field label="Shop name" placeholder="Name customers know your shop by" value={shopName} onChangeText={setShopName} maxLength={100} error={shopSubmitted ? shopNameError : undefined} />
          <View style={s.field}>
            <Text style={s.label}>Shop category</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={category ? `Shop category, ${category.name}` : "Choose shop category"} onPress={() => openPicker("category")} style={[s.inputRow, s.categoryField, category && s.selectedOption, shopSubmitted && categoryError ? s.invalidField : null]}>
              <Text style={s.categoryText}>{category?.name ?? "Choose shop category"}</Text>
              <Text style={s.categoryText} accessible={false}>›</Text>
            </Pressable>
            {shopSubmitted && !!categoryError && <Text accessibilityRole="alert" style={s.error}>{categoryError}</Text>}
          </View>
          <Field label="Year opened" placeholder="YYYY" hint="The year your shop started operating." value={since} onChangeText={value => setSince(value.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={4} error={shopSubmitted ? yearError : undefined} />
        </View>
        <View style={[s.panel, s.setupPanel]}>
          <Text accessibilityRole="header" style={s.label}>Shop cover photo · Optional</Text>
          <Text style={s.copy}>Choose a clear photo of your storefront or shop interior. We’ll upload it when you submit.</Text>
          <Text style={s.copy}>JPEG, PNG or WebP · Up to 5 MB</Text>
          {coverAsset && <Image accessibilityLabel="Selected shop cover" source={{ uri: coverAsset.uri }} style={s.coverPreview} />}
          {!!coverError && <Text accessibilityRole="alert" style={s.error}>{coverError}</Text>}
          {link(coverAsset ? "Change shop photo" : "Choose shop photo", () => void run(async () => {
            setCoverError("");
            try {
              const result = await launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, base64: true });
              if (result.canceled) return;
              photoBody(result.assets[0], onboardingPhotoLimits);
              setCoverAsset(result.assets[0]);
            } catch (reason) {
              setCoverError(reason instanceof Error ? reason.message : "Could not open your photo library.");
            }
          }))}
          {coverAsset && link("Remove selected photo", () => { setCoverAsset(undefined); setCoverError(""); })}
        </View>
        </>}
        {!picker && step === "delivery" && <>
          <View style={[s.panel, s.shopPanel]}>
            <Field label="Shop address" placeholder="Shop number, building and street" value={address} onChangeText={setAddress} maxLength={500} multiline error={deliverySubmitted ? addressError : undefined} />
            <View style={s.field}>
              <Text style={s.label}>Service area</Text>
              <Pressable accessibilityRole="button" onPress={() => openPicker("area")} style={[s.inputRow, s.categoryField, area && s.selectedOption, deliverySubmitted && !!areaError && s.invalidField]}>
                <Text style={s.categoryText}>{area ? `${area.name}, ${area.city}` : "Choose service area"}</Text>
                <Text accessible={false} style={s.categoryText}>›</Text>
              </Pressable>
              {deliverySubmitted && !!areaError && <Text accessibilityRole="alert" style={s.error}>{areaError}</Text>}
            </View>
          </View>
          <View style={[s.panel, s.setupPanel]}>
            <Text accessibilityRole="header" style={s.label}>How will customers get their orders?</Text>
            <Text style={s.copy}>Choose all methods your shop supports.</Text>
            {methods.map(([key, label, description]) => {
              const checked = fulfilment.includes(key);
              return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} key={key} style={[s.inputRow, s.methodRow, checked && s.selectedOption]} onPress={() => setFulfilment(old => old.includes(key) ? old.filter(item => item !== key) : [...old, key])}>
                <View style={s.methodCopy}><Text style={s.label}>{label}</Text><Text style={s.copy}>{description}</Text></View>
                <View style={[s.methodCheck, checked && s.selectedOption]}><Text style={s.categoryText}>{checked ? "✓" : ""}</Text></View>
              </Pressable>;
            })}
            {deliverySubmitted && !!fulfilmentError && <Text accessibilityRole="alert" style={s.error}>{fulfilmentError}</Text>}
          </View>
        </>}
        {!picker && step === "review" && <>
          <View style={[s.panel, s.setupPanel]}>
            <View style={s.reviewHeader}>
              <Text accessibilityRole="header" style={s.reviewTitle}>Seller account</Text>
              {link("Edit account details", () => { setEditingReview(true); go("account"); })}
            </View>
            <ReviewField label="Full name" value={name.trim()} />
            <ReviewField label="Sign-in mobile number" value={normalizedPhone} />
            {verify && <ReviewField label="Verification email" value={challenge?.address ?? email.trim().toLowerCase()} />}
          </View>
          <View style={[s.panel, s.setupPanel]}>
            <View style={s.reviewHeader}>
              <Text accessibilityRole="header" style={s.reviewTitle}>Shop details</Text>
              {link("Edit shop details", () => { setEditingReview(true); go("shop"); })}
            </View>
            <ReviewField label="Shop name" value={shopName.trim()} />
            <ReviewField label="Shop category" value={category?.name ?? ""} />
            <ReviewField label="Year opened" value={since} />
            <ReviewField label="Shop cover photo" value={coverAsset ? "Ready to upload" : "No photo selected"} />
            {coverAsset && <Image accessibilityLabel="Shop cover preview" source={{ uri: coverAsset.uri }} style={s.coverPreview} />}
          </View>
          <View style={[s.panel, s.setupPanel]}>
            <View style={s.reviewHeader}>
              <Text accessibilityRole="header" style={s.reviewTitle}>Address & fulfilment</Text>
              {link("Edit address & fulfilment", () => { setEditingReview(true); go("delivery"); })}
            </View>
            <ReviewField label="Shop address" value={address.trim()} />
            <ReviewField label="Service area" value={area ? `${area.name}, ${area.city}` : ""} />
            <ReviewField label="Order handover" value={methods.filter(([key]) => fulfilment.includes(key)).map(([, label]) => label).join("\n")} />
          </View>
          <View style={s.sage}>
            <Text accessibilityRole="header" style={s.label}>What happens next?</Text>
            <Text style={s.reviewNote}>Submitting creates your seller account and sends your shop for approval. You can check the application status from Seller access.</Text>
          </View>
        </>}
        {!picker && step === "status" && (
          <View style={s.statusBody}>
            {session && coverAsset && <View style={[s.panel, s.setupPanel]}>
              <Image accessibilityLabel="Pending shop cover preview" source={{ uri: coverAsset.uri }} style={s.coverPreview} />
              {coverUploading || busy ? (
                <View style={s.statusLoading} accessibilityLiveRegion="polite">
                  <ActivityIndicator color={theme.accentInk} />
                  <Text style={s.label}>Uploading shop photo…</Text>
                </View>
              ) : <>
                <Text style={s.label}>Shop photo still needs to upload</Text>
                {button("Retry shop photo upload", () => void run(() => uploadCover(session.token, coverAsset)))}
                {link("Discard selected photo", () => { setCoverAsset(undefined); setError(""); })}
              </>}
            </View>}
            {coverSaved && <Text accessibilityLiveRegion="polite" style={s.copy}>Shop cover photo submitted for review.</Text>}
            {approval && !shopError && (
              <BuyerStateCard title={approval.title} copy={approval.copy} tone={approval.tone} icon={approval.icon} />
            )}
            {shop?.review?.reason ? (
              <View style={s.panel}>
                <Text style={s.summaryHeading}>Review feedback</Text>
                <Text selectable style={s.copy}>{shop.review.reason}</Text>
              </View>
            ) : null}
            {shopError ? (
              <BuyerStateCard title="Shop status unavailable" copy={shopError} tone="error" action="Retry status" onAction={refreshShop} />
            ) : checkingShop ? (
              <View style={s.statusLoading} accessibilityLiveRegion="polite">
                <ActivityIndicator color={theme.accentInk} />
                <Text style={s.copy}>Checking shop status…</Text>
              </View>
            ) : !approval ? (
              <BuyerStateCard title="Shop status unavailable" copy="Refresh to check for your shop application." icon="shop" action="Refresh shop status" onAction={refreshShop} />
            ) : (
              <Pressable accessibilityRole="button" style={[s.link, s.applyAction]} onPress={refreshShop}>
                <Text style={s.linkText}>Refresh shop status</Text>
              </Pressable>
            )}
            <View style={s.sessionRow}>
              <Text style={s.copy}>Signed in as {session?.name}.</Text>
              {link("Sign out of seller account", () => void run(signOut))}
            </View>
          </View>
        )}
      </ScrollView>
      {action && step !== "login" && (
        <View style={s.footer}>
          {action}
          {step === "account" && link("Already have an account? Sign in", () => go("login"))}
        </View>
      )}
    </>}
  </SafeAreaView></SafeAreaProvider></Modal>;
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return <View style={s.reviewField}>
    <Text style={s.copy}>{label}</Text>
    <Text style={s.label}>{value}</Text>
  </View>;
}

function Field({label,suffix,error,hint,...props}:TextInputProps & {label:string; suffix?:React.ReactNode; error?:string; hint?:string}) {
  return <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <View style={[s.inputRow, !!error && s.invalidField]}><TextInput {...props} accessibilityLabel={label} placeholderTextColor={theme.secondary} style={s.input}/>{suffix}</View>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : hint ? <Text style={s.copy}>{hint}</Text> : null}
  </View>;
}

const s = themedStyles(() => StyleSheet.create({
  screen:{flex:1,backgroundColor:theme.canvas}, header:{minHeight:64,paddingHorizontal:20,flexDirection:"row",alignItems:"center",gap:16,width:"100%",maxWidth:540,alignSelf:"center"},
  brand:{color:theme.accentInk,fontSize:22,fontWeight:"700",flex:1},
  content:{padding:20,paddingTop:20,gap:16,width:"100%",maxWidth:540,alignSelf:"center"}, title:{fontSize:29,lineHeight:38,color:theme.ink,fontWeight:"700"},
  cover:{borderRadius:22,overflow:"hidden",backgroundColor:theme.hero},
  coverPhoto:{width:"100%",height:120},
  loginPhoto:{height:96},
  loginContent:{paddingTop:8},
  loginPanel:{borderRadius:20,gap:12},
  applyAction:{backgroundColor:theme.selected,borderWidth:1,borderColor:theme.border,borderRadius:14,minHeight:50},
  coverCopy:{padding:16,gap:4},
  coverTitle:{color:theme.ink,fontSize:29,lineHeight:34,letterSpacing:-0.7,fontWeight:"700"},
  coverCaption:{color:theme.secondary,fontSize:14,lineHeight:20},
  stepHeading:{gap:8},
  setupDescription:{color:theme.ink,fontSize:14,lineHeight:20},
  coverPreview:{width:"100%",aspectRatio:2,borderRadius:12,backgroundColor:theme.selected},
  progressLabel:{color:theme.accentInk,fontSize:13,fontWeight:"600"},
  progress:{flexDirection:"row",gap:5,maxWidth:180,marginBottom:4},
  progressSegment:{flex:1,height:3,borderRadius:2,backgroundColor:theme.border},
  progressFilled:{backgroundColor:theme.primary},
  setupPanel:{borderRadius:20,gap:10},
  shopPanel:{borderRadius:20,gap:16},
  categoryField:{minHeight:52,paddingHorizontal:12,justifyContent:"space-between",gap:12},
  categoryText:{color:theme.accentInk,fontSize:15,fontWeight:"600",flexShrink:1},
  selectedOption:{backgroundColor:theme.selected,borderColor:theme.accentInk},
  pickerOption:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:12},
  methodRow:{padding:12,gap:12},
  methodCopy:{flex:1,gap:4},
  methodCheck:{height:22,width:22,borderWidth:1,borderColor:theme.secondary,borderRadius:6,alignItems:"center",justifyContent:"center"},
  invalidField:{borderColor:theme.errorBorder},
  statusBody:{gap:12},
  statusLoading:{flexDirection:"row",alignItems:"center",gap:8,paddingVertical:10},
  sessionRow:{alignItems:"center",paddingTop:8,borderTopWidth:1,borderColor:theme.border},
  summaryHeading:{color:theme.accentInk,fontSize:14,fontWeight:"700"},
  reviewHeader:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between"},
  reviewTitle:{fontSize:16,fontWeight:"700",color:theme.accentInk},
  reviewField:{gap:4,borderTopWidth:1,borderColor:theme.border,paddingTop:10},
  reviewNote:{color:theme.ink,fontSize:14,lineHeight:20},
  copy:{fontSize:14,lineHeight:20,color:theme.secondary}, sage:{backgroundColor:theme.selected,borderRadius:16,padding:14,gap:6}, panel:{backgroundColor:theme.surface,borderRadius:16,borderWidth:1,borderColor:theme.border,padding:16,gap:8},
  field:{gap:8},label:{fontSize:15,fontWeight:"600",color:theme.ink},inputRow:{flexDirection:"row",alignItems:"center",backgroundColor:theme.surface,borderWidth:1,borderColor:theme.controlBorder,borderRadius:12},
  input:{flex:1,minHeight:50,padding:12,color:theme.ink,fontSize:15},link:{minHeight:44,justifyContent:"center",alignItems:"center",paddingHorizontal:10},linkText:{color:theme.accentInk,textAlign:"center",fontWeight:"600"},
  codeRow:{flexDirection:"row",gap:8,position:"relative"},
  codeCell:{flex:1,minHeight:54,borderWidth:1,borderColor:theme.border,borderRadius:10,backgroundColor:theme.surface,alignItems:"center",justifyContent:"center"},
  codeCellFilled:{borderColor:theme.accentInk},
  codeDigit:{fontSize:24,color:theme.ink,fontWeight:"700"},
  codeInput:{position:"absolute",top:0,right:0,bottom:0,left:0,opacity:0,color:"transparent",backgroundColor:"transparent",fontSize:18},
  disabledText:{color:theme.secondary},
  footer:{paddingHorizontal:20,paddingVertical:12,gap:4,width:"100%",maxWidth:540,alignSelf:"center",backgroundColor:theme.surface,borderTopWidth:1,borderColor:theme.border},button:{minHeight:50,backgroundColor:theme.primary,borderRadius:12,justifyContent:"center",alignItems:"center"},buttonText:{color:theme.onPrimary,fontSize:15,fontWeight:"600"},disabled:{backgroundColor:theme.disabled},error:{color:theme.error,fontSize:14,lineHeight:20},loader:{padding:30},
}));
