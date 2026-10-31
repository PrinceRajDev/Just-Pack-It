import {Schema,model} from "mongoose";
export interface PartnerRecord {_id:string;approved:boolean;areaIds:string[];online:boolean;seenAt:Date;version:number;activeTask?:string;revision:number}
export const Partner=model<PartnerRecord>("DeliveryPartner",new Schema<PartnerRecord>({_id:String,approved:{type:Boolean,default:false},areaIds:[String],online:{type:Boolean,default:false},seenAt:Date,version:{type:Number,default:0},activeTask:String,revision:{type:Number,default:0}},{versionKey:false}));
