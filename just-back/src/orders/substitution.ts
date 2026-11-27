import {z} from "zod";
import type {Actor} from "../auth/middleware.js";
import {Product,Shop} from "../catalogue/models.js";
import {deriveProduct,transaction} from "../catalogue/service.js";
import {fail} from "../common/errors.js";
import {InventoryReservation} from "../inventory/models.js";
import {notify} from "../notifications/service.js";
import {Order,type OrderLineRecord} from "./models.js";

const version=z.number().int().nonnegative();
export const proposalInput=z.object({version,line:z.number().int().nonnegative(),replacementId:z.uuid().optional()}).strict();
export const decisionInput=z.object({version,decision:z.enum(["replace","remove"])}).strict();

export async function changeSubstitution(who:Actor,orderId:string,subId:string,input:z.infer<typeof proposalInput>|z.infer<typeof decisionInput>){
  const proposing="line" in input;
  if(who.role!==(proposing?"seller":"buyer"))fail(403,"FORBIDDEN","Wrong account for this action");
  await transaction(async session=>{
    const sellerShop=proposing ? await Shop.findOne({ownerId:who.id}).session(session) : null;
    if(proposing && !sellerShop)fail(404,"NOT_FOUND","Order not found");
    const order=await Order.findOne({_id:orderId,...(proposing?{}:{buyerId:who.id})}).session(session);
    const sub=order?.subOrders.find(row=>row._id===subId && (!proposing || row.shopId===sellerShop?._id));
    if(!order || !sub)fail(404,"NOT_FOUND","Order not found");
    if(order.paymentMethod!=="cod" || order.testMode || sub.status!=="preparing" || sub.delivery || sub.receipt || sub.cashCollection)
      fail(409,"SUBSTITUTION_UNAVAILABLE","Changes are only available while a COD order is being packed.");
    if((sub.version??0)!==input.version)fail(409,"VERSION_CONFLICT","Refresh the order and try again.");
    const replacementFor=async (id:string,original:OrderLineRecord)=>{
      if(sub.lines.some(row=>row.productId===id))fail(409,"REPLACEMENT_UNAVAILABLE","Choose an item that isn't already in this shop order.");
      const product=await Product.findOne({_id:id,shopId:sub.shopId,active:true,"moderation.blocked":{$ne:true}}).session(session);
      if(!product || product.variants.some(option=>option.active) || product.priceCents!==original.priceCents || product.stock<original.qty)
        fail(409,"REPLACEMENT_UNAVAILABLE","The replacement needs enough stock, no pack options and the same unit price.");
      return product;
    };
    let notice:string;
    if("line" in input){
      const original=sub.lines[input.line];
      if(!original || sub.substitution)fail(409,"SUBSTITUTION_UNAVAILABLE","Only one item change is available per shop order.");
      const candidate=input.replacementId ? await replacementFor(input.replacementId,original) : undefined;
      sub.substitution={state:"pending",original:{productId:original.productId,variantId:original.variantId,variantLabel:original.variantLabel,name:original.name,unit:original.unit,qty:original.qty,priceCents:original.priceCents},...(candidate?{
        replacement:{productId:candidate._id,name:candidate.name,unit:candidate.unit,qty:original.qty,priceCents:candidate.priceCents}
      }:{})};
      notice="Review an item change proposed by your shop.";
    }else{
      const proposal=sub.substitution;
      if(proposal?.state!=="pending")fail(409,"SUBSTITUTION_UNAVAILABLE","There is no pending item change.");
      const original=proposal.original;
      const same=(line:{productId:string;variantId?:string;qty:number;priceCents:number})=>
        line.productId===original.productId && (line.variantId??null)===(original.variantId??null) && line.qty===original.qty && line.priceCents===original.priceCents;
      const index=sub.lines.findIndex(same);
      const hold=await InventoryReservation.findOne({_id:order.reservationId,orderId,buyerId:who.id,state:"committed"}).session(session);
      const held=hold?.lines.findIndex(row=>row.shopId===sub.shopId && same(row)) ?? -1;
      if(index<0 || !hold || held<0)fail(409,"INVENTORY_INVARIANT","Order inventory needs reconciliation.");
      if(input.decision==="replace"){
        if(!proposal.replacement)fail(409,"REPLACEMENT_UNAVAILABLE","This proposal only offers removal.");
        const replacement=await replacementFor(proposal.replacement.productId,original);
        if(replacement.name!==proposal.replacement.name || replacement.unit!==proposal.replacement.unit)
          fail(409,"REPLACEMENT_UNAVAILABLE","The replacement changed. You can remove the original item instead.");
        replacement.stock-=original.qty;
        deriveProduct(replacement);
        await replacement.save({session});
        sub.lines.splice(index,1,proposal.replacement);
        hold.lines.splice(held,1,{productId:replacement._id,shopId:sub.shopId,qty:original.qty,priceCents:original.priceCents});
        proposal.state="replaced";
      }else{
        sub.lines.splice(index,1);
        hold.lines.splice(held,1);
        sub.itemsSubtotalCents-=original.priceCents*original.qty;
        proposal.state="removed";
        if(!sub.lines.length){
          sub.status="cancelled";
          sub.cancelReason="Buyer approved removal of the last item.";
        }
      }
      // The original was reported unavailable, so it is never returned to sellable inventory.
      await hold.save({session});
      notice="The buyer responded to your proposed item change.";
    }
    sub.version=input.version+1;
    sub.updatedAt=new Date();
    order.markModified("subOrders");
    await order.save({session});
    const recipient=proposing ? order.buyerId : (await Shop.findById(sub.shopId).session(session))?.ownerId;
    if(recipient)await notify(`${subId}:substitution:${sub.version}`,{userId:recipient},"Order item update",notice,proposing?`/orders/${orderId}`:"/seller/orders",session);
  });
}
