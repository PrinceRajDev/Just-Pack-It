import {Router} from "express";
import {Schema,model} from "mongoose";
import {z} from "zod";
import type {Config} from "../config/env.js";
import {actor,requireRole} from "../auth/middleware.js";
import {emailAvailable} from "../auth/email-otp.js";
import {transaction} from "../catalogue/service.js";
import {audit} from "../admin/audit.js";
import {fail} from "../common/errors.js";
export const settingsId="00000000-0000-4000-8000-000000000001";
interface SettingsRecord {_id:string;supportEmail:string;supportPhone:string;supportHours:string;noticeEnabled:boolean;noticeText:string;version:number;updatedAt?:Date;updatedBy?:string}
export const PlatformSettings=model<SettingsRecord>("PlatformSettings",new Schema<SettingsRecord>({_id:String,supportEmail:{type:String,default:""},supportPhone:{type:String,default:""},supportHours:{type:String,default:""},noticeEnabled:{type:Boolean,default:false},noticeText:{type:String,default:""},version:{type:Number,default:0},updatedAt:Date,updatedBy:String},{versionKey:false}));
const defaults:SettingsRecord={_id:settingsId,supportEmail:"",supportPhone:"",supportHours:"",noticeEnabled:false,noticeText:"",version:0};
const fields=(s:SettingsRecord)=>({supportEmail:s.supportEmail,supportPhone:s.supportPhone,supportHours:s.supportHours,noticeEnabled:s.noticeEnabled,noticeText:s.noticeText});
const configuration=(c:Config)=>({codEnabled:c.ORDERS_COD_ENABLED,onlineEnabled:c.RAZORPAY_ENABLED,paymentMode:c.RAZORPAY_ENABLED ? c.RAZORPAY_KEY_ID?.startsWith("rzp_live_") ? "live" : "test" : "disabled",refundsEnabled:c.RAZORPAY_REFUNDS_ENABLED,platformDeliveryEnabled:c.PLATFORM_DELIVERY_ENABLED,emailOtpRequired:c.EMAIL_OTP_REQUIRED,emailConfigured:emailAvailable(c),pushEnabled:c.FIREBASE_PUSH_ENABLED,imageProvider:c.IMAGE_STORAGE_PROVIDER,imageConfigured:c.IMAGE_STORAGE_PROVIDER==="r2" ? !!(c.CLOUDFLARE_ACCOUNT_ID && c.CLOUDFLARE_R2_ACCESS_KEY_ID && c.CLOUDFLARE_R2_SECRET_ACCESS_KEY && c.CLOUDFLARE_R2_BUCKET && c.CLOUDFLARE_R2_PUBLIC_BASE_URL) : !!(c.CLOUDFLARE_ACCOUNT_ID && c.CLOUDFLARE_IMAGES_API_TOKEN && c.CLOUDFLARE_IMAGES_ACCOUNT_HASH),inventoryWorkerEnabled:c.INVENTORY_EXPIRY_WORKER_ENABLED,paymentWorkerEnabled:c.PAYMENT_RECOVERY_WORKER_ENABLED});
const read=async()=>await PlatformSettings.findById(settingsId).lean() ?? defaults;
export function platformPublicRoutes(){const router=Router();router.get("/",async(req,res)=>{z.object({}).strict().parse(req.query);const s=await read();res.setHeader("Cache-Control","no-store");res.json({...fields(s),noticeText:s.noticeEnabled?s.noticeText:""});});return router;}
export function platformAdminRoutes(config:Config){const router=Router();router.use("/platform-settings",requireRole("admin"));
 router.get("/platform-settings",async(req,res)=>{z.object({}).strict().parse(req.query);const s=await read();res.json({...fields(s),version:s.version,updatedAt:s.updatedAt?.toISOString() ?? null,configuration:configuration(config)});});
 router.patch("/platform-settings",async(req,res)=>{
  const input=z.object({version:z.number().int().nonnegative(),supportEmail:z.union([z.literal(""),z.email().max(254)]).transform(v=>v.toLowerCase()),supportPhone:z.union([z.literal(""),z.string().regex(/^\+[1-9]\d{9,14}$/)]),supportHours:z.string().trim().max(100),noticeEnabled:z.boolean(),noticeText:z.string().trim().max(300),reason:z.string().trim().min(10).max(500)}).strict().refine(v=>!v.noticeEnabled || v.noticeText.length>0,{path:["noticeText"],message:"Enabled announcement requires text"}).parse(req.body),who=actor(req);
  try{const saved=await transaction(async session=>{
   const current=await PlatformSettings.findById(settingsId).session(session).lean();if((current?.version ?? 0)!==input.version)fail(409,"VERSION_CONFLICT","Platform settings changed; reload before publishing");
   const data={supportEmail:input.supportEmail,supportPhone:input.supportPhone,supportHours:input.supportHours,noticeEnabled:input.noticeEnabled,noticeText:input.noticeText,version:input.version+1,updatedAt:new Date(),updatedBy:who.id};
   const updated=current ? await PlatformSettings.findOneAndUpdate({_id:settingsId,version:input.version},{$set:data},{session,returnDocument:"after"}).lean() : (await PlatformSettings.create([{_id:settingsId,...data}],{session}))[0];
   if(!updated)fail(409,"VERSION_CONFLICT","Platform settings changed; reload before publishing");
   await audit(who,"platform.settings.update",settingsId,session,updated.version,input.reason);return updated;
  });res.json({...fields(saved),version:saved.version,updatedAt:saved.updatedAt?.toISOString() ?? null,configuration:configuration(config)});
  }catch(e){if(e && typeof e==="object" && "code" in e && e.code===11000)fail(409,"VERSION_CONFLICT","Platform settings changed; reload before publishing");throw e;}
 });return router;}
