import {createHash} from "node:crypto";
import type {ClientSession} from "mongoose";
import type {Actor} from "../auth/middleware.js";
import {Order,type OrderRecord,type SubOrderRecord} from "../orders/models.js";
import {Shop} from "../catalogue/models.js";
import {InventoryReservation} from "../inventory/models.js";
import {OnlinePayment} from "../payments/razorpay.js";
import {Refund} from "../payments/refund-model.js";
import {SupportTicket} from "../support/routes.js";
import {fail,AppError} from "../common/errors.js";
import {transaction} from "../catalogue/service.js";
import {audit} from "../admin/audit.js";
import {Settlement,Journal,Remittance,Payout,type SettlementSource} from "./models.js";
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function snapshot(order:OrderRecord,sub:SubOrderRecord,session?:ClientSession):Promise<SettlementSource>{
 if(order.testMode||sub.status!=="delivered")fail(409,"SETTLEMENT_UNAVAILABLE","Only delivered live shop orders qualify");
 const shop=await Shop.findById(sub.shopId).session(session??null).lean();if(!shop)fail(409,"SETTLEMENT_PROOF_MISSING","Shop ownership proof missing");
 const subtotal=sub.lines.reduce((sum,l)=>sum+l.qty*l.priceCents,0),gross=sub.itemsSubtotalCents+sub.deliveryFeeCents;
 if(!Number.isSafeInteger(gross)||gross<=0||subtotal!==sub.itemsSubtotalCents||sub.deliveryFeeCents<0||(sub.fulfilment==="pickup"&&sub.deliveryFeeCents!==0))fail(409,"SETTLEMENT_PROOF_MISSING","Order amounts do not reconcile");
 const hold=await InventoryReservation.findOne({_id:order.reservationId,state:"committed",orderId:order._id,buyerId:order.buyerId}).session(session??null).lean();
 const identity=(lines:{productId:string;variantId?:string;qty:number;priceCents:number}[])=>JSON.stringify(lines.map(l=>[l.productId,l.variantId??null,l.qty,l.priceCents]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
 if(!hold||identity(hold.lines.filter(l=>l.shopId===sub.shopId))!==identity(sub.lines))fail(409,"SETTLEMENT_PROOF_MISSING","Committed line amounts do not reconcile");
 if(!(sub.receipt?.consumedAt instanceof Date)||!(sub.receipt.buyerConfirmedAt instanceof Date))fail(409,"SETTLEMENT_PROOF_MISSING","Completed buyer receipt proof missing");
 let paymentProof:string|undefined,partnerId:string|undefined;
 if(order.paymentMethod==="cod"){
 const cash=sub.cashCollection;if(!cash||!(sub.receipt?.consumedAt instanceof Date)||!(cash.buyerConfirmedAt instanceof Date)||!(sub.receipt.buyerConfirmedAt instanceof Date)||cash.amountCents!==gross||cash.buyerConfirmedAt.getTime()!==sub.receipt.buyerConfirmedAt.getTime())fail(409,"SETTLEMENT_PROOF_MISSING","Verified receipt/cash acknowledgement missing");
 if(sub.fulfilment==="platform_delivery"){partnerId=sub.delivery?.partnerId;if(!partnerId||sub.delivery?.state!=="delivered"||cash.reportedBy!==partnerId)fail(409,"SETTLEMENT_PROOF_MISSING","Delivery collector proof mismatch");}else if(cash.reportedBy!==shop.ownerId)fail(409,"SETTLEMENT_PROOF_MISSING","Seller collector proof mismatch");paymentProof=cash.id;
 }else{
 const payment=await OnlinePayment.findOne({_id:order._id,state:"paid"}).session(session??null).lean();if(order.paymentStatus!=="paid"||!payment?.providerPaymentId||payment.amountCents!==order.totalCents||payment.buyerId!==order.buyerId||!payment.paidAt||!payment.keyId.startsWith("rzp_live_"))fail(409,"SETTLEMENT_PROOF_MISSING","Verified captured payment proof missing");paymentProof=payment.providerPaymentId;
 }
 const platform=sub.fulfilment==="platform_delivery"?sub.deliveryFeeCents:0,seller=gross-platform,retained=order.paymentMethod==="cod"&&!partnerId?seller:0;
 const fingerprint=hash([order._id,sub._id,shop.ownerId,sub.shopId,sub.fulfilment,order.paymentMethod,gross,seller,platform,partnerId,paymentProof]);
 return{_id:sub._id,orderId:order._id,shopId:sub.shopId,sellerId:shop.ownerId,shopName:sub.shopName,partnerId,method:order.paymentMethod,fulfilment:sub.fulfilment,grossCents:gross,sellerCents:seller,platformCents:platform,retainedCents:retained,fingerprint,policy:"zero_commission_v1",createdAt:new Date()};
}
export async function lockedSource(id:string,session:ClientSession){const order=await Order.findOneAndUpdate({"subOrders._id":id,testMode:{$ne:true}},{$inc:{settlementRevision:1}},{session,returnDocument:"after"}).lean();if(!order)fail(404,"NOT_FOUND","Live shop order not found");const sub=order.subOrders.find(s=>s._id===id)!;return snapshot(order,sub,session);}
export async function journal(id:string,sourceId:string,kind:string,actorId:string,entries:{account:string;deltaCents:number}[],session:ClientSession){
 const effective=entries.filter(e=>e.deltaCents!==0);if(!effective.length||effective.some(e=>!Number.isSafeInteger(e.deltaCents))||effective.reduce((sum,e)=>sum+e.deltaCents,0)!==0)fail(409,"LEDGER_INVARIANT","Journal entries do not balance");
 await Journal.create([{_id:id,sourceId,kind,actorId,createdAt:new Date(),entries:effective}],{session});
}
export async function payoutHold(source:SettlementSource,session?:ClientSession){
 if(source.retainedCents)return"Seller already retained this COD; no second payout is due.";
 if(await Refund.exists({_id:source._id}).session(session??null))return"Refund record requires financial review.";
 if(await SupportTicket.exists({suborderId:source._id,status:{$ne:"resolved"}}).session(session??null))return"An unresolved support issue holds this payout.";
 if(source.partnerId&&!await Remittance.exists({_id:source._id,state:"received"}).session(session??null))return"Full partner cash handover has not been acknowledged by admin.";
 return null;
}
export async function postSource(who:Actor,id:string,version:number){return transaction(async session=>{
 const current=await lockedSource(id,session),order=await Order.findById(current.orderId).session(session).lean(),sub=order!.subOrders.find(s=>s._id===id)!;
 const previous=await Settlement.findById(id).session(session).lean();if(previous){if(previous.fingerprint!==current.fingerprint)fail(409,"SOURCE_CHANGED","Posted source changed; financial review required");return{posted:true};}
 if((sub.version??0)!==version)fail(409,"VERSION_CONFLICT","Order changed; review again");await Settlement.create([current],{session});
 const entries=current.retainedCents?[{account:`memo:seller_collected:${current.shopId}`,deltaCents:current.grossCents},{account:`memo:seller_retained:${current.shopId}`,deltaCents:-current.retainedCents}]:[{account:current.partnerId?`cash:partner:${current.partnerId}`:"clearing:gateway_capture",deltaCents:current.grossCents},{account:`payable:seller:${current.shopId}`,deltaCents:-current.sellerCents},{account:"revenue:platform_delivery",deltaCents:-current.platformCents}];
 await journal(`collection:${id}`,id,"collection",who.id,entries,session);await audit(who,"settlement.post",id,session,version);return{posted:true};
 });}
export async function checkedPosted(id:string,session:ClientSession){const current=await lockedSource(id,session),posted=await Settlement.findById(id).session(session).lean();if(!posted)fail(409,"LEDGER_NOT_POSTED","Admin must review and post this collection first");if(posted.fingerprint!==current.fingerprint)fail(409,"SOURCE_CHANGED","Source changed; financial review required");return posted;}
export function holdMessage(error:unknown){return error instanceof AppError?error.message:"Financial proof could not be checked; retry.";}
export const referenceHash=(reference:string)=>hash(reference.toUpperCase().replace(/[^A-Z0-9]/g,""));

export async function verifySettlementIndexes(){for(const model of [Remittance,Payout]){const indexes=await model.collection.indexes();if(!indexes.some(i=>i.unique&&i.sparse&&i.key.referenceHash===1))fail(503,"LEDGER_INDEXES_REQUIRED","Required ledger reference indexes are missing. Operator must create declared indexes before money records are accepted.");}}
