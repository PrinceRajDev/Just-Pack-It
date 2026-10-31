import {randomUUID} from "node:crypto";
import {z} from "zod";
import type {Config} from "../config/env.js";
import {AppError} from "../common/errors.js";
import {OnlinePayment,PaymentAudit,reconcilePayment} from "./razorpay.js";
import {Refund} from "./refund-model.js";
import {reconcileRefund} from "./refunds.js";
import type {RecoveryMetadata} from "./recovery-model.js";
import mongoose from "mongoose";
import {notify} from "../notifications/service.js";
interface Row {_id:string;orderId?:string;state:string;createdAt:Date;recovery?:RecoveryMetadata}
interface Source {kind:"payment"|"refund";candidates:()=>Promise<Row[]>;claim:(id:string,token:string)=>Promise<Row|null>;current:(id:string)=>Promise<Row|null>;finish:(id:string,token:string,fields:Record<string,unknown>)=>Promise<void>;run:(id:string)=>Promise<unknown>}
export async function verifyRecoveryIndexes(){
  for(const [model,name] of [[OnlinePayment,"payment_recovery_due"],[Refund,"refund_recovery_due"]] as const){const indexes=await model.collection.indexes();if(!indexes.some(index=>index.name===name))throw new Error("Payment recovery due index missing");}
}
export async function sweepPaymentRecovery(config:Config,options:{limit?:number;shouldStop?:()=>boolean}={}){
  const limit=z.number().int().min(1).max(20).parse(options.limit ?? 10);
  const result={examined:0,claimed:0,completed:0,failed:0,review:0};
  if(!config.PAYMENT_RECOVERY_WORKER_ENABLED || !config.RAZORPAY_ENABLED || !config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET)return result;
  const now=new Date();
  const due={$and:[{$or:[{"recovery.nextCheckAt":{$exists:false}},{"recovery.nextCheckAt":{$lte:now}}]},{$or:[{"recovery.leaseUntil":{$exists:false}},{"recovery.leaseUntil":{$lte:now}}]}]};
  const paymentFilter={keyId:config.RAZORPAY_KEY_ID,state:{$in:["ready","uncertain"] as const},providerOrderId:{$exists:true},...due};
  const refundFilter={keyId:config.RAZORPAY_KEY_ID,state:{$in:["pending","uncertain"] as const},providerRefundId:{$exists:true},...due};
  const lease=(token:string)=>({"recovery.leaseId":token,"recovery.leaseUntil":new Date(Date.now()+120_000)});
  const sources:Source[]=[
    {kind:"payment",candidates:async()=>await OnlinePayment.find(paymentFilter).sort({"recovery.nextCheckAt":1,createdAt:1,_id:1}).limit(limit).maxTimeMS(5000).lean(),claim:async(id,token)=>await OnlinePayment.findOneAndUpdate({_id:id,...paymentFilter},{$set:lease(token)},{returnDocument:"after"}).lean(),current:async id=>await OnlinePayment.findById(id).lean(),finish:async(id,token,fields)=>{await OnlinePayment.updateOne({_id:id,"recovery.leaseId":token},{$set:fields,$unset:{"recovery.leaseId":1,"recovery.leaseUntil":1}});},run:id=>reconcilePayment(id,config)},
    {kind:"refund",candidates:async()=>await Refund.find(refundFilter).sort({"recovery.nextCheckAt":1,createdAt:1,_id:1}).limit(limit).maxTimeMS(5000).lean(),claim:async(id,token)=>await Refund.findOneAndUpdate({_id:id,...refundFilter},{$set:lease(token)},{returnDocument:"after"}).lean(),current:async id=>await Refund.findById(id).lean(),finish:async(id,token,fields)=>{await Refund.updateOne({_id:id,"recovery.leaseId":token},{$set:fields,$unset:{"recovery.leaseId":1,"recovery.leaseUntil":1}});},run:id=>reconcileRefund(id,config)},
  ];
  for(const source of sources){
    if(options.shouldStop?.())break;
    const rows=await source.candidates();result.examined+=rows.length;
    for(const candidate of rows){
      if(options.shouldStop?.())break;
      const token=randomUUID(),row=await source.claim(candidate._id,token);if(!row)continue;result.claimed++;
      let code:string,failures=0;
      try{await source.run(row._id);result.completed++;code=source.kind==="payment" ? "PAYMENT_CHECKED" : "REFUND_CHECKED";}
      catch(error){result.failed++;failures=(row.recovery?.failures ?? 0)+1;code=error instanceof AppError ? error.code : "RECOVERY_CHECK_FAILED";}
      const latest=await source.current(row._id);if(!latest)continue;
      const finished=new Date(),terminal=source.kind==="payment" ? latest.state==="paid" : ["processed","failed"].includes(latest.state);
      if(terminal){failures=0;code=latest.state==="failed" ? "REFUND_FAILED" : "TERMINAL_STATE_VERIFIED";}
      const stale=finished.getTime()-row.createdAt.getTime()>(source.kind==="payment" ? 86_400_000 : 14*86_400_000);
      const review=latest.state==="failed" || (!terminal && (stale || failures>=8));if(review)result.review++;
      const delay=review ? 3_600_000 : failures ? Math.min(3_600_000,60_000*2**Math.min(failures-1,6)) : 60_000;
      await source.finish(row._id,token,{"recovery.lastCheckedAt":finished,"recovery.nextCheckAt":terminal ? null : new Date(finished.getTime()+delay),"recovery.failures":failures,"recovery.manualReview":review,"recovery.code":code});
      await PaymentAudit.create({_id:randomUUID(),orderId:source.kind==="payment" ? row._id : row.orderId,action:`recovery_${source.kind}_check`,outcome:terminal ? latest.state : failures ? "retry_scheduled" : "still_pending",code,at:finished});
      if(review)await mongoose.connection.transaction(async session=>{
        await notify(`recovery:${source.kind}:${row._id}:review`,{admin:true},"Payment operations review needed","A payment or refund requires manual review. Check online payments for the current state.","/admin/finance",session);
      });
    }
  }
  return result;
}
