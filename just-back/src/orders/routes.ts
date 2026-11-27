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
import {changeSubstitution,decisionInput} from "./substitution.js";
import {Partner} from "../delivery/models.js";
import {estimateRoute} from "../delivery/route-estimate.js";
export async function verifyOrderIndexes(){
  const indexes=await Order.collection.indexes();
  if(!indexes.some(index=>index.unique && index.key.reservationId===1))throw new Error("Order reservation uniqueness index missing");
  if(indexes.some(index=>index.expireAfterSeconds!==undefined))throw new Error("Orders must not have TTL indexes");
}
export function orderRoutes(config:Config){
  const router=Router();
  router.use((_req,res,next)=>{res.setHeader("Cache-Control","private, no-store");next();});
  router.put("/:id/suborders/:subId/rating",async(req,res)=>{
    const id=z.uuid().parse(req.params.id),subId=z.uuid().parse(req.params.subId);
    const input=z.object({stars:z.number().int().min(1).max(5),feedback:z.string().trim().max(500).optional()}).strict().parse(req.body);
    const owner={_id:id,buyerId:actor(req).id,testMode:{$ne:true}};
    const review={stars:input.stars,...(input.feedback ? {feedback:input.feedback} : {})};
    const result=await Order.updateOne({...owner,subOrders:{$elemMatch:{_id:subId,status:"delivered",buyerRating:{$exists:false}}}},{$set:{"subOrders.$.buyerRating":review}});
    if(result.modifiedCount){res.json(review);return;}
    const order=await Order.findOne(owner).select("subOrders").lean();
    const shop=order?.subOrders.find(row=>row._id===subId);
    if(!shop)fail(404,"NOT_FOUND","Shop order not found");
    if(shop.status!=="delivered")fail(409,"RATING_UNAVAILABLE","You can rate this shop after delivery.");
    if(!shop.buyerRating)fail(409,"RATING_UNAVAILABLE","Refresh this order and try again.");
    res.json(shop.buyerRating);
  });
  router.post("/:id/suborders/:subId/substitution",async(req,res)=>{
    await changeSubstitution(actor(req),z.uuid().parse(req.params.id),z.uuid().parse(req.params.subId),decisionInput.parse(req.body));
    res.status(204).end();
  });
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
  router.get("/:id/suborders/:subId/eta",rateLimit({windowMs:60000,limit:10,keyGenerator:req=>actor(req).id,standardHeaders:"draft-8",legacyHeaders:false}),async(req,res)=>{
    const id=z.uuid().parse(req.params.id),subId=z.uuid().parse(req.params.subId);
    const order=await Order.findOne({_id:id,buyerId:actor(req).id}).lean();
    if(!order)fail(404,"NOT_FOUND","Order not found");
    const shop=order.subOrders.find(row=>row._id===subId && row.fulfilment==="platform_delivery" && row.status==="out_for_delivery" && row.delivery?.state==="out_for_delivery");
    if(!config.GOOGLE_ROUTES_API_KEY || !shop?.delivery || !order.address.location){res.json({eta:null});return;}
    const partner=await Partner.findOne({_id:shop.delivery.partnerId,approved:true,activeTask:subId,"liveLocation.taskId":subId,"liveLocation.recordedAt":{$gt:new Date(Date.now()-120000)}}).select("liveLocation").lean();
    const point=partner?.liveLocation;
    if(!point){res.json({eta:null});return;}
    const [longitude,latitude]=order.address.location.coordinates;
    const minutes=await estimateRoute(config.GOOGLE_ROUTES_API_KEY,{latitude:point.latitude,longitude:point.longitude},{latitude:latitude!,longitude:longitude!});
    res.json({eta:minutes===null ? null : {minutes,validUntil:new Date(Math.min(Date.now()+60000,point.recordedAt.getTime()+120000)).toISOString()}});
  });
  router.get("/:id",async(req,res)=>{
    const id=z.uuid().parse(req.params.id);
    const order=await Order.findOne({_id:id,buyerId:actor(req).id}).lean();if(!order)fail(404,"NOT_FOUND","Order not found");
    const dto=orderDto(order);
    const active=order.subOrders.filter(shop=>shop.fulfilment==="platform_delivery" && shop.status==="out_for_delivery" && shop.delivery?.state==="out_for_delivery");
    const partners=active.length ? await Partner.find({_id:{$in:active.map(shop=>shop.delivery!.partnerId)},approved:true,activeTask:{$in:active.map(shop=>shop._id)}}).select("activeTask liveLocation").lean() : [];
    res.json({...dto,subOrders:dto.subOrders.map(shop=>{
      const delivery=active.find(row=>row._id===shop.id)?.delivery;
      const point=delivery && partners.find(partner=>partner._id===delivery.partnerId && partner.activeTask===shop.id)?.liveLocation;
      if(!point || point.taskId!==shop.id || Date.now()-point.recordedAt.getTime()>120000)return shop;
      return {...shop,riderLocation:{latitude:point.latitude,longitude:point.longitude,recordedAt:point.recordedAt.toISOString(),routeEstimateAvailable:!!config.GOOGLE_ROUTES_API_KEY && !!order.address.location}};
    })});
  });
  return router;
}
