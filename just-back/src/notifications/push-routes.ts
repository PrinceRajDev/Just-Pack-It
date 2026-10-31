import {Router} from "express";
import mongoose from "mongoose";
import {z} from "zod";
import {actor} from "../auth/middleware.js";
import {Session} from "../auth/models.js";
import {tokenHash,throttle} from "../auth/service.js";
import {fail} from "../common/errors.js";
import type {Config} from "../config/env.js";
import {PushSubscription,pushId} from "./push-models.js";
export function pushRoutes(config:Config){
  const router=Router();
  const sessionId=(header:string|undefined)=>tokenHash(header!.slice(7),config);
  router.get("/push",async(req,res)=>{
    const sub=await PushSubscription.exists({sessionId:sessionId(req.headers.authorization),userId:actor(req).id,expiresAt:{$gt:new Date()}});
    res.json({available:config.FIREBASE_PUSH_ENABLED,subscribed:Boolean(sub)});
  });
  router.put("/push",async(req,res)=>{
    if(!config.FIREBASE_PUSH_ENABLED)fail(503,"PUSH_DISABLED","Browser push is not configured");
    const {token}=z.object({token:z.string().min(20).max(4096).regex(/^[A-Za-z0-9_:-]+$/)}).strict().parse(req.body),who=actor(req),sid=sessionId(req.headers.authorization);
    await throttle(`push:${who.id}`,config,30);
    await mongoose.connection.transaction(async session=>{
      const active=await Session.findOne({_id:sid,userId:who.id,expiresAt:{$gt:new Date()}}).session(session);
      if(!active)fail(401,"INVALID_SESSION","Sign in again");
      const existing=await PushSubscription.findById(pushId(token)).session(session);
      if(existing && existing.userId!==who.id){
        if(await Session.exists({_id:existing.sessionId,expiresAt:{$gt:new Date()}}).session(session))fail(409,"PUSH_ALREADY_BOUND","Disable browser alerts for the previous account first");
        await PushSubscription.deleteOne({_id:existing._id}).session(session);
      }
      await PushSubscription.deleteMany({sessionId:sid}).session(session);
      await PushSubscription.updateOne({_id:pushId(token)},{$set:{userId:who.id,sessionId:sid,role:who.role,token,expiresAt:active.expiresAt}},{upsert:true,session});
    });res.status(204).end();
  });
  router.delete("/push",async(req,res)=>{
    await PushSubscription.deleteMany({userId:actor(req).id,sessionId:sessionId(req.headers.authorization)});res.status(204).end();
  });return router;
}
