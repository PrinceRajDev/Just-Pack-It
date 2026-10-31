import { Router } from "express";
import { z } from "zod";
import { actor } from "../auth/middleware.js";
import { ownedShop } from "../catalogue/service.js";
import { Product } from "../catalogue/models.js";
import { Order, type OrderRecord } from "./models.js";
import { sellerSuborderDto } from "./seller.js";
export function sellerDashboardRoutes() {
  const router = Router();
  router.get("/dashboard", async (req, res) => {
    z.object({}).strict().parse(req.query);
    res.setHeader("Cache-Control", "private, no-store");
    const shop = await ownedShop(actor(req));
    const now = new Date();
    const timezone = shop.timezone;
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year:"numeric",month:"2-digit",day:"2-digit" }).format(now);
    const payable = { $or: [{ paymentMethod: "cod" }, { paymentMethod: "razorpay", paymentStatus: "paid" }] };
    type Summary = { today:{count:number}[]; pendingPayment:{count:number}[]; counts:{_id:string;count:number}[]; urgent:OrderRecord[] };
    const [summary] = await Order.aggregate<Summary>([
      { $match: { "subOrders.shopId":shop._id, testMode:{$ne:true} } },
      { $unwind:"$subOrders" }, { $match:{"subOrders.shopId":shop._id} },
      { $set:{ownedStatus:"$subOrders.status",subOrders:["$subOrders"]} },
      { $facet:{
        today:[{$match:{...payable,$expr:{$eq:[{$dateToString:{date:"$createdAt",format:"%Y-%m-%d",timezone}},date]}}},{$count:"count"}],
        pendingPayment:[{$match:{paymentMethod:"razorpay",paymentStatus:{$ne:"paid"},ownedStatus:"placed"}},{$count:"count"}],
        counts:[{$match:payable},{$group:{_id:"$ownedStatus",count:{$sum:1}}}],
        urgent:[{$match:{...payable,ownedStatus:"placed"}},{$sort:{createdAt:1,_id:1}},{$limit:5}]
      } }
    ]).option({maxTimeMS:5000});
    type Stock = { count:{count:number}[]; out:{count:number}[]; items:{productId:string;name:string;variantId?:string;label?:string;stock:number}[] };
    const [stock] = await Product.aggregate<Stock>([
      {$match:{shopId:shop._id,active:true}},
      {$project:{name:1,options:{$cond:[{$gt:[{$size:"$variants"},0]},{$map:{input:{$filter:{input:"$variants",as:"variant",cond:"$$variant.active"}},as:"variant",in:{variantId:"$$variant._id",label:"$$variant.label",stock:"$$variant.stock"}}},[{stock:"$stock"}]]}}},
      {$unwind:"$options"},{$match:{"options.stock":{$lte:5}}},
      {$facet:{count:[{$count:"count"}],out:[{$match:{"options.stock":0}},{$count:"count"}],items:[{$sort:{"options.stock":1,name:1,_id:1,"options.variantId":1}},{$limit:10},{$project:{_id:0,productId:"$_id",name:1,variantId:"$options.variantId",label:"$options.label",stock:"$options.stock"}}]}}
    ]).option({maxTimeMS:5000});
    res.json({checkedAt:now.toISOString(),date,timezone,todayOrders:summary?.today[0]?.count ?? 0,pendingPayment:summary?.pendingPayment[0]?.count ?? 0,counts:Object.fromEntries((summary?.counts ?? []).map(item=>[item._id,item.count])),urgent:(summary?.urgent ?? []).map(order=>sellerSuborderDto(order,order.subOrders[0])),lowStock:{threshold:5,count:stock?.count[0]?.count ?? 0,outOfStock:stock?.out[0]?.count ?? 0,items:stock?.items ?? []}});
  });
  return router;
}
