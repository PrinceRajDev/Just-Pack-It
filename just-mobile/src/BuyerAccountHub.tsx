import { theme, themedStyles } from "./theme";
import { BuyerStateCard } from "./BuyerStateCard";
import { useEffect, useState } from "react";
import { StyleSheet, ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { buyerApi, type Product, type Session, type Shop } from "./api";
import { BuyerAuthNotice } from "./BuyerAuthNotice";
import { MarketIcon, type MarketIconName } from "./MarketIcon";
import * as storage from "./deviceStorage";

const languageKey = "jpi.account.language";
type Panel = "language" | "notifications" | "favourites" | "signout";
type Favourite = { id: string; name: string; key: string; shop?: Shop; product?: Product };

export function BuyerAccountHub({ initialFavourites, seller, session, area, shops, products, back, signIn, profile, addresses, orders, signOut, browse, openShop, add }: {
  initialFavourites?: boolean;
  seller: () => void;
  session: Session | null; area?: string; shops: Shop[]; products: Product[];
  back: () => void; signIn: () => void; profile: () => void; addresses: () => void;
  orders: () => void; signOut: () => Promise<void>; browse: () => void;
  openShop: (shop: Shop) => void; add: (product: Product) => void;
}) {
  const [panel, setPanel] = useState<Panel | null>(initialFavourites ? "favourites" : null);
  const [hindi, setHindi] = useState(false);
  const [draftHindi, setDraftHindi] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<"products" | "shops">("products");
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [updates, setUpdates] = useState<Awaited<ReturnType<typeof buyerApi.notifications>>>([]);
  useEffect(() => {
    let active = true;
    void storage.getItemAsync(languageKey).then(value => { if (active) setHindi(value === "hi"); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!session) return;
    let active = true;
    void buyerApi.profile(session.token).then(value => { if (active) setPhone(value.phone ?? ""); }).catch(() => undefined);
    return () => { active = false; };
  }, [session]);
  useEffect(() => {
    if (panel !== "notifications" && panel !== "favourites") return;
    let active = true;
    const scope = session?.userId ?? "guest";
    const load = async () => {
      setBusy(true);
      try {
        if (panel === "notifications") {
          const rows = session ? await buyerApi.notifications(session.token) : [];
          if (active) setUpdates(rows);
        } else {
          const rows: Favourite[] = [
            ...shops.map(shop => ({ id: shop.id, name: shop.name, shop, key: `jpi.favourite.shop.${scope}.${shop.id}` })),
            ...products.map(product => ({ id: product.id, name: product.name, product, key: `jpi.favourite.product.${scope}.${product.productId ?? product.id}` })),
          ];
          const saved = await Promise.all(Array.from(new Map(rows.map(row => [row.key, row])).values(), async row => await storage.getItemAsync(row.key) === "true" ? row : null));
          if (active) setFavourites(saved.filter(row => row !== null));
        }
      } catch { if (active) setError("Couldn’t load right now. Please try again."); }
      finally { if (active) setBusy(false); }
    };
    void load();
    return () => { active = false; };
  }, [panel, products, shops, session, revision]);
  const open = (next: Panel) => { setError(""); setBusy(false); setDraftHindi(hindi); setPanel(next); };
  const close = () => { if (!busy || panel === "notifications" || panel === "favourites") setPanel(null); };
  const run = async (action: () => Promise<void>, failure: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); setPanel(null); }
    catch { setError(failure); }
    finally { setBusy(false); }
  };
  const t = (english: string, translated: string) => hindi ? translated : english;
  const title = t("Account", "खाता");
  const panels = {language:t("Language","भाषा"), notifications:t("Notifications","सूचनाएँ"), favourites:t("Favourites","पसंदीदा"), signout:t("Sign out","साइन आउट")};
  const guarded = (action: () => void) => session ? action : signIn;
  return (
    <View style={s.screen} testID="buyer-account-hub">
      <Header title={title} back={back} />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.hero}>
          <Text style={s.eyebrow}>{t(session ? "YOUR NEIGHBOURHOOD" : "WELCOME TO JUSTPACKIT", "आपका पड़ोस")}</Text>
          <Text style={s.heroTitle}>{session ? `${t("Hello", "नमस्ते")}, ${session.name}.` : t("Your neighbourhood starts here.", "आपका पड़ोस यहीं से शुरू होता है।")}</Text>
          <Text style={s.heroCopy}>{session ? [phone, area].filter(Boolean).join(" · ") : t("Browse freely. Sign in when you're ready to order.", "खरीदारी देखें। ऑर्डर देने के लिए साइन इन करें।")}</Text>
          {!session && <Action label={t("Sign in / Create account", "साइन इन / खाता बनाएँ")} onPress={signIn} soft />}
        </View>
        <View style={s.grid}>
          <Tile icon="home" title={t("Saved Addresses", "सहेजे गए पते")} copy={session ? t("Manage delivery addresses", "डिलीवरी पते प्रबंधित करें") : t("Sign in to save delivery addresses", "पते सहेजने के लिए साइन इन करें")} onPress={() => guarded(addresses)} />
          <Tile icon="orders" title={t("Orders", "ऑर्डर")} copy={session ? t("Track your orders", "ऑर्डर ट्रैक करें") : t("Sign in to view your orders", "ऑर्डर देखने के लिए साइन इन करें")} onPress={orders} />
        </View>
        <Text style={s.section}>{t("ACCOUNT & PREFERENCES", "आपकी सेटिंग्स")}</Text>
        <View style={s.card}>
          <Row icon="account" title={t("Profile", "प्रोफ़ाइल")} copy={session ? t("Your personal details", "आपकी निजी जानकारी") : t("Sign in to manage your profile", "प्रोफ़ाइल के लिए साइन इन करें")} onPress={() => guarded(profile)} />
          <Row icon="heart" title={panels.favourites} copy={t("Saved on this device", "इस डिवाइस पर सहेजे गए")} onPress={() => open("favourites")} />
          <Row icon="language" title={panels.language} copy={hindi ? "हिन्दी" : "English"} onPress={() => open("language")} />
          <Row icon="bell" title={panels.notifications} copy={t("Order updates", "ऑर्डर के अपडेट")} onPress={() => open("notifications")} />
        </View>
        <Action label={t("Seller access", "विक्रेता खाता")} onPress={seller} soft />
        {session && <Action label={panels.signout} onPress={() => open("signout")} soft />}
      </ScrollView>
      {panel && <Modal visible animationType="slide" onRequestClose={close}>
        <SafeAreaView style={s.screen}>
          <Header title={panels[panel]} back={close} />
          <ScrollView contentContainerStyle={s.content}>
            {error && (panel === "signout" ? <BuyerStateCard title="Couldn’t sign you out" copy={error} tone="error" compact icon="network" action="Try sign out again" onAction={() => void run(signOut,"Couldn’t sign out. Check your connection and try again.")} /> : <BuyerAuthNotice title="Try again" copy={error} warning />)}
            {panel === "language" && <>
              <BuyerAuthNotice title={t("Shop in your language.", "अपनी भाषा में खरीदारी करें।")} copy={t("Choose the language for Account labels. Shop and product names stay as entered.", "खाते के लेबल की भाषा चुनें। दुकान और उत्पाद के नाम वैसे ही रहेंगे।")} />
              {[false,true].map(value => <Pressable key={String(value)} accessibilityRole="radio" accessibilityState={{checked:draftHindi === value}} aria-checked={draftHindi === value} onPress={() => setDraftHindi(value)} style={[s.card, draftHindi === value && s.selected]}><Text style={s.panelTitle}>{draftHindi === value ? "◉" : "○"} {value ? "हिन्दी" : "English"}</Text></Pressable>)}
              <Action label={draftHindi ? "Apply Hindi" : "Apply English"} disabled={busy} onPress={() => void run(async () => { await storage.setItemAsync(languageKey,draftHindi ? "hi" : "en"); setHindi(draftHindi); }, "Couldn’t save the language preference.")} />
            </>}
            {panel === "notifications" && <>
              {!!updates.length && !busy && <BuyerAuthNotice title="Good news from nearby." copy="Order updates appear here." />}
              {busy ? <ActivityIndicator color={theme.accentInk} /> : error ? <Action label="Retry notifications" onPress={() => { setError(""); setRevision(value => value+1); }} /> : updates.length ? updates.map(item => <View key={item.id} style={[s.card,!item.read && s.unread]}><Text style={s.panelTitle}>{!item.read ? "● " : ""}{item.title}</Text><Text style={s.copy}>{item.body}</Text></View>) : <BuyerStateCard title={session ? "You’re all caught up." : "No updates yet."} copy={session ? "Order updates will appear here, from accepted to delivered." : "Sign in to see your order updates."} icon="bell" action={session ? "Continue shopping" : "Sign in"} onAction={() => { setPanel(null); if (session) browse(); else signIn(); }} />}
            </>}
            {panel === "favourites" && <>
              {!!favourites.length && <BuyerAuthNotice title="Your local favourites." copy="Saved on this device. Showing favourites available in your current area." />}
              <View style={s.grid}>{(["products","shops"] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:tab === value}} onPress={() => setTab(value)} style={[s.tile,tab === value && s.selected]}><Text style={s.panelTitle}>{value === "products" ? "Products" : "Shops"}</Text></Pressable>)}</View>
              {busy ? <ActivityIndicator color={theme.accentInk} /> : error ? <Action label="Retry favourites" onPress={() => { setError(""); setRevision(value => value+1); }} /> : <>
                {favourites.filter(row => tab === "products" ? row.product : row.shop).map(row => <View key={row.key} style={s.card}>
                  {row.product?.image ? <Image accessibilityIgnoresInvertColors source={{uri: row.product.image}} style={s.favouritePhoto} resizeMode="cover" /> : null}
                  <Text style={s.panelTitle}>{row.name}</Text>
                  {row.product && <Text style={s.copy}>{row.product.unit}</Text>}
                  {row.shop && <Text style={s.copy}>{[row.shop.isOpen ? "Open" : "Closed", row.shop.distanceKm != null ? `${row.shop.distanceKm} km` : "", row.shop.rating != null ? `★ ${row.shop.rating}` : ""].filter(Boolean).join(" · ")}</Text>}
                  {row.shop && <Action label="View shop" soft onPress={() => { setPanel(null); openShop(row.shop!); }} />}
                  {row.product && !row.product.variants?.length && <Action label={row.product.stock > 0 ? `+ Add · ₹${row.product.price}` : "Unavailable"} disabled={row.product.stock <= 0} soft onPress={() => add(row.product!)} />}
                  <Pressable accessibilityRole="button" onPress={() => void storage.deleteItemAsync(row.key).then(() => setFavourites(rows => rows.filter(item => item.key !== row.key))).catch(() => setError("Couldn’t remove this favourite."))}><Text style={s.copy}>Remove favourite</Text></Pressable>
                </View>)}
                {!favourites.some(row => tab === "products" ? row.product : row.shop) && <BuyerStateCard title="Keep your favourites close." copy="Tap the heart on a product or shop to save it on this device." icon="heart" action="Discover favourites" onAction={() => { setPanel(null); browse(); }} />}
              </>}
            </>}
            {panel === "signout" && <>
              <Text style={s.panelTitle}>See you around?</Text>
              <View style={s.card}>
                <Text style={s.panelTitle}>Sign out of JustPackIt?</Text>
                <Text style={s.copy}>Your device favourites stay saved. Sign in again to see your orders and addresses.</Text>
                <Action label="Keep shopping" disabled={busy} onPress={close} />
                <Action label={busy ? "Signing out…" : error ? "Try sign out again" : "Sign out"} soft disabled={busy} onPress={() => void run(signOut,"Couldn’t sign out. Check your connection and try again.")} />
              </View>
            </>}
          </ScrollView>
        </SafeAreaView>
      </Modal>}
    </View>
  );
}

