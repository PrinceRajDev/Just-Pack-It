import {Router} from "express";
import {z} from "zod";
import {Order} from "../orders/models.js";
import {OnlinePayment} from "../payments/razorpay.js";
import {Refund} from "../payments/refund-model.js";
import {requireRole} from "../auth/middleware.js";
import {fail} from "../common/errors.js";
const dayMs=86400000;
export function reportRange(input:unknown,now=new Date()){
 const q=z.object({from:z.iso.date().optional(),to:z.iso.date().optional()}).strict().parse(input),today=new Date(now.getTime()+330*60000).toISOString().slice(0,10);
 if(!!q.from!==!!q.to)fail(400,"INVALID_RANGE","Supply both from and to dates");
 const to=q.to ?? today,from=q.from ?? new Date(new Date(`${to}T00:00:00+05:30`).getTime()-29*dayMs+330*60000).toISOString().slice(0,10),start=new Date(`${from}T00:00:00+05:30`),end=new Date(new Date(`${to}T00:00:00+05:30`).getTime()+dayMs),days=(end.getTime()-start.getTime())/dayMs;
 if(days<1 || days>90 || to>today)fail(400,"INVALID_RANGE","Choose 1 to 90 dates ending no later than today (IST)");
 return{from,to,start,end,days};
}
interface Amount {count:number;amountCents:number}
interface OrderReport {summary:Amount[];daily:{date:string;count:number;amountCents:number}[];statuses:{status:string;count:number}[];shops:{shopId:string;shopName:string;count:number;cancelled:number;amountCents:number}[]}
const zero:Amount={count:0,amountCents:0};
export function adminReportRoutes(){const router=Router();router.use("/reports",requireRole("admin"));
 router.get("/reports",async(req,res)=>{
  const range=reportRange(req.query),between={$gte:range.start,$lt:range.end};
  const [orderRows,captureRows,cashRows,refundRows]=await Promise.all([
   Order.aggregate<OrderReport>([{$match:{testMode:{$ne:true},createdAt:between}},{$facet:{
    summary:[{$group:{_id:null,count:{$sum:1},amountCents:{$sum:"$totalCents"}}},{$project:{_id:0,count:1,amountCents:1}}],
    daily:[{$group:{_id:{$dateToString:{date:"$createdAt",format:"%Y-%m-%d",timezone:"Asia/Kolkata"}},count:{$sum:1},amountCents:{$sum:"$totalCents"}}},{$project:{_id:0,date:"$_id",count:1,amountCents:1}},{$sort:{date:1}}],
    statuses:[{$unwind:"$subOrders"},{$group:{_id:"$subOrders.status",count:{$sum:1}}},{$project:{_id:0,status:"$_id",count:1}},{$sort:{status:1}}],
    shops:[{$unwind:"$subOrders"},{$group:{_id:"$subOrders.shopId",shopName:{$first:"$subOrders.shopName"},count:{$sum:1},cancelled:{$sum:{$cond:[{$eq:["$subOrders.status","cancelled"]},1,0]}},amountCents:{$sum:{$add:["$subOrders.itemsSubtotalCents","$subOrders.deliveryFeeCents"]}}}},{$sort:{amountCents:-1,_id:1}},{$limit:10},{$project:{_id:0,shopId:"$_id",shopName:1,count:1,cancelled:1,amountCents:1}}]
   }}]).option({maxTimeMS:5000}),
   OnlinePayment.aggregate<Amount>([{$match:{state:"paid",keyId:{$regex:"^rzp_live_"},providerPaymentId:{$type:"string",$ne:""},paidAt:between}},{$lookup:{from:Order.collection.name,localField:"_id",foreignField:"_id",as:"parent"}},{$unwind:"$parent"},{$match:{"parent.testMode":{$ne:true},"parent.paymentMethod":"razorpay","parent.paymentStatus":"paid",$expr:{$eq:["$parent.totalCents","$amountCents"]}}},{$group:{_id:null,count:{$sum:1},amountCents:{$sum:"$amountCents"}}},{$project:{_id:0,count:1,amountCents:1}}]).option({maxTimeMS:5000}),
   Order.aggregate<Amount>([{$match:{testMode:{$ne:true},paymentMethod:"cod","subOrders.cashCollection.recordedAt":between}},{$unwind:"$subOrders"},{$match:{"subOrders.cashCollection.recordedAt":between}},{$group:{_id:null,count:{$sum:1},amountCents:{$sum:"$subOrders.cashCollection.amountCents"}}},{$project:{_id:0,count:1,amountCents:1}}]).option({maxTimeMS:5000}),
   Refund.aggregate<{state:string;count:number;amountCents:number}>([{$match:{testMode:{$ne:true},keyId:{$regex:"^rzp_live_"},createdAt:between}},{$group:{_id:"$state",count:{$sum:1},amountCents:{$sum:"$amountCents"}}},{$project:{_id:0,state:"$_id",count:1,amountCents:1}},{$sort:{state:1}}]).option({maxTimeMS:5000})
  ]);
  const orders=orderRows[0] ?? {summary:[],daily:[],statuses:[],shops:[]},daily=Array.from({length:range.days},(_,i)=>{const date=new Date(range.start.getTime()+i*dayMs+330*60000).toISOString().slice(0,10);return orders.daily.find(d=>d.date===date) ?? {date,count:0,amountCents:0};});
  const result={checkedAt:new Date().toISOString(),from:range.from,to:range.to,timezone:"Asia/Kolkata",currency:"INR",amountUnit:"paise",orders:orders.summary[0] ?? zero,daily,statuses:orders.statuses,shops:orders.shops,captures:captureRows[0] ?? zero,cash:cashRows[0] ?? zero,refunds:refundRows};
  for(const row of [result.orders,...daily,...result.shops,result.captures,result.cash,...result.refunds])if(!Number.isSafeInteger(row.amountCents) || row.amountCents<0)fail(503,"REPORT_AMOUNT_INVALID","Financial totals require operator review");
  res.json(result);
 });return router;}
