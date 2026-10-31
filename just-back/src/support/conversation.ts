import {Router} from "express";
import {Schema,model} from "mongoose";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {actor} from "../auth/middleware.js";
import {throttle} from "../auth/service.js";
import type {Config} from "../config/env.js";
import {fail} from "../common/errors.js";
import {transaction} from "../catalogue/service.js";
import {SupportTicket} from "./routes.js";
import {encodeCursor,decodeCursor} from "../common/cursor.js";
import {audit} from "../admin/audit.js";
import {notify} from "../notifications/service.js";
export interface MessageRecord {_id:string;ticketId:string;actorId:string;role:string;body:string;kind:string;createdAt:Date}
export const SupportMessage=model<MessageRecord>("SupportMessage",new Schema<MessageRecord>({_id:String,ticketId:String,actorId:String,role:String,body:String,kind:String,createdAt:Date},{versionKey:false}));
SupportMessage.schema.index({ticketId:1,createdAt:1,_id:1});
export const messageDto=(r:MessageRecord)=>({id:r._id,role:r.role,body:r.body,kind:r.kind,createdAt:r.createdAt.toISOString()});
export function conversationRoutes(config:Config){const router=Router();
 const owned=async(id:string,who:ReturnType<typeof actor>)=>{if(who.role!=="buyer"&&who.role!=="admin")fail(403,"FORBIDDEN","Buyer or admin required");const t=await SupportTicket.findOne({_id:id,...(who.role==="buyer"?{buyerId:who.id}:{})}).lean();if(!t)fail(404,"NOT_FOUND","Ticket not found");return t;};
 router.get("/:id/messages",async(req,res)=>{const id=z.uuid().parse(req.params.id),who=actor(req);await owned(id,who);const q=z.object({cursor:z.string().max(2048).optional()}).strict().parse(req.query),scope=`support-messages:${who.id}:${id}`,cursor=q.cursor?decodeCursor(q.cursor,scope,"oldest",config.CURSOR_SECRET):undefined;
 const rows=await SupportMessage.find({ticketId:id,...(cursor?{$or:[{createdAt:{$gt:new Date(z.iso.datetime().parse(cursor.key))}},{createdAt:new Date(String(cursor.key)),_id:{$gt:cursor.id}}]}:{})}).sort({createdAt:1,_id:1}).limit(26).maxTimeMS(5000).lean(),page=rows.slice(0,25),last=page.at(-1);res.json({items:page.map(messageDto),next:rows.length>25&&last?encodeCursor({scope,sort:"oldest",key:last.createdAt.toISOString(),id:last._id},config.CURSOR_SECRET):undefined});
 });
 for(const action of ["messages","reopen"] as const)router.post(`/:id/${action}`,async(req,res)=>{const id=z.uuid().parse(req.params.id),who=actor(req),input=z.object({version:z.number().int().nonnegative(),key:z.uuid(),body:z.string().trim().min(action==="reopen"?10:1).max(2000)}).strict().parse(req.body);await owned(id,who);await throttle(`support-message:${who.id}`,config,60);const hash=createHash("sha256").update(`${id}:${who.id}:${input.key}`).digest("hex"),messageId=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
 res.json(await transaction(async session=>{const ticket=await SupportTicket.findOne({_id:id,...(who.role==="buyer"?{buyerId:who.id}:{})}).session(session);if(!ticket)fail(404,"NOT_FOUND","Ticket not found");const previous=await SupportMessage.findById(messageId).session(session).lean();if(previous){if(previous.body!==input.body||previous.kind!==action)fail(409,"IDEMPOTENCY_CONFLICT","Message key used for different content");return{version:ticket.version};}if(ticket.version!==input.version)fail(409,"VERSION_CONFLICT","Ticket changed; refresh before sending");if(action==="reopen"?ticket.status!=="resolved":ticket.status==="resolved")fail(409,"TICKET_STATE",action==="reopen"?"Only resolved tickets can reopen":"Reopen the resolved ticket before replying");
 if(action==="reopen"){if(ticket.note&&!await SupportMessage.exists({ticketId:id,kind:"status",body:ticket.note}).session(session))await recordResolution(id,ticket.updatedBy??"legacy-admin",ticket.note,session);ticket.status="open";ticket.note="";}ticket.version++;ticket.updatedAt=new Date();ticket.updatedBy=who.id;await ticket.save({session});await SupportMessage.create([{_id:messageId,ticketId:id,actorId:who.id,role:who.role,body:input.body,kind:action,createdAt:new Date()}],{session});await audit(who,action==="reopen"?"support.reopen":"support.reply",id,session,ticket.version);await notify(`support:${messageId}`,who.role==="buyer"?{admin:true}:{userId:ticket.buyerId},action==="reopen"?"Support ticket reopened":"New support reply","Open the support ticket to read the update.",who.role==="buyer"?"/admin/support":`/orders/${ticket.orderId}`,session);return{version:ticket.version};}));
 });return router;}
export async function recordResolution(ticketId:string,actorId:string,body:string,session:import("mongoose").ClientSession){await SupportMessage.create([{_id:randomUUID(),ticketId,actorId,role:"admin",body,kind:"status",createdAt:new Date()}],{session});}