function Header({title,back}:{title:string;back:()=>void}) {
  return <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} onPress={back}><Text style={s.chevron}>‹</Text></Pressable><Text accessibilityRole="header" style={s.panelTitle}>{title}</Text></View>;
}
function Action({label,onPress,soft,disabled}:{label:string;onPress:()=>void;soft?:boolean;disabled?:boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button,soft && s.selected,disabled && {opacity:.5}]}><Text style={[s.buttonText,soft && s.softText]}>{label}</Text></Pressable>;
}
function Tile({icon,title,copy,onPress}:{icon:MarketIconName;title:string;copy:string;onPress:()=>void}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={s.tile}><View style={s.icon}><MarketIcon name={icon} /></View><Text style={s.rowTitle}>{title}</Text><Text style={s.copy}>{copy}</Text></Pressable>;
}
function Row({icon,title,copy,onPress}:{icon:MarketIconName | "heart" | "language";title:string;copy:string;onPress:()=>void}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={s.row}><View style={s.icon}>{icon === "heart" || icon === "language" ? <Text style={s.panelTitle}>{icon === "heart" ? "♡" : "Aa"}</Text> : <MarketIcon name={icon} />}</View><View style={s.rowText}><Text style={s.rowTitle}>{title}</Text><Text style={s.copy}>{copy}</Text></View><Text style={s.panelTitle}>›</Text></Pressable>;
}
const s = themedStyles(() => StyleSheet.create({
  screen:{flex:1,backgroundColor:theme.canvas}, header:{height:64,paddingHorizontal:20,flexDirection:"row",alignItems:"center",gap:16}, chevron:{fontSize:29,color:theme.accentInk},
  content:{padding:20,gap:16,width:"100%",maxWidth:600,alignSelf:"center"},
  hero:{backgroundColor:theme.hero,borderRadius:24,padding:20,gap:10}, eyebrow:{color:theme.accentInk,fontSize:11}, heroTitle:{color:theme.ink,fontSize:28,lineHeight:36,fontWeight:"600"}, heroCopy:{color:theme.secondary,fontSize:14,lineHeight:20},
  grid:{flexDirection:"row",gap:12}, tile:{flex:1,minWidth:0,borderWidth:1,borderColor:theme.border,backgroundColor:theme.surface,borderRadius:20,padding:16,gap:10},
  section:{color:theme.accentInk,fontSize:11}, card:{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border,borderRadius:20,padding:16,gap:12}, selected:{backgroundColor:theme.selected}, unread:{borderColor:theme.accentInk},
  favouritePhoto:{width:"100%",aspectRatio:2.6,borderRadius:12,backgroundColor:theme.selected},
  row:{flexDirection:"row",minHeight:54,alignItems:"center",gap:12}, rowText:{flex:1,gap:3}, icon:{backgroundColor:theme.selected,width:40,height:40,borderRadius:11,alignItems:"center",justifyContent:"center"},
  rowTitle:{color:theme.ink,fontSize:15,fontWeight:"600"}, panelTitle:{color:theme.accentInk,fontSize:18,fontWeight:"600"}, copy:{color:theme.muted,fontSize:13,lineHeight:18},
  button:{backgroundColor:theme.primary,borderRadius:12,minHeight:48,alignItems:"center",justifyContent:"center",padding:12}, buttonText:{color:theme.onPrimary,fontWeight:"600",textAlign:"center"}, softText:{color:theme.accentInk},
}));
