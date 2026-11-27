import {useState} from "react";
import {Text} from "react-native";
import {sellerApi,type SellerOrder} from "./sellerApi";
import {LoadState,MutationFeedback,Row,SellerButton,SellerCard,rupees,styles,useSellerMutation,useSellerPages} from "./SellerWorkspaceUI";

export function SellerItemChange({token,order,onSaved}:{token:string;order:SellerOrder;onSaved:()=>void}) {
  const [index,setIndex] = useState<number>();
  const proposal = order.substitution;
  if (proposal) return <SellerCard>
    <Text style={styles.title}>{proposal.state === "pending" ? "Waiting for buyer approval" : proposal.state === "removed" ? "Buyer approved removal" : "Buyer approved replacement"}</Text>
    <Text style={styles.copy}>{proposal.original.name}{proposal.replacement ? ` → ${proposal.replacement.name}` : ""}</Text>
  </SellerCard>;
  if (order.testMode || order.paymentMethod !== "cod" || order.status !== "preparing") return null;
  return <SellerCard>
    <Text style={styles.title}>Item unavailable?</Text>
    <Text style={styles.copy}>Choose one item and ask the buyer to approve a replacement or removal.</Text>
    {index === undefined ? order.lines.map((item,line) =>
      <Row key={line} title={item.name} detail={item.variantLabel ?? item.unit} onPress={() => setIndex(line)} />)
      : <ProposalForm key={index} token={token} order={order} index={index} cancel={() => setIndex(undefined)} onSaved={onSaved} />}
  </SellerCard>;
}

function ProposalForm({token,order,index,cancel,onSaved}:{token:string;order:SellerOrder;index:number;cancel:()=>void;onSaved:()=>void}) {
  const listing = useSellerPages(sellerApi.products,token);
  const mutation = useSellerMutation();
  const [replacement,setReplacement] = useState<string>();
  const item = order.lines[index];
  const eligible = listing.data?.items.filter(product => product.active && !product.variants?.length &&
    product.price === item.price && product.stock >= item.qty && !order.lines.some(line => line.productId === product.id));
  return <>
    <Text style={styles.label}>{item.name} · {rupees(item.price)} each · ×{item.qty}</Text>
    <Text style={styles.copy}>Select a same-price item without pack options, or send a removal request.</Text>
    <LoadState error={listing.error} loading={listing.loading && !listing.data} retry={listing.reload} />
    {eligible?.map(product => <Row key={product.id} title={product.name}
      detail={replacement === product.id ? "Selected" : product.unit} onPress={() => setReplacement(product.id)} />)}
    {listing.data?.next && <SellerButton label="Load more products" soft onPress={listing.more} disabled={listing.moreBusy || mutation.busy} />}
    <MutationFeedback error={mutation.error} />
    <SellerButton label={replacement ? "Send replacement proposal" : "Request item removal"} disabled={mutation.busy} onPress={() => void mutation.run(async () => {
      await sellerApi.proposeItemChange(token,order,index,replacement);
      onSaved();
    })} />
    {replacement && <SellerButton label="Clear replacement" soft disabled={mutation.busy} onPress={() => setReplacement(undefined)} />}
    <SellerButton label="Cancel item change" soft disabled={mutation.busy} onPress={cancel} />
  </>;
}
