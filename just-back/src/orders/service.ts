import {deliveryFeeCents} from "../common/delivery-fee.js";
import {assertNotOwnShop} from "../catalogue/purchase-policy.js";
import {deliveryAvailable} from "../delivery/coverage.js";
import {pinCoverage} from "../addresses/serviceability.js";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {Order,type OrderRecord,type SubOrderRecord} from "./models.js";
import {Address} from "../addresses/routes.js";
import {Area,Product,Shop} from "../catalogue/models.js";
import {transaction} from "../catalogue/service.js";
import {cartReviewInput} from "../cart/routes.js";
import {InventoryReservation} from "../inventory/models.js";
import {reserveInventory} from "../inventory/service.js";
import type {Actor} from "../auth/middleware.js";
import {fail} from "../common/errors.js";
import {notify} from "../notifications/service.js";
import {fenceSellerPurchase} from "../catalogue/owner-eligibility.js";
export const orderInput=cartReviewInput.safeExtend({addressId:z.uuid(),addressVersion:z.number().int().nonnegative(),paymentMethod:z.literal("cod"),expectedTotal:z.number().finite().nonnegative().max(1e12).refine(value=>Math.abs(value*100-Math.round(value*100))<0.0001),fulfilments:z.array(z.object({shopId:z.uuid(),method:z.enum(["pickup","seller_delivery","platform_delivery"])}).strict()).min(1).max(100)}).superRefine((input,ctx)=>{
  if(new Set(input.fulfilments.map(choice=>choice.shopId)).size!==input.fulfilments.length)ctx.addIssue({code:"custom",path:["fulfilments"],message:"Duplicate shop methods"});
});
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function createCodOrder(who:Actor,key:string,raw:z.infer<typeof orderInput>,method:"cod"|"razorpay"="cod",testMode=false,platformEnabled=false):Promise<{order:OrderRecord;replayed:boolean}>{
  if(who.role!=="buyer")fail(403,"FORBIDDEN","Buyer account required");
  z.string().regex(/^[A-Za-z0-9_-]{16,100}$/).parse(key);
  const input=orderInput.parse(raw),identity=digest(method==="cod" ? [who.id,key] : [who.id,"razorpay",key]);
  const id=`${identity.slice(0,8)}-${identity.slice(8,12)}-4${identity.slice(13,16)}-8${identity.slice(17,20)}-${identity.slice(20,32)}`;
  const items=[...input.items].sort((a,b)=>`${a.productId}:${a.variantId ?? ""}`.localeCompare(`${b.productId}:${b.variantId ?? ""}`));
  const fulfilments=[...input.fulfilments].sort((a,b)=>a.shopId.localeCompare(b.shopId));
  const fingerprint=digest([input.areaId,input.addressId,input.addressVersion,method,Math.round(input.expectedTotal*100),items.map(item=>[item.productId,item.variantId ?? null,item.qty]),fulfilments.map(choice=>[choice.shopId,choice.method])]);
  const replay=(order:OrderRecord)=>{if(order.fingerprint!==fingerprint)fail(409,"IDEMPOTENCY_CONFLICT","This request key belongs to a different order attempt");return {order,replayed:true};};
  try {return await transaction(async session=>{
    const previous=await Order.findOne({_id:id,buyerId:who.id}).session(session).lean();if(previous)return replay(previous);
    const address=await Address.findOneAndUpdate({_id:input.addressId,userId:who.id,version:input.addressVersion},{$inc:{revision:1}},{session,returnDocument:"after"});
    if(!address){if(await Address.exists({_id:input.addressId,userId:who.id}).session(session))fail(409,"ADDRESS_CHANGED","Reload your saved address");fail(404,"NOT_FOUND","Address not found");}
    const area=await Area.findOneAndUpdate({_id:input.areaId,active:true},{$inc:{revision:1}},{session,returnDocument:"after"});if(!area)fail(409,"AREA_UNAVAILABLE","Selected browsing area is unavailable");
    const hold=await reserveInventory(who,{key:method==="cod" ? key : `rzp_${key}`,items},session);
    if(hold.state!=="held" || hold.expiresAt<=new Date())fail(409,"HOLD_UNAVAILABLE","This inventory attempt is no longer available; use a new request key");
    const shopIds=[...new Set(hold.lines.map(line=>line.shopId))];
    if(fulfilments.length!==shopIds.length || fulfilments.some(choice=>!shopIds.includes(choice.shopId)))fail(400,"INVALID_SHOP_SELECTION","Choose exactly one method for each shop in the bag");
    const subOrders:SubOrderRecord[]=[];
    for(const shopId of shopIds){
      const shop=await Shop.findById(shopId).session(session);if(!shop || !shop.areaIds.includes(area._id))fail(409,"SHOP_UNAVAILABLE","A shop is unavailable in the browsing area");
      assertNotOwnShop(who.id,shop.ownerId);
      // Also check reused holds; replaying an already-created order remains read-only.
      await fenceSellerPurchase(shop.ownerId,session);
      const method=fulfilments.find(choice=>choice.shopId===shopId)!.method;
      if(!shop.fulfilment.includes(method))fail(409,"METHOD_UNAVAILABLE","The selected fulfilment method is unavailable");
      let fee=0;
      if(method==="platform_delivery" && (!platformEnabled||testMode||!address.location||!shop.location||!await deliveryAvailable(shop.areaIds)))fail(409,"METHOD_UNAVAILABLE","Platform delivery requires pins, enabled live operations and an available approved partner");
      if(method==="seller_delivery"||method==="platform_delivery"){
        const pinIssue=pinCoverage(address.location,shop.location);if(pinIssue)fail(409,"ADDRESS_UNSERVICEABLE",pinIssue.message);
        const coverage=await Area.findOneAndUpdate({_id:{$in:shop.areaIds},active:true,pincodes:address.pincode},{$inc:{revision:1}},{session,returnDocument:"after"});
        if(!coverage)fail(409,"ADDRESS_UNSERVICEABLE","A shop does not deliver to your saved pincode");
        const charge=deliveryFeeCents(method,shop.deliveryFeeCents);if(charge===undefined)fail(409,"DELIVERY_FEE_UNKNOWN","A shop has no configured delivery charge");fee=charge;
      }
      const lines=[];
      for(const line of hold.lines.filter(line=>line.shopId===shopId)){
        const product=await Product.findOne({_id:line.productId,"moderation.blocked":{$ne:true}}).session(session);if(!product)fail(409,"LISTING_UNAVAILABLE","A listing is unavailable");
        const variant=line.variantId ? product.variants.find(variant=>variant._id===line.variantId) : undefined;
        lines.push({productId:line.productId,variantId:line.variantId,variantLabel:variant?.label,name:product.name,unit:product.unit,qty:line.qty,priceCents:line.priceCents});
      }
      const subtotal=lines.reduce((sum,line)=>sum+line.qty*line.priceCents,0);
      if(shop.minimumOrderCents!==undefined && subtotal<shop.minimumOrderCents)fail(409,"MINIMUM_NOT_MET","A shop's item minimum is not met");
      subOrders.push({_id:randomUUID(),shopId,shopName:shop.name,shopAddress:shop.address,status:"placed",fulfilment:method,lines,deliveryFeeCents:fee,itemsSubtotalCents:subtotal});
    }
    const totalCents=subOrders.reduce((sum,sub)=>sum+sub.itemsSubtotalCents+sub.deliveryFeeCents,0);
    if(!Number.isSafeInteger(totalCents))fail(409,"TOTAL_UNAVAILABLE","Order total exceeds supported limits");
    if(totalCents!==Math.round(input.expectedTotal*100))fail(409,"PRICE_CHANGED","The order total changed. Review prices and charges before retrying.");
    const [order]=await Order.create([{_id:id,buyerId:who.id,reservationId:hold._id,fingerprint,createdAt:new Date(),addressId:address._id,address:{label:address.label,line1:address.line1,locality:address.locality,city:address.city,pincode:address.pincode,...(address.location?{location:address.location}:{})},testMode:method==="razorpay" && testMode,paymentMethod:method,paymentStatus:"unpaid",totalCents,subOrders}],{session});
    const committed=await InventoryReservation.updateOne({_id:hold._id,buyerId:who.id,state:"held"},{$set:{state:"committed",orderId:id}},{session});
    if(committed.modifiedCount!==1)fail(409,"HOLD_UNAVAILABLE","Inventory hold changed; retry your order");
    await notify(`${id}:placed`,{userId:who.id},method==="cod" ? "Order placed" : "Order awaiting online payment",method==="cod" ? "Your shops will review their parts of the order." : "Complete payment in your order details. Shops receive it after verified capture.",`/orders/${id}`,session);
    if(method==="cod")for(const sub of subOrders){const shop=await Shop.findById(sub.shopId).session(session);if(shop)await notify(`${id}:seller:${sub.shopId}`,{userId:shop.ownerId},"New shop order","A new COD order is waiting for your shop's review.","/seller/orders",session);}
    return {order:order!.toObject(),replayed:false};
  });}catch(error){
    if(typeof error==="object" && error && "code" in error && error.code===11000){const existing=await Order.findOne({_id:id,buyerId:who.id}).lean();if(existing)return replay(existing);}
    throw error;
  }
}
