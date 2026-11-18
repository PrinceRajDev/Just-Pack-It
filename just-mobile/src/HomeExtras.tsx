import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { buyerApi, marketApi, type Product, type Session } from "./api";
import { MarketIcon } from "./MarketIcon";
export function HomeNotifications({ session }: { session: Session | null }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<
    { id: string; title: string; body: string; read: boolean }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const load = async () => {
    setOpen(true);
    if (!session) return;
    setBusy(true);
    setError(false);
    try {
      setItems(await buyerApi.notifications(session.token));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Pressable
        accessibilityLabel="Notifications"
        onPress={() => void load()}
        style={{ padding: 12 }}
      >
        <MarketIcon name="bell" />
      </Pressable>
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FAF8F1" }}>
          <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={{ color: "#07552F", paddingVertical: 12 }}>
                ← Home
              </Text>
            </Pressable>
            <Text style={{ fontSize: 26, color: "#202820" }}>
              Notifications
            </Text>
            {!session ? (
              <Text>Sign in from Account to see your updates.</Text>
            ) : busy ? (
              <ActivityIndicator color="#07552F" />
            ) : error ? (
              <Pressable onPress={() => void load()}>
                <Text>Could not load updates. Tap to retry.</Text>
              </Pressable>
            ) : items.length ? (
              items.map((item) => (
                <View
                  key={item.id}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    backgroundColor: "#fff",
                    borderWidth: 1,
                    borderColor: "#E5E2D8",
                  }}
                >
                  <Text style={{ fontWeight: "600", color: "#202820" }}>
                    {item.title}
                  </Text>
                  <Text
                    style={{ marginTop: 8, color: "#5E554A", lineHeight: 21 }}
                  >
                    {item.body}
                  </Text>
                </View>
              ))
            ) : (
              <Text>No notifications yet</Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
export function BuyAgain({
  session,
  renderProduct,
  onAdd,
  onAccount,
}: {
  session: Session | null;
  renderProduct: (product: Product) => ReactNode;
  onAdd: (product: Product) => void;
  onAccount: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!session) return;
    let active = true;
    void buyerApi
      .orders(session.token)
      .then(async (orders) => {
        const ids = [
          ...new Set(
            orders.flatMap((order) =>
              order.subOrders
                .filter((shop) => shop.status !== "cancelled")
                .flatMap((shop) => shop.lines.map((line) => line.productId)),
            ),
          ),
        ].slice(0, 6);
        const resolved = await Promise.allSettled(
          ids.map((id) => marketApi.product(id)),
        );
        if (active)
          setProducts(
            resolved.flatMap((result) =>
              result.status === "fulfilled" ? [result.value] : [],
            ),
          );
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setDone(true);
      });
    return () => { active = false; };
  }, [session]);
  const product=products[0];
return <View style={{margin:20,marginTop:28,padding:14,borderRadius:16,backgroundColor:"#EAF0D9"}}>
<View style={{flexDirection:"row",alignItems:"center",gap:10}}><MarketIcon name="bag"/><Text style={{fontSize:18,fontWeight:"600",color:"#07552F",flex:1}}>Buy Again</Text><Pressable onPress={()=>setExpanded(!expanded)} accessibilityLabel="Show recent purchases"><Text style={{fontSize:20,color:"#07552F"}}>→</Text></Pressable></View>
<Text style={{fontSize:11,color:"#687161",marginTop:6}}>Your favourites, one tap away</Text>
{!session?<Pressable onPress={onAccount}><Text style={{fontSize:12,color:"#07552F",marginTop:16}}>Sign in to see your purchases →</Text></Pressable>:!done?<ActivityIndicator color="#07552F" style={{marginTop:16}}/>:product?<View style={{flexDirection:"row",alignItems:"center",gap:10,marginTop:16}}>
<Image source={{uri:product.image}} style={{width:40,height:40,borderRadius:8,backgroundColor:"#FAF8F1"}}/><View style={{flex:1}}><Text numberOfLines={1} style={{fontSize:11,fontWeight:"600"}}>{product.name}</Text><Text style={{fontSize:10,color:"#687161",marginTop:4}}>{product.unit}</Text></View><Text style={{fontSize:12,color:"#07552F",fontWeight:"600"}}>₹{product.price.toLocaleString("en-IN")}</Text><Pressable disabled={product.stock<=0} onPress={()=>product.variants?.length?setExpanded(true):onAdd(product)} style={{padding:8}}><Text style={{fontSize:11,color:"#07552F",fontWeight:"600"}}>{product.stock<=0?"Out":"+ Add"}</Text></Pressable></View>:<Text style={{fontSize:12,lineHeight:18,color:"#687161",marginTop:16}}>{failed?"Purchase history could not load":"Your purchases will appear here"}</Text>}
{expanded?products.map((item)=><View key={item.id} style={{marginTop:12}}>{renderProduct(item)}</View>):null}</View>;
}
