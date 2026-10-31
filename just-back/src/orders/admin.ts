import {Router} from "express";
import {z} from "zod";
import type {Config} from "../config/env.js";
import {decodeCursor,encodeCursor} from "../common/cursor.js";
import {Order,orderDto,type OrderRecord} from "./models.js";

// Deliberately excludes customer identity/address and all receipt proof metadata.
export function adminOrderDto(order:OrderRecord){
  const dto=orderDto(order);
  return {id:dto.id,createdAt:dto.createdAt,testMode:dto.testMode,paymentMethod:dto.paymentMethod,paymentStatus:dto.paymentStatus,total:dto.total,amountDue:dto.amountDue,cashRecordedAmount:dto.cashRecordedAmount,cancelledAmount:dto.cancelledAmount,subOrders:dto.subOrders.map(sub=>({id:sub.id,shopId:sub.shopId,shopName:sub.shopName,status:sub.status,fulfilment:sub.fulfilment,amountDue:sub.amountDue,cashCollection:sub.cashCollection,cancelReason:sub.cancelReason}))};
}
export function adminOrderRoutes(config:Config){
  const router=Router();
  router.get("/orders",async(req,res)=>{
    const query=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),cursor:z.string().max(2048).optional(),shopId:z.uuid().optional(),orderId:z.uuid().transform(value=>value.toLowerCase()).optional(),cash:z.enum(["all","outstanding","recorded"]).default("all")}).strict().parse(req.query);
    const scope=JSON.stringify(["admin-orders",query.shopId ?? null,query.cash,...(query.orderId ? [query.orderId] : [])]);
    const cursor=query.cursor ? decodeCursor(query.cursor,scope,"newest",config.CURSOR_SECRET) : undefined;
    const date=cursor ? new Date(z.iso.datetime().parse(cursor.key)) : undefined;
    const filters:Record<string,unknown>[]=[];
    if(query.orderId)filters.push({_id:query.orderId});
    if(query.cash!=="all")filters.push({paymentMethod:"cod"});
    if(query.shopId)filters.push({"subOrders.shopId":query.shopId});
    if(query.cash==="recorded")filters.push({"subOrders.cashCollection":{$exists:true}});
    if(query.cash==="outstanding")filters.push({subOrders:{$elemMatch:{status:{$ne:"cancelled"},cashCollection:{$exists:false}}}});
    if(cursor)filters.push({$or:[{createdAt:{$lt:date}},{createdAt:date,_id:{$lt:cursor.id}}]});
    const rows=await Order.find(filters.length ? {$and:filters} : {}).sort({createdAt:-1,_id:-1}).limit(query.limit+1).lean();
    const more=rows.length>query.limit,page=rows.slice(0,query.limit);
    res.setHeader("Cache-Control","private, no-store");
    res.setHeader("X-Has-More",String(more));
    if(more){const last=page.at(-1)!;res.setHeader("X-Next-Cursor",encodeCursor({scope,sort:"newest",key:last.createdAt.toISOString(),id:last._id},config.CURSOR_SECRET));}
    res.json(page.map(adminOrderDto));
  });
  return router;
}
