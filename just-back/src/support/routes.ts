import {conversationRoutes,recordResolution,SupportMessage} from "./conversation.js";
import {audit} from "../admin/audit.js";
import {Router} from "express";
import {Schema,model} from "mongoose";
import mongoose from "mongoose";
import {z} from "zod";
import {actor,requireRole} from "../auth/middleware.js";
import {fail} from "../common/errors.js";
import {Order} from "../orders/models.js";
import {notify} from "../notifications/service.js";
import {throttle} from "../auth/service.js";
import type {Config} from "../config/env.js";
const kinds=["missing_item","quality","delivery","payment","other"] as const;
interface TicketRecord {_id:string;buyerId:string;orderId:string;suborderId:string;shopId:string;shopName:string;kind:string;description:string;status:string;version:number;note:string;updatedBy?:string;createdAt:Date;updatedAt:Date}
const schema=new Schema<TicketRecord>({_id:String,buyerId:String,orderId:String,suborderId:String,shopId:String,shopName:String,kind:String,description:String,status:String,version:Number,note:String,updatedBy:String,createdAt:Date,updatedAt:Date},{versionKey:false});
schema.index({buyerId:1,_id:1});schema.index({status:1,_id:1});
export const SupportTicket=model<TicketRecord>("SupportTicket",schema);
const dto=(t:TicketRecord)=>({id:t._id,orderId:t.orderId,suborderId:t.suborderId,shopName:t.shopName,kind:t.kind,description:t.description,status:t.status,version:t.version,note:t.note,createdAt:t.createdAt.toISOString(),updatedAt:t.updatedAt.toISOString()});
export function supportRoutes(config:Config){
 const router=Router();
 router.use(conversationRoutes(config));
 router.get("/",async(req,res)=>{
  const q=z.object({orderId:z.uuid().optional(),after:z.uuid().optional(),status:z.enum(["open","in_progress","resolved"]).optional(),q:z.string().trim().max(100).optional()}).strict().parse(req.query);
  const who=actor(req);if(who.role!=="buyer" && who.role!=="admin")fail(403,"FORBIDDEN","Support is available to buyers and admins");
  const literal=q.q?.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const base={...(who.role==="buyer"?{buyerId:who.id}:{}),...(q.orderId?{orderId:q.orderId}:{}),...(q.status?{status:q.status}:{}),...(q.after?{_id:{$gt:q.after}}:{})};
  const rows=literal?await SupportTicket.aggregate<TicketRecord>([{$match:base},{$lookup:{from:SupportMessage.collection.name,let:{ticketId:"$_id"},pipeline:[{$match:{$expr:{$eq:["$ticketId","$$ticketId"]},body:{$regex:literal,$options:"i"}}},{$limit:1},{$project:{_id:1}}],as:"_messageMatch"}},{$match:{$or:[...["description","note","shopName","orderId","suborderId","kind"].map(field=>({[field]:{$regex:literal,$options:"i"}})),{"_messageMatch.0":{$exists:true}}]}},{$project:{_messageMatch:0}},{$sort:{_id:1}},{$limit:26}]).option({maxTimeMS:5000}):await SupportTicket.find(base).sort({_id:1}).limit(26).maxTimeMS(5000).lean();
  res.json({items:rows.slice(0,25).map(dto),next:rows.length>25?rows[24]!._id:undefined});
 });
 router.post("/",requireRole("buyer"),async(req,res)=>{
  const input=z.object({orderId:z.uuid(),suborderId:z.uuid(),kind:z.enum(kinds),description:z.string().trim().min(10).max(2000)}).strict().parse(req.body),who=actor(req);
  await throttle(`support-create:${who.id}`,config,20);
  const order=await Order.findOne({_id:input.orderId,buyerId:who.id,"subOrders._id":input.suborderId}).lean();if(!order)fail(404,"NOT_FOUND","Order part not found");
  const sub=order.subOrders.find(s=>s._id===input.suborderId)!;
  await mongoose.connection.transaction(async session=>{
   const result=await SupportTicket.updateOne({_id:sub._id},{$setOnInsert:{buyerId:who.id,orderId:order._id,suborderId:sub._id,shopId:sub.shopId,shopName:sub.shopName,kind:input.kind,description:input.description,status:"open",version:0,note:"",createdAt:new Date(),updatedAt:new Date()}},{upsert:true,session});
   if(result.upsertedCount)await audit(who,"support.create",sub._id,session,0);
   if(result.upsertedCount)await notify(`support:${sub._id}`,{admin:true},"Order support requested","A buyer reported an issue with a shop order.","/admin/support",session);
  });
  const ticket=await SupportTicket.findOne({_id:sub._id,buyerId:who.id}).lean();if(!ticket)fail(404,"NOT_FOUND","Ticket not found");res.json(dto(ticket));
 });
 router.patch("/:id",requireRole("admin"),async(req,res)=>{
  const id=z.uuid().parse(req.params.id),input=z.object({version:z.number().int().nonnegative(),status:z.enum(["in_progress","resolved"]),note:z.string().trim().min(3).max(2000)}).strict().parse(req.body);
  await throttle(`support-update:${actor(req).id}`,config,60);
  await mongoose.connection.transaction(async session=>{
   const ticket=await SupportTicket.findOneAndUpdate({_id:id,version:input.version,status:{$ne:"resolved"}},{$set:{status:input.status,note:input.note,updatedBy:actor(req).id,updatedAt:new Date()},$inc:{version:1}},{returnDocument:"after",session});
   if(!ticket)fail(409,"VERSION_CONFLICT","Ticket changed or is resolved. Refresh before retrying.");
   await recordResolution(id,actor(req).id,input.note,session);await audit(actor(req),`support.${input.status}`,id,session,ticket.version);
   await notify(`support:${id}:${ticket.version}`,{userId:ticket.buyerId},"Support ticket updated",input.status==="resolved"?"Admin has recorded a resolution. Review your order for details.":"Admin is reviewing your order issue.",`/orders/${ticket.orderId}`,session);
  });res.status(204).end();
 });return router;
}
