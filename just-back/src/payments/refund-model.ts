import {Schema,model} from "mongoose";
import {recoverySchema,type RecoveryMetadata} from "./recovery-model.js";
export type RefundState="requested"|"submitting"|"uncertain"|"pending"|"processed"|"failed";
export interface RefundRecord {_id:string;orderId:string;shopId:string;shopName:string;paymentId:string;keyId:string;amountCents:number;testMode:boolean;reason:string;state:RefundState;providerRefundId?:string;leaseUntil?:Date;createdAt:Date;updatedAt:Date;recovery?:RecoveryMetadata}
const schema=new Schema<RefundRecord>({_id:{type:String,required:true},orderId:{type:String,required:true,index:true},shopId:String,shopName:String,paymentId:{type:String,required:true},keyId:{type:String,required:true},amountCents:{type:Number,required:true,min:1},testMode:Boolean,reason:String,state:{type:String,enum:["requested","submitting","uncertain","pending","processed","failed"],required:true},providerRefundId:String,leaseUntil:Date,createdAt:Date,updatedAt:Date},{versionKey:false});
schema.index({createdAt:-1,testMode:1,keyId:1},{name:"report_refund_requests"});
schema.index({providerRefundId:1},{unique:true,sparse:true});
schema.add({recovery:{type:recoverySchema,default:undefined}});
schema.index({state:1,"recovery.nextCheckAt":1,createdAt:1},{name:"refund_recovery_due"});
export const Refund=model<RefundRecord>("Refund",schema);
