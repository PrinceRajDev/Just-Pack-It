import {randomUUID} from "node:crypto";
import {Router} from "express";
import {z} from "zod";
import {actor,type Actor} from "../auth/middleware.js";
import {throttle} from "../auth/service.js";
import {fail,AppError} from "../common/errors.js";
import type {Config} from "../config/env.js";
import {transaction} from "../catalogue/service.js";
import {Order} from "../orders/models.js";
import {Refund,type RefundRecord,type RefundState} from "./refund-model.js";
import {OnlinePayment,PaymentAudit,provider} from "./razorpay.js";
import {recoveryDto} from "./recovery-model.js";
import {notify} from "../notifications/service.js";
export async function verifyRefundIndexes(){const indexes=await Refund.collection.indexes();if(!indexes.some(index=>index.unique && index.sparse && index.key.providerRefundId===1))throw new Error("Refund uniqueness index missing");}
const remoteSchema=z.object({id:z.string().regex(/^rfnd_[A-Za-z0-9]+$/),payment_id:z.string().regex(/^pay_[A-Za-z0-9]+$/),amount:z.number().int().positive(),currency:z.literal("INR"),status:z.enum(["pending","processed","failed"]),receipt:z.string().nullable().optional()});
export const refundDto=(row:RefundRecord,config:Config)=>({id:row._id,orderId:row.orderId,shopId:row.shopId,shopName:row.shopName,amount:row.amountCents/100,state:row.state,testMode:row.testMode,reason:row.reason,providerRefundId:row.providerRefundId ?? null,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),recovery:recoveryDto(row.recovery),canSubmit:config.RAZORPAY_ENABLED && config.RAZORPAY_REFUNDS_ENABLED && row.keyId===config.RAZORPAY_KEY_ID,canReconcile:config.RAZORPAY_ENABLED && row.keyId===config.RAZORPAY_KEY_ID});
function credentials(row:RefundRecord,config:Config){if(!config.RAZORPAY_ENABLED || !config.RAZORPAY_KEY_SECRET || row.keyId!==config.RAZORPAY_KEY_ID)fail(503,"REFUNDS_UNAVAILABLE","Configure the original Razorpay account before checking refunds");}
async function update(row:RefundRecord,state:RefundState,providerRefundId?:string){
  return transaction(async session=>{
    const current=await Refund.findById(row._id).session(session),order=await Order.findById(row.orderId).session(session);
    const sub=order?.subOrders.find(sub=>sub._id===row._id);
    if(!current || !order || !sub || order.paymentMethod!=="razorpay" || sub.status!=="cancelled" || !sub.restockedAt || sub.shopId!==row.shopId || current.amountCents!==sub.itemsSubtotalCents+sub.deliveryFeeCents)fail(409,"REFUND_INVARIANT","Refund cancellation proof is missing");
    if(current.providerRefundId && providerRefundId && current.providerRefundId!==providerRefundId)fail(409,"REFUND_MISMATCH","A different provider refund is already attached");
    if(current.state==="processed")return current.toObject();
    if(current.state==="failed" && state!=="processed")return current.toObject();
    current.state=state;current.updatedAt=new Date();current.leaseUntil=undefined;if(providerRefundId)current.providerRefundId=providerRefundId;
    if(current.recovery && ["processed","failed"].includes(state)){current.recovery.manualReview=state==="failed";current.recovery.nextCheckAt=null;}
    sub.refund={state,amountCents:current.amountCents,updatedAt:current.updatedAt};order.markModified("subOrders");
    await current.save({session});await order.save({session});
    if(["pending","processed","failed","uncertain"].includes(state))await notify(`${row._id}:refund:${state}`,{userId:order.buyerId},`${current.testMode ? "Test refund" : "Refund"}: ${state}`,state==="processed" ? "Provider reports the refund processed. Bank credit timing depends on the payment method." : "Check order details for the current refund state; this is not confirmation of bank credit.",`/orders/${order._id}`,session);
    return current.toObject();
  });
}
async function accept(row:RefundRecord,raw:unknown,expectedId?:string){
  const remote=remoteSchema.parse(raw);
  if((expectedId && remote.id!==expectedId) || remote.payment_id!==row.paymentId || remote.amount!==row.amountCents || (remote.receipt && remote.receipt!==row._id))fail(409,"REFUND_MISMATCH","Provider refund does not match the server obligation");
  return update(row,remote.status,remote.id);
}
export async function reconcileRefund(id:string,config:Config){
  const row=await Refund.findById(z.uuid().parse(id)).lean();if(!row)fail(404,"NOT_FOUND","Refund not found");credentials(row,config);
  if(!row.providerRefundId)fail(409,"REFUND_RETRY_REQUIRED","No provider refund is attached. An admin must recover the same saved submission; do not create a new refund key.");
  return accept(row,await provider(config,`payments/${encodeURIComponent(row.paymentId)}/refunds/${encodeURIComponent(row.providerRefundId)}`),row.providerRefundId);
}
export async function submitRefund(who:Actor,id:string,config:Config){
  if(who.role!=="admin")fail(403,"FORBIDDEN","Admin account required");
  const existing=await Refund.findById(z.uuid().parse(id)).lean();if(!existing)fail(404,"NOT_FOUND","Refund not found");credentials(existing,config);
  if(existing.providerRefundId)return reconcileRefund(id,config);
  if(!config.RAZORPAY_REFUNDS_ENABLED)fail(503,"REFUNDS_DISABLED","Refund submission is not enabled");
  const leaseToken=new Date(Date.now()+60_000);
  const row=await Refund.findOneAndUpdate({_id:id,state:{$in:["requested","uncertain","submitting"]},$or:[{leaseUntil:{$exists:false}},{leaseUntil:{$lte:new Date()}}]},{$set:{state:"submitting",leaseUntil:leaseToken}},{returnDocument:"after"}).lean();
  if(!row)fail(409,"REFUND_BUSY","Refund is already being checked or needs operator review");
  try{
    const payment=await OnlinePayment.findOne({_id:row.orderId,state:"paid",providerPaymentId:row.paymentId,keyId:row.keyId}).lean();
    if(!payment)fail(409,"PAYMENT_INVARIANT","Verified captured payment is missing");
    const order=await Order.findOne({_id:row.orderId,paymentMethod:"razorpay",paymentStatus:"paid"}).lean(),sub=order?.subOrders.find(item=>item._id===row._id && item.shopId===row.shopId);
    if(!order || !sub || sub.status!=="cancelled" || !sub.restockedAt || row.amountCents!==sub.itemsSubtotalCents+sub.deliveryFeeCents || payment.amountCents!==order.totalCents)fail(409,"REFUND_INVARIANT","Cancelled suborder amount does not match this obligation");
    // The immutable request/key belongs to the suborder, not a browser request or admin session.
    await PaymentAudit.create({_id:randomUUID(),orderId:row.orderId,actorId:who.id,action:"refund_submit",outcome:"started",at:new Date()});
    const remote=remoteSchema.parse(await provider(config,`payments/${encodeURIComponent(row.paymentId)}/refund`,{amount:row.amountCents,speed:"normal",receipt:row._id},{"X-Refund-Idempotency":row._id}));
    if(remote.payment_id!==row.paymentId || remote.amount!==row.amountCents || (remote.receipt && remote.receipt!==row._id))fail(409,"REFUND_MISMATCH","Provider refund does not match this obligation");
    // Remember the identifier before a separate verification fetch, even if that fetch times out.
    await update(row,"pending",remote.id);
    const verified=await reconcileRefund(id,config);
    await PaymentAudit.create({_id:randomUUID(),orderId:row.orderId,actorId:who.id,action:"refund_submit",outcome:verified.state,at:new Date()});return verified;
  }catch(error){
    const current=await Refund.findById(id).lean();if(current && !current.providerRefundId)await update(current,"uncertain");
    if(error instanceof AppError && error.code==="PAYMENT_PROVIDER_REJECTED")await Refund.updateOne({_id:id,state:{$ne:"processed"}},{$set:{"recovery.manualReview":true,"recovery.code":error.code,"recovery.nextCheckAt":null}});
    await PaymentAudit.create({_id:randomUUID(),orderId:row.orderId,actorId:who.id,action:"refund_submit",outcome:"uncertain_check_required",code:error instanceof AppError?error.code:"REFUND_CHECK_FAILED",at:new Date()});throw error;
  }
}
export async function reconcileRefundEvent(refundId:string,paymentId:string,receipt:unknown,config:Config){
  const row=await Refund.findOne({paymentId,$or:[{providerRefundId:refundId},...(typeof receipt==="string" ? [{_id:receipt}] : [])]}).lean();
  if(!row)fail(503,"REFUND_MAPPING_PENDING","Refund mapping unavailable; retry webhook later");credentials(row,config);
  return accept(row,await provider(config,`payments/${encodeURIComponent(row.paymentId)}/refunds/${encodeURIComponent(z.string().regex(/^rfnd_[A-Za-z0-9]+$/).parse(refundId))}`),refundId);
}
export function refundAdminRoutes(config:Config){
  const router=Router();router.use((_req,res,next)=>{res.setHeader("Cache-Control","private, no-store");next();});
  router.get("/payments/:id/refunds",async(req,res)=>{const rows=await Refund.find({orderId:z.uuid().parse(req.params.id)}).sort({createdAt:1,_id:1}).limit(100).lean();res.json(rows.map(row=>refundDto(row,config)));});
  router.post("/refunds/:id/submit",async(req,res)=>{z.object({confirmRefund:z.literal(true)}).strict().parse(req.body);await throttle(`refund-admin:${actor(req).id}`,config,30);res.json(refundDto(await submitRefund(actor(req),z.uuid().parse(req.params.id),config),config));});
  router.post("/refunds/:id/reconcile",async(req,res)=>{z.object({}).strict().parse(req.body);await throttle(`refund-admin:${actor(req).id}`,config,30);const id=z.uuid().parse(req.params.id),prior=await Refund.findById(id).lean();if(!prior)fail(404,"NOT_FOUND","Refund not found");await PaymentAudit.create({_id:randomUUID(),orderId:prior.orderId,actorId:actor(req).id,action:"refund_reconcile",outcome:"started",at:new Date()});try{const row=await reconcileRefund(id,config);await PaymentAudit.create({_id:randomUUID(),orderId:row.orderId,actorId:actor(req).id,action:"refund_reconcile",outcome:row.state,at:new Date()});res.json(refundDto(row,config));}catch(error){await PaymentAudit.create({_id:randomUUID(),orderId:prior.orderId,actorId:actor(req).id,action:"refund_reconcile",outcome:"check_failed",at:new Date()});throw error;}});
  return router;
}
