import {SupportTicket} from "../support/routes.js";
import {Router} from "express";
import {z} from "zod";
import {Shop} from "../catalogue/models.js";
import {Order} from "./models.js";
import {OnlinePayment} from "../payments/razorpay.js";
import {Refund} from "../payments/refund-model.js";
export function operationsRoutes(){
  const router=Router();
  router.get("/operations",async(req,res)=>{
    z.object({}).strict().parse(req.query);
    const now=new Date(),hourAgo=new Date(now.getTime()-3600000),halfHourAgo=new Date(now.getTime()-1800000),dayAgo=new Date(now.getTime()-86400000);
    const paymentFilter={$or:[{state:"uncertain" as const},{"recovery.manualReview":true},{state:"creating" as const,createdAt:{$lte:halfHourAgo}},{state:"ready" as const,createdAt:{$lte:halfHourAgo}}]};
    const refundFilter={$or:[{state:{$in:["requested","uncertain","failed"] as const}},{"recovery.manualReview":true},{state:{$in:["pending","submitting"] as const},updatedAt:{$lte:dayAgo}}]};
    const [pendingShops,shops,stale,paymentCount,payments,refundCount,refunds,supportQueues]=await Promise.all([
      Shop.countDocuments({status:"pending"}).maxTimeMS(5000),Shop.find({status:"pending"}).select("_id name").sort({updatedAt:1,_id:1}).limit(10).maxTimeMS(5000).lean(),
      Order.aggregate([{$match:{$or:[{paymentMethod:"cod"},{paymentMethod:"razorpay",paymentStatus:"paid"}]}},{$unwind:"$subOrders"},{$match:{"subOrders.status":{$in:["placed","accepted","preparing","ready","out_for_delivery"]},$expr:{$lte:[{$ifNull:["$subOrders.updatedAt","$createdAt"]},hourAgo]}}},{$facet:{count:[{$count:"value"}],items:[{$sort:{"subOrders.updatedAt":1,_id:1}},{$limit:10},{$project:{_id:0,orderId:"$_id",suborderId:"$subOrders._id",shopName:"$subOrders.shopName",status:"$subOrders.status",lastUpdate:{$ifNull:["$subOrders.updatedAt","$createdAt"]}}}]}}]).option({maxTimeMS:5000}),
      OnlinePayment.countDocuments(paymentFilter).maxTimeMS(5000),OnlinePayment.find(paymentFilter).select("_id state createdAt").sort({createdAt:1,_id:1}).limit(10).maxTimeMS(5000).lean(),
      Refund.countDocuments(refundFilter).maxTimeMS(5000),Refund.find(refundFilter).select("_id orderId shopName state testMode updatedAt").sort({updatedAt:1,_id:1}).limit(10).maxTimeMS(5000).lean(),
      SupportTicket.aggregate([{$match:{status:{$in:["open","in_progress"]}}},{$facet:{count:[{$count:"value"}],items:[{$sort:{createdAt:1,_id:1}},{$limit:10},{$project:{_id:0,id:"$_id",orderId:1,shopName:1,status:1,createdAt:1}}]}}]).option({maxTimeMS:5000}),
    ]);
    res.setHeader("Cache-Control","private, no-store");res.json({asOf:now.toISOString(),thresholds:{orderStaleMinutes:60,paymentPendingMinutes:30,refundPendingHours:24},support:{count:supportQueues[0]?.count[0]?.value ?? 0,items:supportQueues[0]?.items ?? []},pendingShops:{count:pendingShops,items:shops.map(shop=>({id:shop._id,name:shop.name}))},staleSuborders:{count:stale[0]?.count[0]?.value ?? 0,items:stale[0]?.items ?? []},payments:{count:paymentCount,items:payments.map(row=>({orderId:row._id,state:row.state,createdAt:row.createdAt}))},refunds:{count:refundCount,items:refunds.map(row=>({id:row._id,orderId:row.orderId,shopName:row.shopName,state:row.state,testMode:row.testMode ?? false,updatedAt:row.updatedAt}))}});
  });return router;
}
