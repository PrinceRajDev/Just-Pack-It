import mongoose from "mongoose";
import {Router} from "express";
import {z} from "zod";
import {emailAddress,sendSignupEmail,verifySignupEmail,consumeEmailProof} from "./email-otp.js";
import {User,Session} from "./models.js";
import {hashPassword,throttle} from "./service.js";
import {password} from "./validators.js";
import type {Config} from "../config/env.js";
import {fail} from "../common/errors.js";
export function recoveryRoutes(config:Config){
  const router=Router();
  router.post("/password-recovery/request",async(req,res)=>{
    const {email}=z.object({email:emailAddress}).strict().parse(req.body);
    res.status(202).json(await sendSignupEmail(email,req.ip ?? "unknown",config,undefined,"recovery"));
  });
  router.post("/password-recovery/reset",async(req,res)=>{
    const input=z.object({email:emailAddress,emailChallengeId:z.uuid(),emailOtp:z.string().regex(/^\d{6}$/),newPassword:password}).strict().parse(req.body);
    await throttle(`password-reset-ip:${req.ip}`,config,20);
    const proof=await verifySignupEmail(input,config,"recovery");
    if(!proof?.userId)fail(400,"OTP_INVALID","Invalid or expired recovery code");
    const passwordHash=await hashPassword(input.newPassword);
    await mongoose.connection.transaction(async session=>{
      await consumeEmailProof(proof,session);
      const result=await User.updateOne({_id:proof.userId,email:proof.email,emailVerifiedAt:{$exists:true},active:true,$or:[{authVersion:proof.authVersion},...(proof.authVersion===0 ? [{authVersion:{$exists:false}}] : [])]},{$set:{passwordHash},$inc:{authVersion:1,authRevision:1}},{session});
      if(result.modifiedCount!==1)fail(400,"OTP_INVALID","Account changed. Request a new recovery code");
      await Session.deleteMany({userId:proof.userId}).session(session);
    });res.status(204).end();
  });return router;
}
