import {Router} from "express";
import {rateLimit} from "express-rate-limit";
import {z} from "zod";
import {actor} from "../auth/middleware.js";
import type {Config} from "../config/env.js";
import {fail} from "../common/errors.js";
import {Order,orderDto} from "./models.js";
import {createCodOrder} from "./service.js";
import {decodeCursor,encodeCursor} from "../common/cursor.js";
import {cancelBuyerSuborder} from "./seller.js";
import {throttle} from "../auth/service.js";
export async function verifyOrderIndexes(){
  const indexes=await Order.collection.indexes();
  if(!indexes.some(index=>index.unique && index.key.reservationId===1))throw new Error("Order reservation uniqueness index missing");
  if(indexes.some(index=>index.expireAfterSeconds!==undefined))throw new Error("Orders must not have TTL indexes");
}
export function orderRoutes(config:Config){
  const router=Router();
  router.use((_req,res,next)=>{res.setHeader("Cache-Control","private, no-store");next();});
  router.post("/:id/suborders/:subId/cancel",async(req,res)=>{
    const input=z.object({version:z.number().int().nonnegative(),reason:z.string().trim().min(3).max(500)}).strict().parse(req.body);
    await throttle(`buyer-cancel:${actor(req).id}`,config,30);
    await cancelBuyerSuborder(actor(req),z.uuid().parse(req.params.id),z.uuid().parse(req.params.subId),input);res.status(204).end();
  });
  router.post("/",rateLimit({windowMs:900_000,limit:20,keyGenerator:req=>actor(req).id,standardHeaders:"draft-8",legacyHeaders:false,handler:(_req,res)=>res.status(429).json({message:"Too many order attempts. Please retry later.",code:"RATE_LIMITED",requestId:res.locals.requestId})}),async(req,res)=>{
    if(!config.ORDERS_COD_ENABLED)fail(503,"ORDERING_UNAVAILABLE","Live COD ordering is not enabled");
    const key=z.string().regex(/^[A-Za-z0-9_-]{16,100}$/).parse(req.get("Idempotency-Key"));
    const result=await createCodOrder(actor(req),key,req.body,"cod",false,config.PLATFORM_DELIVERY_ENABLED);
    res.status(result.replayed ? 200 : 201).json(orderDto(result.order));
  });
  router.get("/",async(req,res)=>{
    const limit=z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit);
    const scope=`orders:${actor(req).id}`;
    const cursor=req.query.cursor===undefined ? undefined : decodeCursor(z.string().max(2048).parse(req.query.cursor),scope,"newest",config.CURSOR_SECRET);
    const date=cursor ? z.iso.datetime().parse(cursor.key) : undefined;
    const records=await Order.find({buyerId:actor(req).id,...(cursor ? {$or:[{createdAt:{$lt:new Date(date!)}},{createdAt:new Date(date!),_id:{$lt:cursor.id}}]} : {})}).sort({createdAt:-1,_id:-1}).limit(limit+1).lean();
    const hasMore=records.length>limit,page=records.slice(0,limit);
    res.setHeader("X-Has-More",String(hasMore));if(hasMore){const last=page.at(-1)!;res.setHeader("X-Next-Cursor",encodeCursor({scope,sort:"newest",key:last.createdAt.toISOString(),id:last._id},config.CURSOR_SECRET));}
    res.json(page.map(orderDto));
  });
  router.get("/:id",async(req,res)=>{
    const id=z.uuid().parse(req.params.id);
    const order=await Order.findOne({_id:id,buyerId:actor(req).id}).lean();if(!order)fail(404,"NOT_FOUND","Order not found");res.json(orderDto(order));
  });
  return router;
}
