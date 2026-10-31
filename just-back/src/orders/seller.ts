import {Router} from "express";
import {z} from "zod";
import {actor,type Actor} from "../auth/middleware.js";
import type {Config} from "../config/env.js";
import {fail} from "../common/errors.js";
import {encodeCursor,decodeCursor} from "../common/cursor.js";
import {transaction,deriveProduct} from "../catalogue/service.js";
import {Shop,Product} from "../catalogue/models.js";
import {InventoryReservation} from "../inventory/models.js";
import {Order,orderDto,cashStatus,type OrderRecord,type SubOrderRecord,type SellerSuborderStatus} from "./models.js";
import {Refund} from "../payments/refund-model.js";
import {OnlinePayment} from "../payments/razorpay.js";
import {notify} from "../notifications/service.js";
const statuses=["placed","accepted","preparing","ready","out_for_delivery","delivered","cancelled"] as const;
export const sellerTransitionInput=z.object({version:z.number().int().nonnegative(),status:z.enum(["accepted","preparing","ready","out_for_delivery","cancelled"]),reason:z.string().trim().min(3).max(500).optional()}).strict().superRefine((input,ctx)=>{
  if(input.status==="cancelled" && !input.reason)ctx.addIssue({code:"custom",path:["reason"],message:"A buyer-visible cancellation reason is required"});
  if(input.status!=="cancelled" && input.reason!==undefined)ctx.addIssue({code:"custom",path:["reason"],message:"Reasons are only accepted for cancellation"});
});
export function sellerSuborderDto(order:OrderRecord,sub:SubOrderRecord){
  const snapshot=order.subOrders.find(item=>item._id===sub._id) ?? fail(404,"NOT_FOUND","Suborder not found");
  const dto=orderDto({...order,subOrders:[snapshot]});
  return {...(snapshot.delivery?{delivery:{partnerId:snapshot.delivery.partnerId,state:snapshot.delivery.state}}:{}),orderId:order._id,createdAt:order.createdAt.toISOString(),testMode:order.testMode ?? false,paymentMethod:order.paymentMethod,paymentStatus:dto.paymentStatus,...dto.subOrders[0],itemsSubtotal:snapshot.itemsSubtotalCents/100,total:(snapshot.itemsSubtotalCents+snapshot.deliveryFeeCents)/100,...(snapshot.fulfilment==="seller_delivery" ? {deliveryAddress:order.address} : {})};
}
export async function transitionSellerSuborder(who:Actor,orderId:string,suborderId:string,raw:z.infer<typeof sellerTransitionInput>){
  if(who.role!=="seller")fail(403,"FORBIDDEN","Seller account required");
  return transitionSuborder(who,orderId,suborderId,raw,false);
}
export async function cancelBuyerSuborder(who:Actor,orderId:string,suborderId:string,input:{version:number;reason:string}){
  if(who.role!=="buyer")fail(403,"FORBIDDEN","Buyer account required");
  return transitionSuborder(who,orderId,suborderId,{...input,status:"cancelled"},true);
}
async function transitionSuborder(who:Actor,orderId:string,suborderId:string,raw:z.infer<typeof sellerTransitionInput>,buyerMode:boolean){
  z.uuid().parse(orderId);z.uuid().parse(suborderId);const input=sellerTransitionInput.parse(raw);
  return transaction(async session=>{
    const ownedOrder=buyerMode ? await Order.findOne({_id:orderId,buyerId:who.id,"subOrders._id":suborderId}).session(session) : null;
    const ownedSub=ownedOrder?.subOrders.find(sub=>sub._id===suborderId);
    if(buyerMode && !ownedSub)fail(404,"NOT_FOUND","Suborder not found");
    const shop=await Shop.findOne(buyerMode ? {_id:ownedSub!.shopId} : {ownerId:who.id}).session(session);if(!shop)fail(404,"NOT_FOUND","Suborder not found");
    const order=await Order.findOne({_id:orderId,subOrders:{$elemMatch:{_id:suborderId,shopId:shop._id}}}).session(session);
    const sub=order?.subOrders.find(sub=>sub._id===suborderId && sub.shopId===shop._id);if(!order || !sub)fail(404,"NOT_FOUND","Suborder not found");
    if(order.paymentMethod==="razorpay" && order.paymentStatus!=="paid")fail(409,"PAYMENT_PENDING","Payment must be captured before processing");
    const version=sub.version ?? 0,last=sub.history?.at(-1);
    if(version===input.version+1 && sub.status===input.status && last?.actorId===who.id && last.reason===input.reason)return sellerSuborderDto(order.toObject(),sub);
    if(version!==input.version)fail(409,"VERSION_CONFLICT","This suborder changed; refresh before trying again");
    const next:Partial<Record<SellerSuborderStatus,SellerSuborderStatus[]>>={placed:["accepted","cancelled"],accepted:["preparing","cancelled"],preparing:["ready"],ready:sub.fulfilment==="seller_delivery" ? ["out_for_delivery"] : []};
    if(!next[sub.status]?.includes(input.status))fail(409,"INVALID_TRANSITION","This status change is not allowed");
    if(input.status!=="cancelled" && (!shop.active || shop.status!=="approved"))fail(409,"SHOP_UNAVAILABLE","Shop approval is required to process orders");
    await Shop.updateOne({_id:shop._id},{$inc:{revision:1}},{session});
    const now=new Date();
    if(input.status==="cancelled"){
      if(sub.restockedAt)fail(409,"INVENTORY_INVARIANT","Suborder stock was already returned");
      const hold=await InventoryReservation.findOne({_id:order.reservationId,state:"committed",orderId:order._id}).session(session);
      const held=hold?.lines.filter(line=>line.shopId===shop._id);
      const identity=(lines:{productId:string;variantId?:string;qty:number}[])=>JSON.stringify(lines.map(line=>[line.productId,line.variantId ?? null,line.qty]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
      if(!held || identity(held)!==identity(sub.lines))fail(409,"INVENTORY_INVARIANT","Committed stock proof is missing; reconciliation required");
      for(const line of sub.lines){
        const product=await Product.findOne({_id:line.productId,shopId:shop._id}).session(session);
        if(!product)fail(409,"INVENTORY_INVARIANT","Listing is missing; reconciliation required");
        if(line.variantId){const variant=product.variants.find(variant=>variant._id===line.variantId);if(!variant)fail(409,"INVENTORY_INVARIANT","Variant is missing; reconciliation required");variant.stock+=line.qty;}else product.stock+=line.qty;
        deriveProduct(product);await product.save({session});
      }
      sub.restockedAt=now;sub.cancelReason=input.reason;
      if(order.paymentMethod==="razorpay"){
        const payment=await OnlinePayment.findOne({_id:order._id,state:"paid"}).session(session);
        if(!payment?.providerPaymentId)fail(409,"PAYMENT_INVARIANT","Verified captured payment is missing; reconciliation required");
        const amountCents=sub.itemsSubtotalCents+sub.deliveryFeeCents;
        await Refund.create([{_id:sub._id,orderId:order._id,shopId:sub.shopId,shopName:sub.shopName,paymentId:payment.providerPaymentId,keyId:payment.keyId,amountCents,testMode:order.testMode ?? false,reason:input.reason,state:"requested",createdAt:now,updatedAt:now}],{session});
        sub.refund={state:"requested",amountCents,updatedAt:now};
      }
    }
    sub.history ??=[];sub.history.push({from:sub.status,to:input.status,at:now,actorId:who.id,...(input.reason ? {reason:input.reason} : {})});
    sub.status=input.status;sub.version=version+1;sub.updatedAt=now;
    order.paymentStatus=cashStatus(order);order.markModified("subOrders");await order.save({session});
    await notify(`${order._id}:${sub._id}:status:${sub.version}`,{userId:order.buyerId},`${sub.shopName}: ${sub.status.replaceAll("_"," ")}`,sub.status==="cancelled" ? "This shop's part was cancelled. Check order details for the reason and any refund request." : "Your shop order status has changed. Open the order for current details.",`/orders/${order._id}`,session);
    if(buyerMode)await notify(`${order._id}:${sub._id}:buyer-cancel`,{userId:shop.ownerId},"Buyer cancelled a shop order","The buyer cancelled before preparation. Review your orders for details.","/seller/orders",session);
    return sellerSuborderDto(order.toObject(),sub);
  });
}
export function sellerOrderRoutes(config:Config){
  const router=Router();
  router.get("/orders",async(req,res)=>{
    res.setHeader("Cache-Control","private, no-store");
    const status=z.enum(statuses).optional().parse(req.query.status),limit=z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit);
    const shop=await Shop.findOne({ownerId:actor(req).id}).lean();if(!shop){res.setHeader("X-Has-More","false");res.json([]);return;}
    const scope=`seller-orders:${actor(req).id}:${shop._id}:${status ?? "all"}`;
    const cursor=req.query.cursor===undefined ? undefined : decodeCursor(z.string().max(2048).parse(req.query.cursor),scope,"newest",config.CURSOR_SECRET);
    const date=cursor ? z.iso.datetime().parse(cursor.key) : undefined;
    const records=await Order.find({$and:[{$or:[{paymentMethod:"cod"},{paymentMethod:"razorpay",paymentStatus:"paid"}]}],subOrders:{$elemMatch:{shopId:shop._id,...(status ? {status} : {})}},...(cursor ? {$or:[{createdAt:{$lt:new Date(date!)}},{createdAt:new Date(date!),_id:{$lt:cursor.id}}]} : {})}).sort({createdAt:-1,_id:-1}).limit(limit+1).lean();
    const hasMore=records.length>limit,page=records.slice(0,limit);res.setHeader("X-Has-More",String(hasMore));
    if(hasMore){const last=page.at(-1)!;res.setHeader("X-Next-Cursor",encodeCursor({scope,sort:"newest",key:last.createdAt.toISOString(),id:last._id},config.CURSOR_SECRET));}
    res.json(page.flatMap(order=>order.subOrders.filter(sub=>sub.shopId===shop._id && (!status || sub.status===status)).map(sub=>sellerSuborderDto(order,sub))));
  });
  router.patch("/orders/:orderId/suborders/:suborderId",async(req,res)=>{
    res.setHeader("Cache-Control","private, no-store");
    res.json(await transitionSellerSuborder(actor(req),z.uuid().parse(req.params.orderId),z.uuid().parse(req.params.suborderId),req.body));
  });
  return router;
}
