import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {cert,initializeApp,getApps} from "firebase-admin/app";
import {getMessaging} from "firebase-admin/messaging";
import {z} from "zod";
import type {Config} from "../config/env.js";
import {Session,User} from "../auth/models.js";
import {Notification} from "./service.js";
import {PushJob,PushSubscription} from "./push-models.js";
export function firebaseMessaging(config:Config){
  if(!config.FIREBASE_PUSH_ENABLED)throw new Error("Push disabled");
  let app=getApps().find(app=>app.name==="just-pack-it-push");
  if(!app){
    const credentials=z.object({type:z.literal("service_account"),project_id:z.string(),client_email:z.email(),private_key:z.string().startsWith("-----BEGIN PRIVATE KEY-----")}).parse(JSON.parse(readFileSync(config.GOOGLE_APPLICATION_CREDENTIALS!,"utf8")));
    if(credentials.project_id!==config.FIREBASE_PROJECT_ID)throw new Error("Firebase project mismatch");
    app=initializeApp({credential:cert({projectId:credentials.project_id,clientEmail:credentials.client_email,privateKey:credentials.private_key}),projectId:credentials.project_id},"just-pack-it-push");
  }
  return getMessaging(app);
}
export type PushSender=(token:string,tag:string)=>Promise<unknown>;
export async function verifyPushIndexes(){
  const subscriptions=await PushSubscription.collection.indexes(),jobs=await PushJob.collection.indexes();
  if(!subscriptions.some(index=>index.unique && index.key.sessionId===1) || !subscriptions.some(index=>index.key.expiresAt===1 && index.expireAfterSeconds===0) || !jobs.some(index=>index.key.state===1 && index.key.nextAt===1 && index.key.leaseUntil===1))throw new Error("Push indexes missing; run operator-reviewed index migration");
}
export async function sweepPush(config:Config,send?:PushSender){
  const result={sent:0,discarded:0,retry:0,failed:0};
  if(!config.FIREBASE_PUSH_ENABLED)return result;
  const sender=send ?? ((token,tag)=>firebaseMessaging(config).send({token,data:{title:"Just Pack It update",body:"You have a new marketplace update. Sign in to view it.",tag},webpush:{headers:{TTL:"60",Urgency:"normal"}}}));
  for(let i=0;i<20;i++){
    const now=new Date(),leaseId=randomUUID();
    const job=await PushJob.findOneAndUpdate({$or:[{state:"pending",nextAt:{$lte:now}},{state:"sending",leaseUntil:{$lte:now}}]},{$set:{state:"sending",leaseId,leaseUntil:new Date(now.getTime()+120000)},$inc:{attempts:1}},{sort:{nextAt:1,_id:1},returnDocument:"after"}).lean();
    if(!job)break;
    const finish=(fields:Record<string,unknown>)=>PushJob.updateOne({_id:job._id,leaseId},{$set:fields,$unset:{leaseId:1,leaseUntil:1}});
    const sub=await PushSubscription.findOne({_id:job.subscriptionId,userId:job.userId,sessionId:job.sessionId,expiresAt:{$gt:now}}).select("+token").lean();
    const session=sub ? await Session.findOne({_id:job.sessionId,userId:job.userId,expiresAt:{$gt:now}}).lean() : null;
    const user=session ? await User.findOne({_id:job.userId,active:true}).lean() : null;
    const notification=await Notification.findById(job.notificationId).lean();
    if(!sub || !session || !user || (user.authVersion ?? 0)!==(session.authVersion ?? 0) || !notification || !(notification.recipientId===user._id || (notification.admin && user.role==="admin")) || job.expiresAt!<=now || job.attempts!>5){
      await finish({state:"discarded"});result.discarded++;continue;
    }
    try{await sender(sub.token!,job.notificationId!);await finish({state:"sent"});result.sent++;}
    catch(error){
      const code=(error as {code?:string}).code;
      if(["messaging/registration-token-not-registered","messaging/invalid-registration-token"].includes(code ?? "")){
        await PushSubscription.deleteOne({_id:sub._id,sessionId:sub.sessionId});await finish({state:"discarded"});result.discarded++;
      }else if(job.attempts!>=5){await finish({state:"failed"});result.failed++;}
      else{await finish({state:"pending",nextAt:new Date(Date.now()+30000*2**(job.attempts!-1))});result.retry++;}
    }
  }
  return result;
}
