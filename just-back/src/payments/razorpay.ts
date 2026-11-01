import {createHash,createHmac,timingSafeEqual,randomUUID} from "node:crypto";
import {Schema,model} from "mongoose";
import express,{Router} from "express";
import {z} from "zod";
import type {Config} from "../config/env.js";
import {actor,authenticate,requireRole,type Actor} from "../auth/middleware.js";
import {throttle} from "../auth/service.js";
import {fail,AppError} from "../common/errors.js";
import {decodeCursor,encodeCursor} from "../common/cursor.js";
import {transaction} from "../catalogue/service.js";
import {Order,orderDto} from "../orders/models.js";
import {createCodOrder,orderInput} from "../orders/service.js";
import {recoverySchema,recoveryDto,type RecoveryMetadata} from "./recovery-model.js";
import {notify} from "../notifications/service.js";
import {Shop} from "../catalogue/models.js";

interface PaymentRecord {_id:string;buyerId:string;keyId:string;state:"creating"|"uncertain"|"ready"|"paid";providerOrderId?:string;providerPaymentId?:string;amountCents:number;createdAt:Date;paidAt?:Date;recovery?:RecoveryMetadata}
const schema=new Schema<PaymentRecord>({_id:String,buyerId:String,keyId:String,state:{type:String,enum:["creating","uncertain","ready","paid"]},providerOrderId:String,providerPaymentId:String,amountCents:Number,createdAt:Date,paidAt:Date},{versionKey:false});
schema.index({providerOrderId:1},{unique:true,sparse:true});schema.index({providerPaymentId:1},{unique:true,sparse:true});
schema.index({createdAt:-1,_id:-1});
schema.index({state:1,paidAt:-1,keyId:1},{name:"report_captures_paid"});
schema.add({recovery:{type:recoverySchema,default:undefined}});
schema.index({state:1,"recovery.nextCheckAt":1,createdAt:1},{name:"payment_recovery_due"});
export const OnlinePayment=model<PaymentRecord>("OnlinePayment",schema);
export const PaymentAudit=model("PaymentAudit",new Schema({_id:String,orderId:{type:String,index:true},actorId:String,action:String,outcome:String,code:String,reason:String,at:Date},{versionKey:false}));
export const PaymentEvent=model("PaymentEvent",new Schema({_id:String,digest:String,processedAt:Date},{versionKey:false}));
export async function verifyPaymentIndexes(){
  const indexes=await OnlinePayment.collection.indexes(),orders=await Order.collection.indexes();
  for(const field of ["providerOrderId","providerPaymentId"])if(!indexes.some(index=>index.unique && index.sparse && index.key[field]===1))throw new Error("Payment uniqueness index missing");
  if(!orders.some(index=>index.unique && index.name==="one_pending_online_per_buyer"))throw new Error("Pending payment index missing");
}
const providerId=z.string().regex(/^(order|pay)_[A-Za-z0-9]+$/);
export function signatureMatches(body:string|Buffer,signature:string|undefined,secret:string){
  if(!signature || !/^[a-f0-9]{64}$/.test(signature))return false;
  return timingSafeEqual(Buffer.from(signature,"hex"),createHmac("sha256",secret).update(body).digest());
}
function enabled(config:Config){if(!config.RAZORPAY_ENABLED || !config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET || !config.RAZORPAY_WEBHOOK_SECRET)fail(503,"PAYMENTS_UNAVAILABLE","Online payments are unavailable");}
export async function provider(config:Config,path:string,body?:unknown,extraHeaders:Record<string,string>={}):Promise<unknown>{
  try{
    const res=await fetch(`https://api.razorpay.com/v1/${path}`,{method:body ? "POST" : "GET",headers:{Authorization:`Basic ${Buffer.from(`${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`).toString("base64")}`,"Content-Type":"application/json",...extraHeaders},...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(15_000)});
    if(!res.ok){
      if(res.status>=400 && res.status<500 && ![408,429].includes(res.status))fail(502,"PAYMENT_PROVIDER_REJECTED",`Razorpay rejected the provider request (HTTP ${res.status}). Operator review is required; do not create a replacement payment or refund key.`);
      fail(502,"PAYMENT_PROVIDER_UNAVAILABLE","Payment provider request could not be confirmed. Check this order before retrying.");
    }
    return await res.json();
  }catch(error){if(error instanceof AppError)throw error;fail(502,"PAYMENT_PROVIDER_UNAVAILABLE","Payment provider request could not be confirmed. Check this order before retrying.");}
}
const providerOrder=z.object({id:providerId,amount:z.number().int().positive(),currency:z.literal("INR"),receipt:z.string(),status:z.string()});
const providerPayment=z.object({id:providerId,order_id:providerId,amount:z.number().int().positive(),currency:z.literal("INR"),status:z.string(),captured:z.boolean(),amount_refunded:z.number().int().nonnegative().default(0)});
function checkout(payment:PaymentRecord,config:Config){return {orderId:payment._id,keyId:payment.keyId,providerOrderId:payment.providerOrderId ?? null,amount:payment.amountCents,currency:"INR" as const,state:payment.state,testMode:payment.keyId.startsWith("rzp_test_"),reconciliationRequired:payment.state==="uncertain" || payment.state==="creating",enabled:config.RAZORPAY_ENABLED};}

export async function createOnlineOrder(who:Actor,key:string,raw:unknown,config:Config){
  enabled(config);if(who.role!=="buyer")fail(403,"FORBIDDEN","Buyer account required");
  const rawInput=z.object({paymentMethod:z.literal("razorpay")}).passthrough().parse(raw);
  const input=orderInput.parse({...rawInput,paymentMethod:"cod"});
  // One unresolved attempt per buyer. Normal retries must reuse their existing key/order.
  const result=await createCodOrder(who,key,input,"razorpay",config.RAZORPAY_KEY_ID!.startsWith("rzp_test_"),config.PLATFORM_DELIVERY_ENABLED);
  if((result.order.testMode ?? false)!==config.RAZORPAY_KEY_ID!.startsWith("rzp_test_"))fail(409,"PAYMENT_ACCOUNT_CHANGED","Order test/live mode differs from the configured payment account; operator reconciliation required");
  let payment=await OnlinePayment.findById(result.order._id).lean();
  if(payment){if(payment.keyId!==config.RAZORPAY_KEY_ID)fail(409,"PAYMENT_ACCOUNT_CHANGED","Payment account changed; operator reconciliation required");return checkout(payment,config);}
  try{
    [payment]=await OnlinePayment.create([{_id:result.order._id,buyerId:who.id,keyId:config.RAZORPAY_KEY_ID,state:"creating",amountCents:result.order.totalCents,createdAt:new Date()}]);
  }catch(error){if(typeof error==="object" && error && "code" in error && error.code===11000){const existing=await OnlinePayment.findById(result.order._id).lean();if(existing)return checkout(existing,config);}throw error;}
  try{
    const remote=providerOrder.parse(await provider(config,"orders",{amount:payment!.amountCents,currency:"INR",receipt:payment!._id,partial_payment:false,notes:{marketplace_order_id:payment!._id}}));
    if(!remote.id.startsWith("order_") || remote.receipt!==payment!._id || remote.amount!==payment!.amountCents)fail(502,"PAYMENT_PROVIDER_MISMATCH","Provider order does not match this checkout");
    await OnlinePayment.updateOne({_id:payment!._id,state:"creating"},{$set:{providerOrderId:remote.id,state:"ready"}});
  }catch{await OnlinePayment.updateOne({_id:payment!._id,state:"creating"},{$set:{state:"uncertain"}});}
  return checkout((await OnlinePayment.findById(result.order._id).lean())!,config);
}

export async function reconcilePayment(orderId:string,config:Config,paymentId?:string){
  enabled(config);
  const local=await OnlinePayment.findById(orderId).lean();if(!local)fail(404,"NOT_FOUND","Online payment not found");
  if(local.keyId!==config.RAZORPAY_KEY_ID)fail(409,"PAYMENT_ACCOUNT_CHANGED","Payment account changed; operator reconciliation required");
  if(!local.providerOrderId)fail(409,"PAYMENT_RECONCILIATION_REQUIRED","Provider creation is uncertain. Operator reconciliation is required; do not create a replacement payment.");
  const remote=providerOrder.parse(await provider(config,`orders/${encodeURIComponent(local.providerOrderId)}`));
  if(remote.id!==local.providerOrderId || remote.receipt!==local._id || remote.amount!==local.amountCents)fail(409,"PAYMENT_MISMATCH","Provider order does not match the server order");
  let captured: z.infer<typeof providerPayment>|undefined;
  if(paymentId){
    captured=providerPayment.parse(await provider(config,`payments/${encodeURIComponent(providerId.parse(paymentId))}`));
    if(captured.id!==paymentId || !captured.id.startsWith("pay_") || captured.order_id!==local.providerOrderId || captured.amount!==local.amountCents)fail(409,"PAYMENT_MISMATCH","Payment belongs to a different order, identifier or amount");
    if(captured.status!=="captured" || !captured.captured)captured=undefined;
  }else{
    const response=z.object({items:z.array(providerPayment)}).parse(await provider(config,`orders/${encodeURIComponent(local.providerOrderId)}/payments`));
    captured=response.items.find(item=>item.id.startsWith("pay_") && item.order_id===local.providerOrderId && item.amount===local.amountCents && item.status==="captured" && item.captured);
  }
  if(captured){
    if(captured.amount_refunded!==0 && local.state!=="paid")fail(409,"PAYMENT_REFUNDED","Provider reports a refund; operator reconciliation is required");
    const payment=captured;
    await transaction(async session=>{
      const record=await OnlinePayment.findById(orderId).session(session),order=await Order.findOne({_id:orderId,paymentMethod:"razorpay"}).session(session);
      if(!record || !order || order.totalCents!==payment.amount)fail(409,"PAYMENT_MISMATCH","Stored order amount does not match payment");
      if(record.state==="paid"){if(record.providerPaymentId!==payment.id)fail(409,"PAYMENT_MISMATCH","A different payment was already recorded");if(record.recovery){record.recovery.manualReview=false;record.recovery.nextCheckAt=null;await record.save({session});}return;}
      record.state="paid";record.providerPaymentId=payment.id;record.paidAt=new Date();order.paymentStatus="paid";
      if(record.recovery){record.recovery.manualReview=false;record.recovery.nextCheckAt=null;}
      await record.save({session});await order.save({session});
      await notify(`${orderId}:captured`,{userId:order.buyerId},order.testMode ? "Test payment captured" : "Online payment captured",order.testMode ? "Test-mode capture verified. This is not a real purchase." : "Payment capture was verified with Razorpay. Shop acceptance is separate.",`/orders/${orderId}`,session);
      for(const sub of order.subOrders){const shop=await Shop.findById(sub.shopId).session(session);if(shop)await notify(`${orderId}:seller:${sub.shopId}`,{userId:shop.ownerId},order.testMode ? "New test order: do not fulfil" : "New prepaid shop order","Payment capture is verified. Review your shop's part in orders.","/seller/orders",session);}
    });
  }
  return orderDto((await Order.findById(orderId).lean())!);
}
export function razorpayBuyerRoutes(config:Config){
  const router=Router();router.use(authenticate(config),requireRole("buyer"),(_req,res,next)=>{res.setHeader("Cache-Control","private, no-store");next();});
  router.post("/orders",async(req,res)=>{await throttle(`rzp-create:${actor(req).id}`,config,20);res.json(await createOnlineOrder(actor(req),z.string().uuid().parse(req.get("Idempotency-Key")),req.body,config));});
  router.get("/orders/:id",async(req,res)=>{enabled(config);const row=await OnlinePayment.findOne({_id:z.uuid().parse(req.params.id),buyerId:actor(req).id}).lean();if(!row)fail(404,"NOT_FOUND","Online payment not found");if(row.keyId!==config.RAZORPAY_KEY_ID)fail(409,"PAYMENT_ACCOUNT_CHANGED","Payment account changed; operator reconciliation required");res.json(checkout(row,config));});
  router.post("/orders/:id/verify",async(req,res)=>{
    enabled(config);await throttle(`rzp-verify:${actor(req).id}`,config,60);
    const id=z.uuid().parse(req.params.id),row=await OnlinePayment.findOne({_id:id,buyerId:actor(req).id}).lean();if(!row)fail(404,"NOT_FOUND","Online payment not found");
    const input=z.object({razorpay_order_id:providerId,razorpay_payment_id:providerId,razorpay_signature:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.body);
    if(input.razorpay_order_id!==row.providerOrderId || !signatureMatches(`${row.providerOrderId}|${input.razorpay_payment_id}`,input.razorpay_signature,config.RAZORPAY_KEY_SECRET!))fail(400,"INVALID_PAYMENT_SIGNATURE","Payment signature is invalid");
    res.json(await reconcilePayment(id,config,input.razorpay_payment_id));
  });
  router.post("/orders/:id/reconcile",async(req,res)=>{enabled(config);await throttle(`rzp-verify:${actor(req).id}`,config,60);const id=z.uuid().parse(req.params.id);if(!await OnlinePayment.exists({_id:id,buyerId:actor(req).id}))fail(404,"NOT_FOUND","Online payment not found");res.json(await reconcilePayment(id,config));});
  return router;
}
async function recordWebhook(eventId:string,digest:string){
  try{await PaymentEvent.updateOne({_id:eventId,digest},{$setOnInsert:{processedAt:new Date()}},{upsert:true});}
  catch(error){if(typeof error==="object" && error && "code" in error && error.code===11000)fail(409,"WEBHOOK_CONFLICT","Webhook event content changed");throw error;}
}
export function razorpayWebhookRoutes(config:Config){
  const router=Router();
  router.post("/razorpay",express.raw({type:"application/json",limit:"128kb"}),async(req,res)=>{
    enabled(config);if(!Buffer.isBuffer(req.body) || !signatureMatches(req.body,req.get("X-Razorpay-Signature"),config.RAZORPAY_WEBHOOK_SECRET!))fail(400,"INVALID_WEBHOOK_SIGNATURE","Webhook signature is invalid");
    let raw:unknown;try{raw=JSON.parse(req.body.toString("utf8"));}catch{fail(400,"INVALID_WEBHOOK_BODY","Webhook body must be valid JSON");}
    const event=z.object({event:z.string(),payload:z.unknown()}).parse(raw);
    if(!["payment.captured","order.paid","refund.processed","refund.failed"].includes(event.event)){res.json({received:true});return;}
    const eventId=z.string().min(1).max(200).parse(req.get("x-razorpay-event-id")),digest=createHash("sha256").update(req.body).digest("hex");
    const prior=await PaymentEvent.findById(eventId).lean();if(prior){if(prior.digest!==digest)fail(409,"WEBHOOK_CONFLICT","Webhook event content changed");res.json({received:true});return;}
    if(event.event.startsWith("refund.")){
      const refund=z.object({refund:z.object({entity:z.object({id:z.string().regex(/^rfnd_[A-Za-z0-9]+$/),payment_id:z.string().regex(/^pay_[A-Za-z0-9]+$/),receipt:z.string().nullable().optional()})})}).parse(event.payload).refund.entity;
      const {reconcileRefundEvent}=await import("./refunds.js");
      const verified=await reconcileRefundEvent(refund.id,refund.payment_id,refund.receipt,config);
      if(verified.state==="pending")fail(503,"REFUND_STATUS_PENDING","Refund terminal status is not visible yet; retry webhook later");
      await recordWebhook(eventId,digest);res.json({received:true});return;
    }
    const payload=z.object({payment:z.object({entity:z.object({id:providerId,order_id:providerId})})}).parse(event.payload);
    const local=await OnlinePayment.findOne({providerOrderId:payload.payment.entity.order_id}).lean();
    if(!local)fail(503,"PAYMENT_RECONCILIATION_REQUIRED","Provider order mapping unavailable; retry webhook later");
    const verified=await reconcilePayment(local._id,config,payload.payment.entity.id);
    if(verified.paymentStatus!=="paid")fail(503,"PAYMENT_CAPTURE_PENDING","Provider capture is not confirmed yet; retry webhook later");
    await recordWebhook(eventId,digest);res.json({received:true});
  });return router;
}
export function razorpayAdminRoutes(config:Config){
  const router=Router();
  router.use((_req,res,next)=>{res.setHeader("Cache-Control","private, no-store");next();});
  const dto=(row:PaymentRecord)=>({orderId:row._id,state:row.state,amount:row.amountCents,currency:"INR" as const,testMode:row.keyId.startsWith("rzp_test_"),providerOrderId:row.providerOrderId ?? null,providerPaymentId:row.providerPaymentId ?? null,createdAt:row.createdAt.toISOString(),paidAt:row.paidAt?.toISOString() ?? null,accountMatches:row.keyId===config.RAZORPAY_KEY_ID,onlineEnabled:config.RAZORPAY_ENABLED,recovery:recoveryDto(row.recovery)});
  router.get("/payments",async(req,res)=>{
    const query=z.object({state:z.enum(["all","creating","uncertain","ready","paid"]).default("all"),mode:z.enum(["all","test","live"]).default("all"),limit:z.coerce.number().int().min(1).max(100).default(25),cursor:z.string().max(2048).optional()}).strict().parse(req.query);
    const scope=JSON.stringify(["admin-payments",query.state,query.mode]);
    const cursor=query.cursor ? decodeCursor(query.cursor,scope,"newest",config.CURSOR_SECRET) : undefined;
    const filters:Record<string,unknown>[]=[];
    if(query.state!=="all")filters.push({state:query.state});
    if(query.mode!=="all")filters.push({keyId:{$regex:query.mode==="test" ? "^rzp_test_" : "^rzp_live_"}});
    if(cursor){const date=new Date(z.iso.datetime().parse(cursor.key));filters.push({$or:[{createdAt:{$lt:date}},{createdAt:date,_id:{$lt:cursor.id}}]});}
    const records=await OnlinePayment.find(filters.length ? {$and:filters} : {}).sort({createdAt:-1,_id:-1}).limit(query.limit+1).maxTimeMS(5000).lean();
    const more=records.length>query.limit,page=records.slice(0,query.limit);res.setHeader("X-Has-More",String(more));
    if(more){const last=page.at(-1)!;res.setHeader("X-Next-Cursor",encodeCursor({scope,sort:"newest",key:last.createdAt.toISOString(),id:last._id},config.CURSOR_SECRET));}
    res.json(page.map(dto));
  });
  router.get("/payments/:id",async(req,res)=>{
    const row=await OnlinePayment.findById(z.uuid().parse(req.params.id)).lean();if(!row)fail(404,"NOT_FOUND","Online payment not found");
    const audits=await PaymentAudit.find({orderId:row._id}).sort({at:-1,_id:-1}).limit(20).lean();
    res.json({...dto(row),audit:audits.map(entry=>({id:entry._id,action:entry.action,outcome:entry.outcome,code:entry.code ?? null,at:entry.at?.toISOString()}))});
  });
  router.post("/payments/:id/reconcile",async(req,res)=>{
    enabled(config);await throttle(`rzp-admin:${actor(req).id}`,config,30);
    const id=z.uuid().parse(req.params.id),input=z.object({providerOrderId:z.string().regex(/^order_[A-Za-z0-9]+$/).optional(),confirmProviderOrder:z.literal(true).optional(),reason:z.string().trim().min(3).max(300).optional()}).strict().superRefine((value,ctx)=>{if(value.providerOrderId && (!value.confirmProviderOrder || !value.reason))ctx.addIssue({code:"custom",path:["confirmProviderOrder"],message:"Confirm the provider order and supply an operator reason"});}).parse(req.body);
    const local=await OnlinePayment.findById(id).lean();if(!local)fail(404,"NOT_FOUND","Online payment not found");
    const auditId=randomUUID(),action=input.providerOrderId ? "bind_and_reconcile" : "reconcile";
    await PaymentAudit.create({_id:auditId,orderId:id,actorId:actor(req).id,action,outcome:"started",reason:input.reason,at:new Date()});
    try{
    if(input.providerOrderId && local.providerOrderId && input.providerOrderId!==local.providerOrderId)fail(409,"PAYMENT_MAPPING_CONFLICT","A different provider order is already attached. Reload payment details.");
    if(input.providerOrderId && !local.providerOrderId){
      const remote=providerOrder.parse(await provider(config,`orders/${encodeURIComponent(input.providerOrderId)}`));
      if(!remote.id.startsWith("order_") || remote.receipt!==id || remote.amount!==local.amountCents || local.keyId!==config.RAZORPAY_KEY_ID)fail(409,"PAYMENT_MISMATCH","Provider order does not match this checkout");
      await transaction(async session=>{
        const bound=await OnlinePayment.findOneAndUpdate({_id:id,keyId:config.RAZORPAY_KEY_ID,providerOrderId:{$exists:false},state:{$in:["creating","uncertain"]}},{$set:{providerOrderId:remote.id,state:"ready"}},{session,returnDocument:"after"});
        if(!bound){const current=await OnlinePayment.findById(id).session(session);if(current?.providerOrderId!==remote.id)fail(409,"PAYMENT_MAPPING_CONFLICT","Payment mapping changed. Reload before retrying.");}
        await PaymentAudit.create([{_id:randomUUID(),orderId:id,actorId:actor(req).id,action:"provider_order_bound",outcome:"verified",at:new Date()}],{session});
      });
    }
    const result=await reconcilePayment(id,config);
    await PaymentAudit.create({_id:randomUUID(),orderId:id,actorId:actor(req).id,action,outcome:result.paymentStatus==="paid" ? "captured_verified" : "not_captured",at:new Date()});
    res.json(result);
    }catch(error){await PaymentAudit.create({_id:randomUUID(),orderId:id,actorId:actor(req).id,action,outcome:"failed",code:error instanceof AppError ? error.code : "RECONCILIATION_FAILED",at:new Date()});throw error;}
  });return router;
}
