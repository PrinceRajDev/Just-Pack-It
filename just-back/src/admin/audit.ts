import {Schema,model,type ClientSession} from "mongoose";
import {randomUUID} from "node:crypto";
import type {Actor} from "../auth/middleware.js";
export interface AuditRecord {_id:string;actorId:string;role:string;action:string;targetId:string;version?:number;createdAt:Date;reason?:string}
export const Audit=model<AuditRecord>("MarketplaceAudit",new Schema<AuditRecord>({_id:String,actorId:String,role:String,action:String,targetId:String,version:Number,createdAt:Date,reason:String},{versionKey:false}));
Audit.schema.index({createdAt:-1,_id:-1});
export async function audit(who:Actor,action:string,targetId:string,session:ClientSession,version?:number,reason?:string){await Audit.create([{_id:randomUUID(),actorId:who.id,role:who.role,action,targetId,version,createdAt:new Date(),...(reason?{reason}: {})}],{session});}
