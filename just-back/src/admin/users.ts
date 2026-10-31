import {Router} from "express";
import {createHash} from "node:crypto";
import {z} from "zod";
import type {Config} from "../config/env.js";
import {User,Session,roles,type UserRecord} from "../auth/models.js";
import {actor,requireRole} from "../auth/middleware.js";
import {transaction} from "../catalogue/service.js";
import {fail} from "../common/errors.js";
import {encodeCursor,decodeCursor} from "../common/cursor.js";
import {audit} from "./audit.js";
const summary=(u:UserRecord)=>({id:u._id,name:u.name,phone:u.phone,role:u.role,active:u.active,version:u.accessVersion ?? 0,emailVerified:!!u.emailVerifiedAt,createdAt:u.createdAt?.toISOString() ?? null});
const literal=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
export function adminUserRoutes(config:Config){
  const router=Router();router.use("/users",requireRole("admin"));
  router.get("/users",async(req,res)=>{
    const q=z.object({q:z.string().trim().max(100).optional(),role:z.enum(["all",...roles]).default("all"),state:z.enum(["all","active","blocked"]).default("all"),cursor:z.string().max(2048).optional()}).strict().parse(req.query);
    const scope=createHash("sha256").update(JSON.stringify(["admin-users",actor(req).id,q.q ?? "",q.role,q.state])).digest("hex"),cursor=q.cursor ? decodeCursor(q.cursor,scope,"id",config.CURSOR_SECRET):undefined;
    const filter={...(q.role!=="all"?{role:q.role}:{}),...(q.state!=="all"?{active:q.state==="active"}:{}),...(q.q?{$or:[{name:{$regex:literal(q.q),$options:"i"}},{phone:{$regex:literal(q.q)}},{_id:q.q.toLowerCase()}]}:{})};
    const [rows,total]=await Promise.all([User.find({...filter,...(cursor?{_id:{$gt:cursor.id}}:{})}).select("_id name phone role active accessVersion emailVerifiedAt createdAt").sort({_id:1}).limit(26).maxTimeMS(5000).lean(),User.countDocuments(filter).maxTimeMS(5000)]);
    const more=rows.length>25,page=rows.slice(0,25),last=page.at(-1);
    res.json({items:page.map(summary),total,...(more && last?{next:encodeCursor({scope,sort:"id",key:last._id,id:last._id},config.CURSOR_SECRET)}:{})});
  });
  router.patch("/users/:id/access",async(req,res)=>{
    const id=z.uuid().parse(req.params.id),input=z.object({version:z.number().int().nonnegative(),active:z.boolean(),reason:z.string().trim().min(10).max(500)}).strict().parse(req.body),who=actor(req);
    res.json(await transaction(async session=>{
      const current=await User.findById(id).session(session).lean();if(!current)fail(404,"NOT_FOUND","Account not found");
      if(id===who.id || current.role==="admin")fail(409,"PROTECTED_ACCOUNT","Admin accounts and your own account cannot be changed here");
      if((current.accessVersion ?? 0)!==input.version)fail(409,"VERSION_CONFLICT","Account changed; refresh before another decision");
      if(current.active===input.active)return summary(current);
      const updated=await User.findOneAndUpdate({_id:id,role:{$ne:"admin"},$or:[{accessVersion:input.version},...(input.version===0?[{accessVersion:{$exists:false}}]:[])]},{$set:{active:input.active},$inc:{accessVersion:1,authVersion:1,authRevision:1}},{session,returnDocument:"after"}).lean();
      if(!updated)fail(409,"VERSION_CONFLICT","Account changed; refresh before another decision");
      await Session.deleteMany({userId:id}).session(session);
      await audit(who,input.active?"user.unblock":"user.block",id,session,updated.accessVersion,input.reason);
      return summary(updated);
    }));
  });return router;
}
