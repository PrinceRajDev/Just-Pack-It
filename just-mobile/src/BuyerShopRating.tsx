import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { buyerApi, type BuyerOrder } from "./api";
import { theme, themedStyles } from "./theme";

type Rating = NonNullable<BuyerOrder["subOrders"][number]["buyerRating"]>;

export function BuyerShopRating({token,orderId,shopId,rating}: {
  token:string; orderId:string; shopId:string; rating?:Rating;
}) {
  const [stars,setStars]=useState(0);
  const [feedback,setFeedback]=useState("");
  const [saved,setSaved]=useState<Rating>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const pending=useRef(false);
  const submitted=rating ?? saved;
  const submit=async()=>{
    if(!stars || pending.current)return;
    pending.current=true;
    setBusy(true);
    setError("");
    try {setSaved(await buyerApi.rateShop(token,orderId,shopId,{stars,feedback:feedback.trim()}));}
    catch {setError("Couldn’t save your rating. Try again.");}
    finally {pending.current=false;setBusy(false);}
  };
  return <View style={s.block}>
    <Text accessibilityRole="header" style={s.title}>{submitted ? "Your rating" : "Rate this shop"}</Text>
    {submitted ? <>
      <Text accessibilityLiveRegion="polite" style={s.copy}>{submitted.stars} out of 5 stars · Rating saved</Text>
      {!!submitted.feedback && <Text style={s.copy}>{submitted.feedback}</Text>}
    </> : <>
      <View accessibilityRole="radiogroup" style={s.stars}>
        {[1,2,3,4,5].map(value=><Pressable key={value} accessibilityRole="radio" accessibilityLabel={value===1 ? "1 star" : `${value} stars`} accessibilityState={{checked:stars===value}} disabled={busy} onPress={()=>setStars(value)} style={[s.star,stars===value && s.selected]}>
          <Text style={s.symbol}>{stars>=value ? "★" : "☆"}</Text>
        </Pressable>)}
      </View>
      <TextInput accessibilityLabel="Optional shop feedback" placeholder="Optional feedback" placeholderTextColor={theme.ink} multiline maxLength={500} editable={!busy} value={feedback} onChangeText={setFeedback} style={s.input} />
      <Text style={s.copy}>The shop can read your feedback. Leave out your name and contact details.</Text>
      {!!error && <Text accessibilityRole="alert" style={s.copy}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy || !stars} onPress={()=>void submit()} style={[s.action,(busy || !stars) && s.disabled]}>
        <Text style={s.title}>{busy ? "Saving rating…" : "Submit rating"}</Text>
      </Pressable>
    </>}
  </View>;
}

const s=themedStyles(()=>StyleSheet.create({
  block:{gap:8,borderTopWidth:1,borderColor:theme.border,paddingTop:12},
  title:{fontWeight:"700",color:theme.accentInk},
  copy:{color:theme.ink},
  stars:{flexDirection:"row",gap:6},
  star:{minHeight:44,minWidth:44,alignItems:"center",justifyContent:"center",borderRadius:10},
  selected:{backgroundColor:theme.selected},
  symbol:{fontSize:24,color:theme.accentInk},
  input:{minHeight:56,padding:10,color:theme.ink,borderColor:theme.border,borderWidth:1,borderRadius:12,textAlignVertical:"top"},
  action:{minHeight:44,borderRadius:12,alignItems:"center",justifyContent:"center",backgroundColor:theme.selected},
  disabled:{opacity:.55},
}));
