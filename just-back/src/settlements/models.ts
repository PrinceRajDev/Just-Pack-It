import {Schema,model} from "mongoose";
export interface SettlementSource {_id:string;orderId:string;shopId:string;sellerId:string;shopName:string;partnerId?:string;method:"cod"|"razorpay";fulfilment:string;grossCents:number;sellerCents:number;platformCents:number;retainedCents:number;fingerprint:string;policy:"zero_commission_v1";createdAt:Date}
export const Settlement=model<SettlementSource>("SettlementSource",new Schema<SettlementSource>({_id:String,orderId:String,shopId:String,sellerId:String,shopName:String,partnerId:String,method:String,fulfilment:String,grossCents:Number,sellerCents:Number,platformCents:Number,retainedCents:Number,fingerprint:String,policy:String,createdAt:Date},{versionKey:false}));
Settlement.schema.index({shopId:1,_id:1});Settlement.schema.index({partnerId:1,_id:1});
export interface JournalRecord {_id:string;sourceId:string;kind:string;actorId:string;createdAt:Date;entries:{account:string;deltaCents:number}[]}
export const Journal=model<JournalRecord>("SettlementJournal",new Schema<JournalRecord>({_id:String,sourceId:String,kind:String,actorId:String,createdAt:Date,entries:[new Schema({account:String,deltaCents:Number},{_id:false})]},{versionKey:false}));Journal.schema.index({sourceId:1,createdAt:1,_id:1});
export interface RemittanceRecord {_id:string;partnerId:string;state:"submitted"|"received";version:number;submittedAt:Date;receivedAt?:Date;receivedBy?:string;reference?:string;referenceHash?:string}
export const Remittance=model<RemittanceRecord>("CashRemittance",new Schema<RemittanceRecord>({_id:String,partnerId:String,state:String,version:Number,submittedAt:Date,receivedAt:Date,receivedBy:String,reference:String,referenceHash:String},{versionKey:false}));Remittance.schema.index({referenceHash:1},{unique:true,sparse:true});
export interface PayoutRecord {_id:string;state:"prepared"|"recorded";version:number;preparedAt:Date;preparedBy:string;recordedAt?:Date;recordedBy?:string;reference?:string;referenceHash?:string}
export const Payout=model<PayoutRecord>("ManualSellerPayout",new Schema<PayoutRecord>({_id:String,state:String,version:Number,preparedAt:Date,preparedBy:String,recordedAt:Date,recordedBy:String,reference:String,referenceHash:String},{versionKey:false}));Payout.schema.index({referenceHash:1},{unique:true,sparse:true});

export const RiderPayout=model<PayoutRecord>("ManualRiderPayout",Payout.schema.clone());
