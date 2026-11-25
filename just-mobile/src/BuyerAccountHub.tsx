import { cardShadow, theme, themedStyles } from "./theme";
import { BuyerStateCard } from "./BuyerStateCard";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { buyerApi, type Product, type Session, type Shop } from "./api";
import { BuyerAuthNotice } from "./BuyerAuthNotice";
import { MarketIcon, type MarketIconName } from "./MarketIcon";
import { resolveImage } from "./images";
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
  const readLock = useRef(false);
  const [markingRead, setMarkingRead] = useState<string>();
  const [readFailed, setReadFailed] = useState<string>();
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
  const markRead = async (id: string) => {
    if (!session || readLock.current) return;
    readLock.current = true;
    setMarkingRead(id);
    setReadFailed(undefined);
    try {
      await buyerApi.markNotificationRead(session.token, id);
      setUpdates(items => items.map(item => item.id === id ? {...item, read: true} : item));
    } catch {
      setReadFailed(id);
    } finally {
      readLock.current = false;
      setMarkingRead(undefined);
    }
  };
  const title = t("Account", "खाता");
  const panels = {language:t("Language","भाषा"), notifications:t("Notifications","सूचनाएँ"), favourites:t("Favourites","पसंदीदा"), signout:t("Sign out","साइन आउट")};
  const guarded = (action: () => void) => session ? action : signIn;
  return (
    <View style={s.screen} testID="buyer-account-hub">
      <Header title={title} back={back} />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.hero}>
          <View style={s.heroTop}>
            <View style={s.rowText}>
              <Text style={s.eyebrow}>{session ? t("Your account", "आपका खाता") : "JustPackIt"}</Text>
              <Text style={s.heroTitle}>{session ? session.name : t("Your neighbourhood starts here.", "आपका पड़ोस यहीं से शुरू होता है।")}</Text>
              {(!session || phone || area) && <Text style={s.heroCopy}>{session ? [phone, area].filter(Boolean).join(" · ") : t("Sign in to track orders and save delivery addresses.", "ऑर्डर ट्रैक करने और पते सहेजने के लिए साइन इन करें।")}</Text>}
            </View>
            {session ? <View style={s.avatar}><MarketIcon name="account" /></View> : (
              <Image source={require("../assets/startup-parcel.jpg")} style={s.heroArt} accessible={false} />
            )}
          </View>
          {!session && <Action label={t("Sign in / Create account", "साइन इन / खाता बनाएँ")} onPress={signIn} />}
        </View>
        <View style={s.grid}>
          <Tile icon="location" title={t("Saved Addresses", "सहेजे गए पते")} copy={session ? t("Manage delivery addresses", "डिलीवरी पते प्रबंधित करें") : t("Sign in to save delivery addresses", "पते सहेजने के लिए साइन इन करें")} onPress={guarded(addresses)} />
          <Tile icon="orders" title={t("Orders", "ऑर्डर")} copy={session ? t("Track your orders", "ऑर्डर ट्रैक करें") : t("Sign in to view your orders", "ऑर्डर देखने के लिए साइन इन करें")} onPress={orders} />
        </View>
        <Text accessibilityRole="header" style={s.section}>{t("Account & preferences", "आपकी सेटिंग्स")}</Text>
        <View style={s.menu}>
          <Row icon="account" title={t("Profile", "प्रोफ़ाइल")} copy={session ? t("Your personal details", "आपकी निजी जानकारी") : t("Sign in to manage your profile", "प्रोफ़ाइल के लिए साइन इन करें")} onPress={guarded(profile)} />
          <Row icon="heart" title={panels.favourites} copy={t("Saved on this device", "इस डिवाइस पर सहेजे गए")} onPress={() => open("favourites")} />
          <Row icon="language" title={panels.language} copy={hindi ? "हिन्दी" : "English"} onPress={() => open("language")} />
          <Row icon="bell" title={panels.notifications} copy={t("Order updates", "ऑर्डर के अपडेट")} onPress={() => open("notifications")} />
        </View>
        <View style={s.menu}>
          <Row icon="store" title={t("Seller access", "विक्रेता खाता")} copy={t("Sign in or set up your shop", "साइन इन करें या अपनी दुकान जोड़ें")} onPress={seller} />
        </View>
        {session && <Action label={panels.signout} onPress={() => open("signout")} danger />}
      </ScrollView>
      {panel && <Modal visible animationType="slide" onRequestClose={close}>
        <SafeAreaView style={s.screen}>
          <Header title={panels[panel]} back={close} />
          <ScrollView contentContainerStyle={s.content}>
            {error && panel !== "notifications" && (panel === "signout" ? <BuyerStateCard title="Couldn’t sign you out" copy={error} tone="error" compact icon="network" /> : <BuyerAuthNotice title="Try again" copy={error} warning />)}
            {panel === "language" && <>
              <View style={[s.hero,s.heroTop]}>
                <View style={s.avatar}><MarketIcon name="globe" /></View>
                <View style={s.rowText}>
                  <Text accessibilityRole="header" style={s.heroTitle}>{t("App language", "ऐप की भाषा")}</Text>
                  <Text style={s.heroCopy}>{t("Choose how app labels appear. Shop and product names stay as entered.", "ऐप के लेबल की भाषा चुनें। दुकान और उत्पाद के नाम वैसे ही रहेंगे।")}</Text>
                </View>
              </View>
              {[false,true].map(value => {
                const checked = draftHindi === value;
                return <Pressable key={String(value)} accessibilityRole="radio" accessibilityLabel={value ? "हिन्दी" : "English"} accessibilityState={{checked, disabled: busy}} aria-checked={checked} disabled={busy} onPress={() => setDraftHindi(value)} style={[s.card,s.inlineCard,checked && s.languageSelected]}>
                  <View style={s.icon}><Text style={s.panelTitle}>{value ? "अ" : "Aa"}</Text></View>
                  <View style={s.rowText}>
                    <Text style={s.rowTitle}>{value ? "हिन्दी" : "English"}</Text>
                    {hindi === value && <Text style={s.copy}>{t("Current language", "मौजूदा भाषा")}</Text>}
                  </View>
                  <View style={[s.radio, checked && s.radioChecked]}>{checked && <View style={s.radioDot} />}</View>
                </Pressable>;
              })}
              <Action label={busy ? t("Saving…", "सहेज रहे हैं…") : draftHindi ? t("Apply Hindi", "हिन्दी लागू करें") : t("Apply English", "अंग्रेज़ी लागू करें")} disabled={busy || draftHindi === hindi} onPress={() => void run(async () => { await storage.setItemAsync(languageKey,draftHindi ? "hi" : "en"); setHindi(draftHindi); }, "Couldn’t save the language preference.")} />
            </>}
            {panel === "notifications" && <>
              {busy ? <View style={[s.card,s.inlineCard]} accessibilityLiveRegion="polite">
                <ActivityIndicator color={theme.accentInk} />
                <Text style={s.rowTitle}>{t("Loading order updates…", "ऑर्डर अपडेट लोड हो रहे हैं…")}</Text>
              </View> : error ? <BuyerStateCard title="Couldn’t load notifications" copy={error} tone="error" icon="network" action="Retry notifications" onAction={() => { setError(""); setRevision(value => value+1); }} /> : updates.length ? <>
                <Text accessibilityRole="header" style={s.section}>{t("Order updates", "ऑर्डर के अपडेट")}</Text>
                {updates.map(item => {
                  const timestamp = item.createdAt ? Date.parse(item.createdAt) : NaN;
                  return <View key={item.id} style={[s.card,s.notification,!item.read && s.unread]}>
                  <View style={s.icon}><MarketIcon name="bell" /></View>
                  <View style={s.rowText}>
                    {!item.read && <Text style={s.notificationBadge}>{t("Unread", "अपठित")}</Text>}
                    <Text style={s.rowTitle}>{item.title}</Text>
                    <Text style={s.copy}>{item.body}</Text>
                    {Number.isFinite(timestamp) && <Text style={s.copy}>{new Date(timestamp).toLocaleString(hindi ? "hi-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short" })}</Text>}
                    {readFailed === item.id && !item.read && <Text accessibilityRole="alert" style={s.dangerText}>{t("Couldn’t mark as read. Try again.", "पढ़ा हुआ मार्क नहीं कर सके। फिर से कोशिश करें।")}</Text>}
                    {!item.read && <Action soft disabled={!!markingRead} label={markingRead === item.id ? t("Marking as read…", "पढ़ा हुआ मार्क कर रहे हैं…") : t("Mark as read", "पढ़ा हुआ मार्क करें")} onPress={() => void markRead(item.id)} />}
                  </View>
                  </View>;
                })}
              </> : <BuyerStateCard title={session ? "You’re all caught up." : "No updates yet."} copy={session ? "Order updates will appear here, from accepted to delivered." : "Sign in to see your order updates."} icon="bell" action={session ? "Continue shopping" : "Sign in"} onAction={() => { setPanel(null); if (session) browse(); else signIn(); }} />}
            </>}
            {panel === "favourites" && <>
              <View style={[s.hero,s.heroTop]}>
                <View style={s.avatar}><MarketIcon name="heart" /></View>
                <View style={s.rowText}>
                  <Text accessibilityRole="header" style={s.heroTitle}>{t("Saved nearby", "आस-पास के पसंदीदा")}</Text>
                  <Text style={s.heroCopy}>{t("Favourites available in your current area.", "आपके मौजूदा इलाके में उपलब्ध पसंदीदा।")}</Text>
                </View>
              </View>
              <View accessibilityRole="tablist" style={s.favouriteTabs}>{(["products","shops"] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:tab === value}} onPress={() => setTab(value)} style={[s.favouriteTab,tab === value && s.selected]}><Text style={tab === value ? s.softText : s.rowTitle}>{value === "products" ? t("Products", "उत्पाद") : t("Shops", "दुकानें")}</Text></Pressable>)}</View>
              {busy ? <ActivityIndicator color={theme.accentInk} /> : error ? <Action label="Retry favourites" onPress={() => { setError(""); setRevision(value => value+1); }} /> : <>
                {favourites.filter(row => tab === "products" ? row.product : row.shop).map(row => {
                  const photo = resolveImage(row.product?.image ?? row.shop?.coverImage);
                  return <View key={row.key} style={s.card}>
                  <FavouritePhoto uri={photo} icon={row.shop ? "store" : "bag"} />
                  <View style={s.favouriteHeading}>
                    <Text style={[s.rowTitle,s.rowText]}>{row.name}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${row.name} from favourites`} style={s.removeFavourite} onPress={() => void storage.deleteItemAsync(row.key).then(() => setFavourites(rows => rows.filter(item => item.key !== row.key))).catch(() => setError("Couldn’t remove this favourite."))}><Text style={s.softText}>{t("Remove", "हटाएँ")}</Text></Pressable>
                  </View>
                  {row.product && <Text style={s.copy}>{row.product.unit}</Text>}
                  {row.shop && <Text style={s.copy}>{[row.shop.isOpen ? "Open" : "Closed", row.shop.distanceKm != null ? `${row.shop.distanceKm} km` : "", row.shop.rating != null ? `★ ${row.shop.rating}` : ""].filter(Boolean).join(" · ")}</Text>}
                  {row.shop && <Action label="View shop" soft onPress={() => { setPanel(null); openShop(row.shop!); }} />}
                  {row.product && !row.product.variants?.length && <Action label={row.product.stock > 0 ? `+ Add · ₹${row.product.price}` : "Unavailable"} disabled={row.product.stock <= 0} soft onPress={() => add(row.product!)} />}
                </View>;
                })}
                {!favourites.some(row => tab === "products" ? row.product : row.shop) && <BuyerStateCard title="Keep your favourites close." copy="Tap the heart on a product or shop to save it on this device." icon="heart" action="Discover favourites" onAction={() => { setPanel(null); browse(); }} />}
              </>}
            </>}
            {panel === "signout" && (
              <View style={[s.card,s.signOutCard]}>
                <View style={s.avatar}><MarketIcon name="account" /></View>
                <Text accessibilityRole="header" style={s.heroTitle}>{t("Sign out of JustPackIt?", "JustPackIt से साइन आउट करें?")}</Text>
                <Text style={s.signOutCopy}>{t("Your favourites stay on this device. Sign in again to access your orders and addresses.", "आपके पसंदीदा इस डिवाइस पर सहेजे रहेंगे। ऑर्डर और पते देखने के लिए फिर से साइन इन करें।")}</Text>
                <Action label={t("Keep shopping", "खरीदारी जारी रखें")} disabled={busy} onPress={close} />
                <Action label={busy ? t("Signing out…", "साइन आउट हो रहा है…") : error ? t("Try sign out again", "फिर से कोशिश करें") : panels.signout} danger disabled={busy} onPress={() => void run(signOut,"Couldn’t sign out. Check your connection and try again.")} />
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>}
    </View>
  );
}

function FavouritePhoto({ uri, icon }: { uri?: string; icon: "store" | "bag" }) {
  const [failedUri, setFailedUri] = useState<string>();
  return uri && uri !== failedUri ? (
    <Image accessible={false} accessibilityIgnoresInvertColors source={{uri}} style={s.favouritePhoto} resizeMode="cover" onError={() => setFailedUri(uri)} />
  ) : (
    <View style={s.favouritePhotoFallback}><MarketIcon name={icon} /></View>
  );
}

function Header({title,back}:{title:string;back:()=>void}) {
  return <View style={s.header}><Pressable style={s.backButton} accessibilityRole="button" accessibilityLabel="Go back" onPress={back}><MarketIcon name="chevron-left" /></Pressable><Text accessibilityRole="header" style={s.headerTitle}>{title}</Text></View>;
}
function Action({label,onPress,soft,danger,disabled}:{label:string;onPress:()=>void;soft?:boolean;danger?:boolean;disabled?:boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button,soft && s.selected,danger && s.dangerButton,(pressed || disabled) && s.pressed]}><Text style={[s.buttonText,soft && s.softText,danger && s.dangerText]}>{label}</Text></Pressable>;
}
function Tile({icon,title,copy,onPress}:{icon:MarketIconName;title:string;copy:string;onPress:()=>void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={copy} onPress={onPress} style={({ pressed }) => [s.tile, pressed && s.selected]}><View style={s.tileTop}><View style={s.icon}><MarketIcon name={icon} /></View><MarketIcon name="chevron-right" /></View><Text style={s.rowTitle}>{title}</Text><Text style={s.copy}>{copy}</Text></Pressable>;
}
function Row({icon,title,copy,onPress}:{icon:MarketIconName | "language";title:string;copy:string;onPress:()=>void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={copy} onPress={onPress} style={({ pressed }) => [s.row, pressed && s.selected]}>
    <View style={s.icon}><MarketIcon name={icon === "language" ? "globe" : icon} /></View>
    <View style={s.rowText}><Text style={s.rowTitle}>{title}</Text><Text style={s.copy}>{copy}</Text></View>
    <MarketIcon name="chevron-right" />
  </Pressable>;
}
const s = themedStyles(() => StyleSheet.create({
  screen:{flex:1,backgroundColor:theme.canvas},
  header:{minHeight:64,paddingHorizontal:20,flexDirection:"row",alignItems:"center",gap:12,width:"100%",maxWidth:600,alignSelf:"center"},
  headerTitle:{color:theme.ink,fontSize:22,fontWeight:"700",flex:1},
  backButton:{width:44,height:44,borderRadius:12,backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border,alignItems:"center",justifyContent:"center"},
  content:{padding:20,paddingTop:8,gap:16,width:"100%",maxWidth:600,alignSelf:"center"},
  hero:{backgroundColor:theme.hero,borderRadius:24,padding:16,gap:16},
  heroTop:{flexDirection:"row",alignItems:"center",gap:12},
  heroArt:{width:96,height:96,borderRadius:16},
  avatar:{width:48,height:48,borderRadius:16,backgroundColor:theme.surface,alignItems:"center",justifyContent:"center"},
  eyebrow:{color:theme.accentInk,fontSize:13,fontWeight:"700"},
  heroTitle:{color:theme.ink,fontSize:24,lineHeight:30,fontWeight:"700"}, heroCopy:{color:theme.ink,fontSize:14,lineHeight:20},
  grid:{flexDirection:"row",gap:12}, tile:{flex:1,minWidth:0,borderWidth:1,borderColor:theme.border,backgroundColor:theme.surface,borderRadius:20,padding:12,gap:8,...cardShadow},
  tileTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  section:{color:theme.ink,fontSize:16,fontWeight:"700"}, card:{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border,borderRadius:20,padding:16,gap:12}, selected:{backgroundColor:theme.selected}, unread:{borderColor:theme.accentInk},
  menu:{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border,borderRadius:20,padding:4,...cardShadow},
  inlineCard:{flexDirection:"row",alignItems:"center",minHeight:72},
  notification:{flexDirection:"row",alignItems:"flex-start"},
  notificationBadge:{alignSelf:"flex-start",color:theme.accentInk,backgroundColor:theme.selected,borderRadius:8,paddingHorizontal:8,paddingVertical:4,fontSize:12,fontWeight:"700"},
  languageSelected:{borderColor:theme.accentInk,backgroundColor:theme.selected},
  radio:{width:20,height:20,borderRadius:10,borderWidth:1.5,borderColor:theme.secondary,alignItems:"center",justifyContent:"center"},
  radioChecked:{borderColor:theme.accentInk},
  radioDot:{width:10,height:10,borderRadius:5,backgroundColor:theme.accentInk},
  favouritePhoto:{width:"100%",aspectRatio:2.6,borderRadius:12,backgroundColor:theme.selected},
  favouritePhotoFallback:{alignSelf:"flex-start",width:44,height:44,borderRadius:12,backgroundColor:theme.selected,alignItems:"center",justifyContent:"center"},
  favouriteTabs:{flexDirection:"row",gap:4,padding:4,borderRadius:16,backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border},
  favouriteTab:{flex:1,minHeight:44,padding:8,borderRadius:12,alignItems:"center",justifyContent:"center"},
  favouriteHeading:{flexDirection:"row",alignItems:"center",gap:12},
  removeFavourite:{minHeight:44,paddingHorizontal:8,justifyContent:"center"},
  signOutCard:{padding:20,gap:16,...cardShadow},
  signOutCopy:{color:theme.ink,fontSize:14,lineHeight:20},
  dangerButton:{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.errorBorder},
  dangerText:{color:theme.error},
  row:{flexDirection:"row",minHeight:60,alignItems:"center",gap:12,padding:8,borderRadius:16}, rowText:{flex:1,minWidth:0,gap:4}, icon:{backgroundColor:theme.selected,width:40,height:40,borderRadius:12,alignItems:"center",justifyContent:"center"},
  rowTitle:{color:theme.ink,fontSize:15,fontWeight:"600"}, panelTitle:{color:theme.accentInk,fontSize:18,fontWeight:"600"}, copy:{color:theme.muted,fontSize:13,lineHeight:18},
  button:{backgroundColor:theme.accentInk,borderRadius:12,minHeight:48,alignItems:"center",justifyContent:"center",padding:12}, buttonText:{color:theme.onPrimary,fontWeight:"700",textAlign:"center"}, softText:{color:theme.accentInk}, pressed:{opacity:0.75},
}));
