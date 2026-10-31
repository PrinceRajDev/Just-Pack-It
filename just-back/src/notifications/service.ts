import {createHash} from "node:crypto";
import {Schema,model,type ClientSession} from "mongoose";
import {PushSubscription,PushJob,pushId} from "./push-models.js";
interface NotificationRecord {_id:string;recipientId?:string;admin?:boolean;title:string;body:string;link:string;createdAt:Date}
const schema=new Schema<NotificationRecord>({_id:String,recipientId:String,admin:Boolean,title:String,body:String,link:String,createdAt:Date},{versionKey:false});
schema.index({recipientId:1,createdAt:-1,_id:-1});schema.index({admin:1,createdAt:-1,_id:-1});
export const Notification=model<NotificationRecord>("Notification",schema);
const readSchema=new Schema({_id:String,userId:String,notificationId:String,readAt:Date},{versionKey:false});
readSchema.index({userId:1,notificationId:1},{unique:true});
export const NotificationRead=model("NotificationRead",readSchema);
const id=(key:string)=>{const hash=createHash("sha256").update(key).digest("hex");return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;};
export const notificationEventId=id;
export async function notify(key:string,recipient:{userId:string}|{admin:true},title:string,body:string,link:string,session:ClientSession){
  const now=new Date();
  const result=await Notification.updateOne({_id:id(key)},{$setOnInsert:{...( "userId" in recipient ? {recipientId:recipient.userId} : {admin:true}),title,body,link,createdAt:now}},{upsert:true,session});
  if(result.upsertedCount){
    const subscriptions=await PushSubscription.find({...("userId" in recipient ? {userId:recipient.userId} : {role:"admin"}),expiresAt:{$gt:now}}).session(session).lean();
    for(const sub of subscriptions)await PushJob.updateOne({_id:pushId(`${id(key)}:${sub._id}:${sub.sessionId}`)},{$setOnInsert:{subscriptionId:sub._id,userId:sub.userId,sessionId:sub.sessionId,notificationId:id(key),state:"pending",attempts:0,nextAt:now,expiresAt:new Date(now.getTime()+3600000),purgeAt:new Date(now.getTime()+7*86400000)}},{session,upsert:true});
  }
}
export const readId=(userId:string,notificationId:string)=>id(`${userId}:${notificationId}`);
