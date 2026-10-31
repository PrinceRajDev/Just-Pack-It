import {createHmac,randomInt,randomUUID,timingSafeEqual} from "node:crypto";
import {Schema,model,type ClientSession} from "mongoose";
import {z} from "zod";
import type {Config} from "../config/env.js";
import {fail} from "../common/errors.js";
import {throttle,tokenHash} from "./service.js";
import {Throttle,User} from "./models.js";
import { emailFailureCategory } from "./email-diagnostics.js";
export const emailAddress=z.email().max(254).transform(value=>value.trim().toLowerCase());
export const emailProofFields={email:emailAddress.optional(),emailChallengeId:z.uuid().optional(),emailOtp:z.string().regex(/^\d{6}$/).optional()};
export const EmailChallenge=model("EmailChallenge",new Schema({_id:String,target:{type:String,index:true},email:String,purpose:String,userId:String,authVersion:Number,digest:{type:String,select:false},state:String,attempts:{type:Number,default:0},expiresAt:{type:Date,index:{expireAfterSeconds:0}}},{versionKey:false}));
export const EmailCooldown=model("EmailCooldown",new Schema({_id:String,expiresAt:{type:Date,index:{expireAfterSeconds:0}}},{versionKey:false}));
export const emailAvailable=(config:Config)=>!!(config.EMAIL_OTP_SECRET && config.BREVO_API_KEY && config.EMAIL_FROM);
export async function verifyEmailIndexes(){
  const users=await User.collection.indexes(),challenges=await EmailChallenge.collection.indexes(),cooldowns=await EmailCooldown.collection.indexes();
  if(!users.some(index=>index.unique && index.key.email===1 && index.partialFilterExpression?.email?.$type==="string") || !challenges.some(index=>index.key.expiresAt===1 && index.expireAfterSeconds===0) || !cooldowns.some(index=>index.key.expiresAt===1 && index.expireAfterSeconds===0))throw new Error("Email verification indexes are missing");
}
export async function deliverEmailOtp(email:string,code:string,config:Config,purpose="signup"){
  const action=purpose==="recovery" ? "password reset" : "signup";
  let rejectionLogged=false;
  try {
  const response=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{"api-key":config.BREVO_API_KEY!,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({sender:{email:config.EMAIL_FROM,name:"Just Pack It"},to:[{email}],subject:purpose==="recovery" ? "Just Pack It — reset your password" : "Just Pack It — verify your email",textContent:`Your Just Pack It ${action} code is ${code}. It expires in 10 minutes. Never share this code. If you did not request ${action}, ignore this email.`}),signal:AbortSignal.timeout(15000),redirect:"error"});
  const result=await response.json().catch(()=>null);
  if(response.status!==201 || typeof result?.messageId!=="string" || !result.messageId) {
    console.warn(JSON.stringify({ event: "email_provider_failure", provider: "brevo", status: response.status, category: emailFailureCategory(response.status, result?.code) }));
    rejectionLogged=true;
    throw new Error("Email provider submission not confirmed");
  }
  } catch {
    if (!rejectionLogged) console.warn(JSON.stringify({ event: "email_provider_failure", provider: "brevo", category: "network_timeout_or_transport" }));
    throw new Error("Email provider submission not confirmed");
  }
}
const digest=(id:string,code:string,config:Config)=>createHmac("sha256",config.EMAIL_OTP_SECRET!).update(`${id}:${code}`).digest("hex");
export type EmailSender=(email:string,code:string)=>Promise<void>;
export function emailTestWindow(email:string,config:Config,now=Date.now()){
  const until=Date.parse(config.EMAIL_OTP_TEST_UNTIL ?? "");
  return !!config.EMAIL_OTP_TEST_RECIPIENT && email===config.EMAIL_OTP_TEST_RECIPIENT.trim().toLowerCase() && until>now && until-now<=86400000;
}
export async function sendSignupEmail(email:string,ip:string,config:Config,sender?:EmailSender,purpose:"signup"|"recovery"="signup"){
  if(!emailAvailable(config))fail(503,"EMAIL_OTP_UNAVAILABLE","Email verification is not configured yet");
  email=emailAddress.parse(email);const target=tokenHash(`email:${purpose}:${email}`,config),now=new Date();
  const testing=purpose==="signup" && emailTestWindow(email,config);
  if(!testing){await throttle(`email-otp-ip:${ip}`,config,10);await throttle(`email-otp:${target}`,config,3);}
  const quota=await Throttle.findOneAndUpdate({_id:tokenHash(`email-daily:${now.toISOString().slice(0,10)}`,config)},{$inc:{count:1},$setOnInsert:{expiresAt:new Date(now.getTime()+2*86400000)}},{upsert:true,returnDocument:"after"});
  if(quota.count>config.EMAIL_OTP_DAILY_LIMIT)fail(429,"EMAIL_DAILY_LIMIT","Email verification daily limit reached; try later");
  try{if(!testing)await EmailCooldown.findOneAndUpdate({_id:target,expiresAt:{$lte:now}},{$set:{expiresAt:new Date(now.getTime()+60000)}},{upsert:true});}
  catch(error){if((error as {code?:number}).code===11000)fail(429,"OTP_RESEND_WAIT","Wait 60 seconds before requesting another code");throw error;}
  await EmailChallenge.updateMany({target,state:{$in:["sent","sending"]}},{$set:{state:"superseded"}});
  const id=randomUUID(),code=String(randomInt(0,1000000)).padStart(6,"0"),expiresAt=new Date(now.getTime()+600000);
  const user=purpose==="recovery" ? await User.findOne({email,emailVerifiedAt:{$exists:true},active:true}).lean() : null;
  await EmailChallenge.create({_id:id,target,email,purpose,...(user ? {userId:user._id,authVersion:user.authVersion ?? 0} : {}),digest:digest(id,code,config),state:purpose==="recovery" && !user ? "ineligible" : "sending",attempts:0,expiresAt});
  if(purpose==="recovery" && !user)return {challengeId:id,expiresAt:expiresAt.toISOString(),resendAfterSeconds:60};
  try{
    if(sender)await sender(email,code);
    else await deliverEmailOtp(email,code,config,purpose);
    await EmailChallenge.updateOne({_id:id,state:"sending"},{$set:{state:"sent"}});
  }catch{await EmailChallenge.updateOne({_id:id},{$set:{state:"failed"}});if(purpose!=="recovery")fail(502,"EMAIL_SEND_FAILED","Could not confirm email submission. Retry after 60 seconds; only a new code will be valid.");}
  return {challengeId:id,expiresAt:expiresAt.toISOString(),resendAfterSeconds:60};
}
export interface EmailProof {id:string;email:string;digest:string;purpose:"signup"|"recovery";userId?:string;authVersion?:number}
export async function verifySignupEmail(input:{email?:string;emailChallengeId?:string;emailOtp?:string},config:Config,purpose:"signup"|"recovery"="signup"):Promise<EmailProof|undefined>{
  if(!config.EMAIL_OTP_REQUIRED && purpose==="signup")return undefined;
  if(!emailAvailable(config))fail(503,"EMAIL_OTP_UNAVAILABLE","Email verification is not configured yet");
  if(!input.email || !input.emailChallengeId || !input.emailOtp)fail(400,"EMAIL_VERIFICATION_REQUIRED","Verify your email using the six-digit signup code");
  const row=await EmailChallenge.findOneAndUpdate({_id:input.emailChallengeId,email:input.email,purpose,state:"sent",expiresAt:{$gt:new Date()},attempts:{$lt:5}},{$inc:{attempts:1}},{returnDocument:"after"}).select("+digest").lean();
  if(!row)fail(400,"OTP_INVALID","Code is invalid, expired, used or attempt limit reached");
  const actual=digest(row._id!,input.emailOtp,config),expected=Buffer.from(row.digest!,"hex");
  if(expected.length!==32 || !timingSafeEqual(expected,Buffer.from(actual,"hex")))fail(400,"OTP_INVALID","Code is invalid, expired, used or attempt limit reached");
  return {id:row._id!,email:input.email,digest:actual,purpose,userId:row.userId ?? undefined,authVersion:row.authVersion ?? undefined};
}
export async function consumeEmailProof(proof:EmailProof|undefined,session:ClientSession){
  if(!proof)return {};
  const result=await EmailChallenge.updateOne({_id:proof.id,email:proof.email,purpose:proof.purpose,digest:proof.digest,state:"sent",attempts:{$lte:5},expiresAt:{$gt:new Date()}},{$set:{state:"consumed"}},{session});
  if(result.modifiedCount!==1)fail(400,"OTP_INVALID","Code expired or already used; request another");
  return {email:proof.email,emailVerifiedAt:new Date()};
}
