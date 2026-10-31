import {Partner} from "../delivery/models.js";
import {createHmac,randomInt,randomUUID,timingSafeEqual} from "node:crypto";
import {Router} from "express";
import {z} from "zod";
import {actor,type Actor} from "../auth/middleware.js";
import {throttle} from "../auth/service.js";
import type {Config} from "../config/env.js";
import {fail} from "../common/errors.js";
import {Shop} from "../catalogue/models.js";
import {transaction} from "../catalogue/service.js";
import {InventoryReservation} from "../inventory/models.js";
import {Order,cashStatus,type OrderRecord,type SubOrderRecord,type ReceiptProof} from "./models.js";
import {sellerSuborderDto} from "./seller.js";
import {notify} from "../notifications/service.js";
const issueInput=z.object({version:z.number().int().nonnegative(),confirmReceived:z.literal(true),confirmCashPaid:z.literal(true).optional()}).strict();
const completeInput=z.object({version:z.number().int().nonnegative(),code:z.string().length(6).regex(/^[0-9]{6}$/),confirmHandoff:z.literal(true).optional(),confirmCashReceived:z.literal(true).optional(),amountReceived:z.number().finite().nonnegative().max(1e12).refine(amount=>Math.abs(amount*100-Math.round(amount*100))<0.0001).optional()}).strict();
const eligible=(sub:SubOrderRecord)=>sub.fulfilment==="pickup" ? sub.status==="ready" : sub.status==="out_for_delivery";
const proofHash=(order:OrderRecord,sub:SubOrderRecord,proof:Pick<ReceiptProof,"nonce"|"version">,code:string,config:Config)=>createHmac("sha256",config.SESSION_PEPPER).update(JSON.stringify(["jpi-receipt-v1",order._id,sub._id,order.buyerId,proof.version,proof.nonce,code])).digest("hex");
function matches(order:OrderRecord,sub:SubOrderRecord,code:string,config:Config){
  const receipt=sub.receipt;if(!receipt || !/^[a-f0-9]{64}$/.test(receipt.hash))fail(409,"RECEIPT_UNAVAILABLE","Receipt proof is unavailable; ask the buyer to issue a new code");
  return timingSafeEqual(Buffer.from(receipt.hash,"hex"),Buffer.from(proofHash(order,sub,receipt,code,config),"hex"));
}
export async function issueReceiptCode(who:Actor,orderId:string,subId:string,raw:z.infer<typeof issueInput>,config:Config){
  if(who.role!=="buyer")fail(403,"FORBIDDEN","Buyer account required");
  z.uuid().parse(orderId);z.uuid().parse(subId);const input=issueInput.parse(raw);
  return transaction(async session=>{
    const order=await Order.findOne({_id:orderId,buyerId:who.id,"subOrders._id":subId}).session(session),sub=order?.subOrders.find(sub=>sub._id===subId);
    if(!order || !sub)fail(404,"NOT_FOUND","Suborder not found");
    if(order.paymentMethod==="cod" && !input.confirmCashPaid)fail(400,"CASH_CONFIRMATION_REQUIRED","Confirm cash payment for COD");
    if(order.paymentMethod==="razorpay" && order.paymentStatus!=="paid")fail(409,"PAYMENT_PENDING","Online payment has not been captured");
    if((sub.version ?? 0)!==input.version)fail(409,"VERSION_CONFLICT","Refresh this order before issuing a code");
    if(!eligible(sub) || sub.cashCollection || (sub.fulfilment==="platform_delivery"&&sub.delivery?.state!=="out_for_delivery"))fail(409,"RECEIPT_UNAVAILABLE","Receipt code is not available at this stage");
    const now=new Date();
    if(sub.receipt?.lockedUntil && sub.receipt.lockedUntil>now)fail(429,"RECEIPT_LOCKED","Receipt verification is locked. Wait 15 minutes before issuing a new code");
    if(sub.receipt && now.getTime()-sub.receipt.issuedAt.getTime()<60_000)fail(429,"RECEIPT_COOLDOWN","Wait at least 60 seconds before issuing another code");
    let code=String(randomInt(100000,1000000));
    for(let retry=0;sub.receipt && /^[a-f0-9]{64}$/.test(sub.receipt.hash) && proofHash(order,sub,sub.receipt,code,config)===sub.receipt.hash;retry++){
      if(retry>=4)fail(503,"RECEIPT_BUSY","Could not rotate the receipt code; retry later");code=String(randomInt(100000,1000000));
    }
    const proof:ReceiptProof={hash:"",nonce:randomUUID(),version:input.version,issuedAt:now,expiresAt:new Date(now.getTime()+300_000),buyerConfirmedAt:now,attempts:0};
    proof.hash=proofHash(order,sub,proof,code,config);sub.receipt=proof;
    order.markModified("subOrders");await order.save({session});
    return {code,expiresAt:proof.expiresAt.toISOString(),issuedAt:now.toISOString(),amount:(sub.itemsSubtotalCents+sub.deliveryFeeCents)/100};
  });
}
export async function completeCashHandoff(who:Actor,orderId:string,subId:string,raw:z.infer<typeof completeInput>,config:Config,prepaid=false,partnerMode=false){
  if(who.role!==(partnerMode?"delivery":"seller"))fail(403,"FORBIDDEN","Handoff account required");
  z.uuid().parse(orderId);z.uuid().parse(subId);const input=completeInput.parse(raw);
  const result=await transaction(async session=>{
    const assigned=partnerMode?await Order.findOne({_id:orderId,subOrders:{$elemMatch:{_id:subId,"delivery.partnerId":who.id}}}).session(session):null;
    const assignedSub=assigned?.subOrders.find(s=>s._id===subId&&s.delivery?.partnerId===who.id);
    if(partnerMode&&!assignedSub)fail(404,"NOT_FOUND","Task not found");
    const shop=await Shop.findOne(partnerMode?{_id:assignedSub!.shopId}:{ownerId:who.id}).session(session);if(!shop)fail(404,"NOT_FOUND","Suborder not found");
    const order=await Order.findOne({_id:orderId,subOrders:{$elemMatch:{_id:subId,shopId:shop._id}}}).session(session),sub=order?.subOrders.find(sub=>sub._id===subId && sub.shopId===shop._id);
    if(!order || !sub)fail(404,"NOT_FOUND","Suborder not found");
    if(partnerMode ? sub.fulfilment!=="platform_delivery" || sub.delivery?.partnerId!==who.id : sub.fulfilment==="platform_delivery")fail(404,"NOT_FOUND","Handoff not found");
    if(prepaid ? order.paymentMethod!=="razorpay" || order.paymentStatus!=="paid" || !input.confirmHandoff || input.amountReceived!==undefined || input.confirmCashReceived!==undefined : order.paymentMethod!=="cod" || !input.confirmCashReceived || input.amountReceived===undefined)fail(400,"INVALID_HANDOFF_METHOD","Use the correct cash or prepaid handoff confirmation");
    const cents=sub.itemsSubtotalCents+sub.deliveryFeeCents,version=sub.version ?? 0,now=new Date();
    if(sub.status==="delivered"){
      if(version===input.version+1 && (prepaid ? sub.history?.at(-1)?.actorId===who.id : sub.cashCollection?.reportedBy===who.id) && sub.receipt?.consumedAt && (prepaid || Math.round(input.amountReceived!*100)===cents) && matches(order,sub,input.code,config))return {dto:sellerSuborderDto(order.toObject(),sub)};
      fail(409,"HANDOFF_ALREADY_RECORDED","Handoff was already recorded. Refresh this suborder");
    }
    if(version!==input.version)fail(409,"VERSION_CONFLICT","Refresh this suborder before confirming handoff");
    if(!eligible(sub) || sub.cashCollection || (partnerMode && sub.delivery?.state!=="out_for_delivery"))fail(409,"INVALID_TRANSITION","This suborder is not ready for verified handoff");
    if(!prepaid && Math.round(input.amountReceived!*100)!==cents)fail(409,"CASH_AMOUNT_MISMATCH","Confirm the exact server-supplied COD amount received");
    const proof=sub.receipt;
    if(!proof || proof.version!==version || proof.consumedAt)fail(409,"RECEIPT_UNAVAILABLE",prepaid ? "Ask the buyer to generate a receipt code after receiving goods" : "Ask the buyer to generate a receipt code after receiving goods and paying cash");
    if(proof.lockedUntil && proof.lockedUntil>now)return {error:{status:429,code:"RECEIPT_LOCKED",message:"Too many wrong codes. Verification is locked for 15 minutes"}};
    if(proof.expiresAt<=now)fail(409,"RECEIPT_EXPIRED","The receipt code expired. Ask the buyer for a new one");
    if(!matches(order,sub,input.code,config)){
      proof.attempts++;if(proof.attempts>=5)proof.lockedUntil=new Date(now.getTime()+900_000);
      order.markModified("subOrders");await order.save({session});
      return {error:{status:proof.attempts>=5 ? 429 : 400,code:proof.attempts>=5 ? "RECEIPT_LOCKED" : "INVALID_RECEIPT_CODE",message:proof.attempts>=5 ? "Too many wrong codes. Verification is locked for 15 minutes" : "Receipt code is incorrect"}};
    }
    if(!await InventoryReservation.exists({_id:order.reservationId,state:"committed",orderId:order._id,buyerId:order.buyerId}).session(session))fail(409,"INVENTORY_INVARIANT","Committed order proof is missing; reconciliation required");
    await Shop.updateOne({_id:shop._id},{$inc:{revision:1}},{session});
    if(partnerMode){const released=await Partner.updateOne({_id:who.id,activeTask:sub._id},{$unset:{activeTask:1},$inc:{revision:1}},{session});if(released.modifiedCount!==1)fail(409,"TASK_CHANGED","Active task ownership changed");sub.delivery!.state="delivered";sub.delivery!.completedAt=now;}
    proof.consumedAt=now;if(!prepaid)sub.cashCollection={id:randomUUID(),method:"cash",amountCents:cents,reportedBy:who.id,recordedAt:now,buyerConfirmedAt:proof.buyerConfirmedAt};
    sub.history ??=[];sub.history.push({from:sub.status,to:"delivered",at:now,actorId:who.id});sub.status="delivered";sub.version=version+1;sub.updatedAt=now;
    order.paymentStatus=cashStatus(order);order.markModified("subOrders");await order.save({session});
    await notify(`${order._id}:${sub._id}:delivered`,{userId:order.buyerId},"Shop handoff confirmed",prepaid ? "Your prepaid shop order handoff was recorded. No cash collection was required." : "Your shop handoff and seller cash acknowledgement were recorded.",`/orders/${order._id}`,session);
    return {dto:sellerSuborderDto(order.toObject(),sub)};
  });
  // Reject after committing failed-attempt counters, so transaction rollback cannot erase them.
  if(result.error)fail(result.error.status,result.error.code,result.error.message);
  return result.dto;
}
export function buyerReceiptRoutes(config:Config){const router=Router();router.post("/:orderId/suborders/:subId/receipt-code",async(req,res)=>{
  res.setHeader("Cache-Control","private, no-store");await throttle(`receipt-issue:${actor(req).id}`,config,20);
  res.json(await issueReceiptCode(actor(req),z.uuid().parse(req.params.orderId),z.uuid().parse(req.params.subId),req.body,config));
});return router;}
export function sellerReceiptRoutes(config:Config){const router=Router();router.post("/orders/:orderId/suborders/:subId/complete-cash",async(req,res)=>{
  res.setHeader("Cache-Control","private, no-store");await throttle(`receipt-verify:${actor(req).id}`,config,60);
  res.json(await completeCashHandoff(actor(req),z.uuid().parse(req.params.orderId),z.uuid().parse(req.params.subId),req.body,config));
});router.post("/orders/:orderId/suborders/:subId/complete-handoff",async(req,res)=>{res.setHeader("Cache-Control","private, no-store");await throttle(`receipt-verify:${actor(req).id}`,config,60);res.json(await completeCashHandoff(actor(req),z.uuid().parse(req.params.orderId),z.uuid().parse(req.params.subId),req.body,config,true));});return router;}
