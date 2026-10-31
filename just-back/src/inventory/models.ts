import {Schema,model} from "mongoose";
export interface HeldLine {productId:string;variantId?:string;shopId:string;qty:number;priceCents:number}
export interface ReservationRecord {
  _id:string;buyerId:string;fingerprint:string;state:"held"|"released"|"expired"|"committed";orderId?:string;
  createdAt:Date;expiresAt:Date;releasedAt?:Date;lines:HeldLine[];
  failureCount?:number;nextAttemptAt?:Date;lastFailureCode?:string;
}
const line=new Schema<HeldLine>({productId:{type:String,required:true},variantId:String,shopId:{type:String,required:true},qty:{type:Number,required:true,min:1},priceCents:{type:Number,required:true,min:1}},{_id:false});
const schema=new Schema<ReservationRecord>({
  _id:{type:String,required:true},buyerId:{type:String,required:true},fingerprint:{type:String,required:true},
  state:{type:String,enum:["held","released","expired","committed"],required:true},orderId:String,createdAt:{type:Date,required:true},expiresAt:{type:Date,required:true},releasedAt:Date,lines:{type:[line],required:true},
  failureCount:{type:Number,default:0},nextAttemptAt:Date,lastFailureCode:String,
},{versionKey:false});
schema.index({state:1,expiresAt:1,_id:1});
schema.index({"lines.productId":1,state:1});
schema.index({buyerId:1,createdAt:-1});
export const InventoryReservation=model<ReservationRecord>("InventoryReservation",schema);
