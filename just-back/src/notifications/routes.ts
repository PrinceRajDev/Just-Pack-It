import {Router} from "express";
import {z} from "zod";
import {actor} from "../auth/middleware.js";
import {decodeCursor,encodeCursor} from "../common/cursor.js";
import {fail} from "../common/errors.js";
import type {Config} from "../config/env.js";
import {Notification,NotificationRead,readId} from "./service.js";
export function notificationRoutes(config:Config){
  const router=Router();
  router.get("/unread-count",async(req,res)=>{
    const who=actor(req),filter=who.role==="admin" ? {$or:[{recipientId:who.id},{admin:true}]} : {recipientId:who.id};
    const rows=await Notification.aggregate([{$match:filter},{$lookup:{from:NotificationRead.collection.name,let:{notificationId:"$_id"},pipeline:[{$match:{$expr:{$and:[{$eq:["$notificationId","$$notificationId"]},{$eq:["$userId",who.id]}]}}}],as:"reads"}},{$match:{"reads.0":{$exists:false}}},{$count:"count"}]).option({maxTimeMS:5000});
    res.json({count:rows[0]?.count ?? 0});
  });
  router.get("/",async(req,res)=>{
    const query=z.object({limit:z.coerce.number().int().min(1).max(50).default(20),cursor:z.string().max(2048).optional()}).strict().parse(req.query),who=actor(req);
    const scope=`notifications:${who.id}:${who.role}`,cursor=query.cursor ? decodeCursor(query.cursor,scope,"newest",config.CURSOR_SECRET) : undefined;
    const filters:Record<string,unknown>[]=[who.role==="admin" ? {$or:[{recipientId:who.id},{admin:true}]} : {recipientId:who.id}];
    if(cursor){const date=new Date(z.iso.datetime().parse(cursor.key));filters.push({$or:[{createdAt:{$lt:date}},{createdAt:date,_id:{$lt:cursor.id}}]});}
    const rows=await Notification.find({$and:filters}).sort({createdAt:-1,_id:-1}).limit(query.limit+1).maxTimeMS(5000).lean(),more=rows.length>query.limit,page=rows.slice(0,query.limit);
    const reads=await NotificationRead.find({userId:who.id,notificationId:{$in:page.map(row=>row._id)}}).lean();
    res.setHeader("X-Has-More",String(more));if(more){const last=page.at(-1)!;res.setHeader("X-Next-Cursor",encodeCursor({scope,sort:"newest",key:last.createdAt.toISOString(),id:last._id},config.CURSOR_SECRET));}
    res.json(page.map(row=>({id:row._id,title:row.title,body:row.body,link:row.link,createdAt:row.createdAt.toISOString(),read:reads.some(read=>read.notificationId===row._id)})));
  });
  router.post("/:id/read",async(req,res)=>{
    z.object({}).strict().parse(req.body);const who=actor(req),id=z.uuid().parse(req.params.id);
    const row=await Notification.findOne({_id:id,...(who.role==="admin" ? {$or:[{recipientId:who.id},{admin:true}]} : {recipientId:who.id})}).lean();if(!row)fail(404,"NOT_FOUND","Notification not found");
    await NotificationRead.updateOne({_id:readId(who.id,id)},{$setOnInsert:{userId:who.id,notificationId:id,readAt:new Date()}},{upsert:true});res.status(204).end();
  });return router;
}
