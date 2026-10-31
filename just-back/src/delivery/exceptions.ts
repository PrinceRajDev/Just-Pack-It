import {Router} from "express";
import {createHash} from "node:crypto";
import {z} from "zod";
import type {ClientSession,HydratedDocument} from "mongoose";
import {actor} from "../auth/middleware.js";
import {Order,cashStatus,type OrderRecord,type SubOrderRecord} from "../orders/models.js";
import {Partner} from "./models.js";
import {Shop,Product} from "../catalogue/models.js";
import {transaction,deriveProduct} from "../catalogue/service.js";
import {InventoryReservation} from "../inventory/models.js";
import {OnlinePayment} from "../payments/razorpay.js";
import {Refund} from "../payments/refund-model.js";
import {fail} from "../common/errors.js";
import {audit} from "../admin/audit.js";
import {notify} from "../notifications/service.js";
import type {Config} from "../config/env.js";
import {encodeCursor,decodeCursor} from "../common/cursor.js";
const reason=z.string().trim().min(10).max(1000);
const base={version:z.number().int().nonnegative(),reason};
const adminInput=z.discriminatedUnion("action",[
 z.object({...base,action:z.literal("release"),confirmGoodsAtShop:z.literal(true)}).strict(),
 z.object({...base,action:z.literal("cancel_before_pickup"),confirmGoodsAtShop:z.literal(true),restock:z.boolean()}).strict(),
 z.object({...base,action:z.literal("request_return")}).strict(),
 z.object({...base,action:z.literal("resume")}).strict(),
]);
const returnedInput=z.object({...base,partnerId:z.uuid(),confirmGoodsReceived:z.literal(true),restock:z.boolean()}).strict();
type OrderDoc=HydratedDocument<OrderRecord>;
function receiptGuard(order:OrderRecord,sub:SubOrderRecord){if(sub.status==="delivered"||sub.cashCollection||sub.receipt)fail(409,"FINANCIAL_REVIEW_REQUIRED","Buyer receipt or cash confirmation exists. Resolve through financial review; do not cancel or reassign automatically.");if(order.paymentMethod==="razorpay"&&order.paymentStatus!=="paid")fail(409,"PAYMENT_PENDING","Captured payment proof is required before cancellation");}
async function releasePartner(sub:SubOrderRecord,session:ClientSession){if(!sub.delivery)return;const result=await Partner.updateOne({_id:sub.delivery.partnerId,activeTask:sub._id},{$unset:{activeTask:1},$inc:{revision:1}},{session});if(result.modifiedCount!==1)fail(409,"ASSIGNMENT_INVARIANT","Partner task ownership differs. Operator reconciliation required");}
async function cancel(order:OrderDoc,sub:SubOrderRecord,restock:boolean,note:string,session:ClientSession){
 receiptGuard(order,sub);if(sub.restockedAt)fail(409,"INVENTORY_INVARIANT","Stock was already returned");
 const hold=await InventoryReservation.findOne({_id:order.reservationId,state:"committed",orderId:order._id,buyerId:order.buyerId}).session(session).lean();
 const identity=(lines:{productId:string;variantId?:string;qty:number}[])=>JSON.stringify(lines.map(l=>[l.productId,l.variantId??null,l.qty]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
 if(!hold||identity(hold.lines.filter(l=>l.shopId===sub.shopId))!==identity(sub.lines))fail(409,"INVENTORY_INVARIANT","Committed stock proof does not match this shop order");
 if(restock){for(const line of sub.lines){const p=await Product.findOne({_id:line.productId,shopId:sub.shopId}).session(session);if(!p)fail(409,"INVENTORY_INVARIANT","Listing missing; reconcile stock manually");if(line.variantId){const v=p.variants.find(v=>v._id===line.variantId);if(!v)fail(409,"INVENTORY_INVARIANT","Option missing; reconcile stock manually");v.stock+=line.qty;}else p.stock+=line.qty;deriveProduct(p);await p.save({session});}sub.restockedAt=new Date();}
 if(order.paymentMethod==="razorpay"){
 const payment=await OnlinePayment.findOne({_id:order._id,state:"paid"}).session(session).lean();if(!payment?.providerPaymentId)fail(409,"PAYMENT_INVARIANT","Captured provider payment proof missing");
 const amountCents=sub.itemsSubtotalCents+sub.deliveryFeeCents;
 await Refund.create([{_id:sub._id,orderId:order._id,shopId:sub.shopId,shopName:sub.shopName,paymentId:payment.providerPaymentId,keyId:payment.keyId,amountCents,testMode:order.testMode??false,reason:note,state:"requested",createdAt:new Date(),updatedAt:new Date()}],{session});sub.refund={state:"requested",amountCents,updatedAt:new Date()};
 }
 await releasePartner(sub,session);if(sub.delivery){sub.delivery.state="returned";sub.delivery.completedAt=new Date();}sub.history??=[];sub.history.push({from:sub.status,to:"cancelled",at:new Date(),actorId:"",reason:note});sub.status="cancelled";sub.cancelReason=note;order.paymentStatus=cashStatus(order);
}
function task(order:OrderRecord,id:string){const sub=order.subOrders.find(s=>s._id===id);if(!sub||sub.fulfilment!=="platform_delivery")fail(404,"NOT_FOUND","Platform task not found");return sub;}
function replay(sub:SubOrderRecord,expected:number,fingerprint:string){const last=sub.exceptionHistory?.at(-1);return(sub.version??0)===expected+1&&last?.fingerprint===fingerprint;}
function record(sub:SubOrderRecord,action:string,who:string,note:string,expected:number,fingerprint:string,restock?:boolean){sub.exceptionHistory??=[];if(sub.exceptionHistory.length>=100)fail(409,"EXCEPTION_LIMIT","Exception history limit reached; operator reconciliation required");sub.exceptionHistory.push({action,actorId:who,partnerId:sub.delivery?.partnerId,reason:note,issueReason:sub.delivery?.issue?.reason,restock,at:new Date(),version:expected+1,fingerprint});sub.version=expected+1;sub.updatedAt=new Date();}
export function deliveryExceptionAdminRoutes(config:Config){const router=Router();
 router.get("/delivery/exceptions",async(req,res)=>{
 const q=z.object({taskId:z.uuid().optional(),cursor:z.string().max(2048).optional()}).strict().parse(req.query),scope=`delivery-exceptions:${q.taskId??"all"}`,cursor=q.cursor?decodeCursor(q.cursor,scope,"id",config.CURSOR_SECRET):undefined;
 const rows=await Order.aggregate<OrderRecord>([{$match:{testMode:{$ne:true},"subOrders.fulfilment":"platform_delivery"}},{$unwind:"$subOrders"},{$match:{"subOrders.fulfilment":"platform_delivery","subOrders.status":{$nin:["delivered","cancelled"]},...(q.taskId?{"subOrders._id":q.taskId}:{}),...(cursor?{"subOrders._id":{$gt:cursor.id}}:{}), ...(q.taskId?{}:{$or:[{$and:[{"subOrders.delivery":{$exists:false}},{"subOrders.status":"ready"}]},{"subOrders.delivery.state":{$in:["claimed","returning"]}},{"subOrders.delivery.issue":{$exists:true}}]})}},{$sort:{"subOrders._id":1}},{$limit:26},{$set:{subOrders:["$subOrders"]}}]).option({maxTimeMS:5000});const page=rows.slice(0,25);
 res.json({items:page.map(o=>{const s=o.subOrders[0];return{id:s._id,orderId:o._id,shopName:s.shopName,version:s.version??0,status:s.status,deliveryState:s.delivery?.state??"unassigned",partnerId:s.delivery?.partnerId??null,claimedAt:s.delivery?.claimedAt?.toISOString(),reason:s.delivery?.issue?.reason??null,financialReviewRequired:!!s.receipt||!!s.cashCollection,history:(s.exceptionHistory??[]).map(e=>({action:e.action,reason:e.reason,actorId:e.actorId,partnerId:e.partnerId,at:e.at.toISOString(),restock:e.restock}))};}),next:rows.length>25?encodeCursor({scope,sort:"id",key:page[24].subOrders[0]._id,id:page[24].subOrders[0]._id},config.CURSOR_SECRET):undefined});
 });
 router.post("/delivery/tasks/:id/resolve",async(req,res)=>{const id=z.uuid().parse(req.params.id),input=adminInput.parse(req.body),who=actor(req),fingerprint=createHash("sha256").update(JSON.stringify([who.id,id,input])).digest("hex");
 res.json(await transaction(async session=>{
 const order=await Order.findOne({"subOrders._id":id,testMode:{$ne:true}}).session(session);if(!order)fail(404,"NOT_FOUND","Task not found");const sub=task(order,id);if(replay(sub,input.version,fingerprint))return{saved:true,version:sub.version};if((sub.version??0)!==input.version)fail(409,"VERSION_CONFLICT","Task changed; refresh before resolving");if(sub.status==="cancelled"||sub.status==="delivered")fail(409,"TASK_FINISHED","Task already finished");
 receiptGuard(order,sub);
 const state=sub.delivery?.state;
 if(input.action==="release"){
  receiptGuard(order,sub);if(sub.status!=="ready"||state!=="claimed"||sub.delivery?.pickedUpAt)fail(409,"PICKUP_ALREADY_CONFIRMED","Only a claimed task before pickup can return to the claim queue");
  record(sub,input.action,who.id,input.reason,input.version,fingerprint);await releasePartner(sub,session);sub.delivery=undefined;
 }else if(input.action==="request_return"){
  receiptGuard(order,sub);if(!sub.delivery||!["picked_up","out_for_delivery"].includes(state??""))fail(409,"INVALID_TRANSITION","Return requires confirmed pickup");record(sub,input.action,who.id,input.reason,input.version,fingerprint);sub.delivery.state="returning";sub.delivery.issue={reason:input.reason,at:new Date()};
 }else if(input.action==="cancel_before_pickup"){
  receiptGuard(order,sub);if(sub.status!=="ready"||(state&&state!=="claimed")||sub.delivery?.pickedUpAt)fail(409,"PICKUP_ALREADY_CONFIRMED","Goods must still be at the shop before pickup");record(sub,input.action,who.id,input.reason,input.version,fingerprint,input.restock);await cancel(order,sub,input.restock,input.reason,session);sub.history!.at(-1)!.actorId=who.id;
 }else{
  if(!sub.delivery?.issue||!["claimed","picked_up","out_for_delivery"].includes(state??""))fail(409,"INVALID_TRANSITION","Only an active reported issue can be cleared; returning tasks require seller receipt");record(sub,input.action,who.id,input.reason,input.version,fingerprint);sub.delivery.issue=undefined;
 }
 sub.receipt=undefined;order.markModified("subOrders");await order.save({session});await audit(who,`delivery.${input.action}`,id,session,sub.version);
 await notify(`${id}:exception:${sub.version}`,{userId:order.buyerId},"Delivery update",input.action==="request_return"?"Your shop order is being returned to the shop. Review the order for its final resolution.":input.action==="cancel_before_pickup"?"This shop's order was cancelled before pickup. Any online refund is tracked separately.":"The delivery assignment or reported issue was updated. Check your order for current status.",`/orders/${order._id}`,session);
 const shop=await Shop.findById(sub.shopId).session(session);if(shop)await notify(`${id}:exception-seller:${sub.version}`,{userId:shop.ownerId},"Delivery exception update","Review your platform delivery order. A requested return must be acknowledged only after goods actually arrive.","/seller/orders",session);
 const partner=sub.delivery?.partnerId??sub.exceptionHistory?.at(-1)?.partnerId;if(partner)await notify(`${id}:exception-partner:${sub.version}`,{userId:partner},"Delivery task updated",input.action==="request_return"?"Return the goods to the shop. The seller must confirm receipt before your task is released.":"Refresh your delivery desk before acting. Assignment and permissions may have changed.","/delivery",session);
 return{saved:true,version:sub.version};
 }));});return router;}
export function deliveryReturnSellerRoutes(){const router=Router();router.post("/orders/:orderId/suborders/:id/returned",async(req,res)=>{
 const orderId=z.uuid().parse(req.params.orderId),id=z.uuid().parse(req.params.id),input=returnedInput.parse(req.body),who=actor(req),fingerprint=createHash("sha256").update(JSON.stringify([who.id,id,"received_return",input])).digest("hex");
 res.json(await transaction(async session=>{const shop=await Shop.findOne({ownerId:who.id}).session(session);if(!shop)fail(404,"NOT_FOUND","Task not found");const order=await Order.findOne({_id:orderId,subOrders:{$elemMatch:{_id:id,shopId:shop._id}}}).session(session);if(!order)fail(404,"NOT_FOUND","Task not found");const sub=task(order,id);if(replay(sub,input.version,fingerprint))return{saved:true,version:sub.version};if((sub.version??0)!==input.version)fail(409,"VERSION_CONFLICT","Task changed; refresh");if(sub.delivery?.state!=="returning"||sub.delivery.partnerId!==input.partnerId)fail(409,"INVALID_TRANSITION","Return is not assigned to this partner");receiptGuard(order,sub);record(sub,"received_return",who.id,input.reason,input.version,fingerprint,input.restock);await cancel(order,sub,input.restock,input.reason,session);sub.history!.at(-1)!.actorId=who.id;order.markModified("subOrders");await order.save({session});await audit(who,"delivery.received_return",id,session,sub.version);await notify(`${id}:return-complete:${sub.version}`,{userId:order.buyerId},"Returned shop order cancelled","The shop confirmed returned goods. Check your order for cancellation and any separately tracked refund request.",`/orders/${order._id}`,session);return{saved:true,version:sub.version};}));
 });return router;}
