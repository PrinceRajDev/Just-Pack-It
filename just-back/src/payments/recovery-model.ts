import {Schema} from "mongoose";
export interface RecoveryMetadata {nextCheckAt?:Date|null;lastCheckedAt?:Date;failures?:number;manualReview?:boolean;code?:string;leaseId?:string;leaseUntil?:Date}
export const recoverySchema=new Schema<RecoveryMetadata>({nextCheckAt:Date,lastCheckedAt:Date,failures:Number,manualReview:Boolean,code:String,leaseId:String,leaseUntil:Date},{_id:false});
export function recoveryDto(value:RecoveryMetadata|undefined){return {lastCheckedAt:value?.lastCheckedAt?.toISOString() ?? null,nextCheckAt:value?.nextCheckAt?.toISOString() ?? null,failures:value?.failures ?? 0,manualReview:value?.manualReview ?? false,code:value?.code ?? null};}
