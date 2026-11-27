import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { adminApi, type AdminSupportCase, type SupportStatus } from "./adminApi";
import { LoadState, MutationFeedback, Row, SellerButton, SellerCard, SellerField, SellerScroll, styles, useSellerMutation, useSellerPages } from "./SellerWorkspaceUI";

const labels = { open:"Open", in_progress:"In progress", resolved:"Resolved" } as const;

export function AdminSupport({token}:{token:string}) {
  const [status,setStatus]=useState<SupportStatus>("open");
  return <SupportList key={status} token={token} status={status} selectStatus={setStatus} />;
}

function SupportList({token,status,selectStatus}:{token:string;status:SupportStatus;selectStatus:(value:SupportStatus)=>void}) {
  const list=useSellerPages((auth,cursor)=>adminApi.support(auth,status,cursor),token);
  const [selected,setSelected]=useState<AdminSupportCase>();
  const [notice,setNotice]=useState("");
  const refreshList=()=>{setSelected(undefined);list.reload();};

  if(selected)return <SupportDetails token={token} ticket={selected} back={()=>setSelected(undefined)} refresh={refreshList}
    saved={value=>{
      setNotice(`Case marked ${labels[value].toLowerCase()}.`);
      list.setData(previous=>previous && {...previous,items:previous.items.filter(ticket=>ticket.id!==selected.id)});
      refreshList();
    }} />;

  return <SellerScroll refreshing={list.loading && !!list.data} onRefresh={list.reload}>
    <Text accessibilityRole="header" style={styles.section}>Order support</Text>
    <View accessibilityRole="tablist" style={styles.orderTop}>
      {(Object.keys(labels) as SupportStatus[]).map(value=><Pressable key={value} accessibilityRole="tab"
        accessibilityState={{selected:status===value}} onPress={()=>selectStatus(value)} style={[styles.tap,status===value && styles.sage]}>
        <Text style={styles.link}>{labels[value]}</Text>
      </Pressable>)}
    </View>
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.label}>{notice}</Text>}
    <LoadState loading={list.loading && !list.data} error={list.error} retry={list.reload} />
    {list.data && <SellerCard>
      {!list.data.items.length && <Text style={styles.copy}>No cases in this queue.</Text>}
      {list.data.items.map(ticket=><Row key={ticket.id} title={ticket.shopName} detail={ticket.kind.replaceAll("_"," ")} onPress={()=>{setNotice("");setSelected(ticket);}} />)}
      {!!list.data.next && <SellerButton label={list.moreBusy ? "Loading…" : "Load more cases"} onPress={list.more} disabled={list.moreBusy || list.loading} soft />}
    </SellerCard>}
  </SellerScroll>;
}

function SupportDetails({token,ticket,back,refresh,saved}:{
  token:string;ticket:AdminSupportCase;back:()=>void;refresh:()=>void;saved:(value:SupportStatus)=>void;
}) {
  const history=useSellerPages((auth,cursor)=>adminApi.supportMessages(auth,ticket.id,cursor),token);
  const mutation=useSellerMutation();
  const [decision,setDecision]=useState<Exclude<SupportStatus,"open">>();
  const [note,setNote]=useState("");
  return <SellerScroll>
    <SellerButton label="Back to support cases" onPress={back} disabled={mutation.busy} soft />
    <SellerCard>
      <Text accessibilityRole="header" style={styles.section}>{ticket.shopName}</Text>
      <Text style={styles.label}>{labels[ticket.status]} · {ticket.kind.replaceAll("_"," ")}</Text>
      <Text selectable style={styles.copy}>Order #{ticket.orderId}</Text>
      <Text style={styles.copy}>{ticket.description}</Text>
      {!!ticket.note && <Text style={styles.copy}>Latest update · {ticket.note}</Text>}
    </SellerCard>
    <SellerCard>
      <Text accessibilityRole="header" style={styles.section}>Conversation</Text>
      <LoadState loading={history.loading && !history.data} error={history.error} retry={history.reload} />
      {history.data?.items.length===0 && <Text style={styles.copy}>No messages yet.</Text>}
      {history.data?.items.map(message=><View key={message.id} style={styles.workGroup}>
        <Text style={styles.label}>{message.role==="admin" ? "Support" : "Buyer"}</Text>
        <Text style={styles.copy}>{message.body}</Text>
      </View>)}
      {!!history.data?.next && <SellerButton label="Load more messages" onPress={history.more} disabled={history.moreBusy || history.loading} soft />}
    </SellerCard>
    {ticket.status!=="resolved" && <SellerCard>
      <Text accessibilityRole="header" style={styles.section}>Update case</Text>
      <MutationFeedback error={mutation.error} onReload={refresh} />
      {decision ? <>
        <SellerField label="Note visible to buyer" value={note} onChangeText={setNote} multiline maxLength={2000} editable={!mutation.busy} />
        <SellerButton label={mutation.busy ? "Saving…" : `Confirm ${labels[decision].toLowerCase()}`} disabled={mutation.busy || note.trim().length<3}
          onPress={()=>void mutation.run(async()=>{await adminApi.updateSupport(token,ticket,decision,note.trim());saved(decision);})} />
        <SellerButton label="Cancel update" onPress={()=>{setDecision(undefined);mutation.clear();}} disabled={mutation.busy} soft />
      </> : <>
        {ticket.status==="open" && <SellerButton label="Mark in progress" onPress={()=>setDecision("in_progress")} soft />}
        <SellerButton label="Resolve case" onPress={()=>setDecision("resolved")} />
      </>}
    </SellerCard>}
  </SellerScroll>;
}
