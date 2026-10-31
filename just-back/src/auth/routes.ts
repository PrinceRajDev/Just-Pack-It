import { Router } from "express";
import type { Config } from "../config/env.js";
import { registerInput, loginInput,password } from "./validators.js";
import {z} from "zod";
import { hashPassword, login, throttle, tokenHash,secureAccount,issueSession,verifyPassword } from "./service.js";
import {verifyGoogle} from "./google-identity.js";
import mongoose from "mongoose";
import {emailAddress,emailAvailable,sendSignupEmail,verifySignupEmail,consumeEmailProof} from "./email-otp.js";
import { Session, User } from "./models.js";
import { authenticate, actor } from "./middleware.js";
import { fail } from "../common/errors.js";
import { registerSeller, sellerRegistrationInput } from "./seller-registration.js";
import {recoveryRoutes} from "./recovery.js";
export function authRoutes(config: Config) {
  const router = Router();
  router.use((_req,res,next)=>{res.setHeader("Cache-Control","private, no-store");next();});
  router.use(recoveryRoutes(config));
  router.get("/registration-options",(_req,res)=>res.json({emailOtpRequired:config.EMAIL_OTP_REQUIRED,emailOtpAvailable:emailAvailable(config),googleSignInAvailable:config.GOOGLE_SIGN_IN_ENABLED && !!config.FIREBASE_PROJECT_ID}));
  router.post("/google",async(req,res)=>{
    const input=z.object({idToken:z.string().min(100).max(10000),phone:loginInput.shape.phone.optional(),password:password.optional()}).strict().parse(req.body);
    await throttle(`google-ip:${req.ip}`,config,20);
    const identity=await verifyGoogle(input.idToken,config);
    const user=await User.findOne({$or:[{googleUid:identity.googleUid},{email:identity.email}]}).select("+passwordHash");
    if(!user)fail(409,"GOOGLE_ONBOARDING_REQUIRED","Complete your buyer or seller registration.");
    if(!user.active || !user.emailVerifiedAt || user.email!==identity.email)fail(403,"GOOGLE_ACCOUNT_UNAVAILABLE","Use your existing account sign-in or contact support.");
    if(user.googleUid!==identity.googleUid){
      if(user.googleUid)fail(403,"GOOGLE_ACCOUNT_UNAVAILABLE","Use your existing account sign-in.");
      await throttle(`google-link:${user._id}`,config,5);
      if(!input.phone || !input.password)fail(409,"GOOGLE_LINK_REQUIRED","Enter your existing phone and password to securely link Google.");
      if(input.phone!==user.phone || !await verifyPassword(input.password,user.passwordHash))fail(401,"INVALID_CREDENTIALS","Invalid phone or password.");
    }
    res.json(await issueSession(user,config,identity.googleUid));
  });
  router.post("/email-otp/send",async(req,res)=>{
    const {email}=z.object({email:emailAddress}).strict().parse(req.body);
    res.status(202).json(await sendSignupEmail(email,req.ip ?? "unknown",config));
  });
  router.post("/register/seller", async (req, res) => {
    const input = sellerRegistrationInput.parse(req.body);
    await throttle(`register:${req.ip}`, config, 10);
    res.status(201).json(await registerSeller(input, config));
  });
  router.post("/register", async (req, res) => {
    const input = registerInput.parse(req.body);
    await throttle(`register:${req.ip}`, config, 10);
    const proof=await verifySignupEmail(input,config),passwordHash=await hashPassword(input.password);
    await mongoose.connection.transaction(async session=>{
      const verifiedEmail=await consumeEmailProof(proof,session);
      await User.create([{name:input.name,phone:input.phone,passwordHash,role:"buyer",active:true,...verifiedEmail}],{session});
    });
    res.status(201).json(await login(input, config, req.ip ?? "unknown"));
  });
  router.post("/login", async (req, res) =>
    res.json(
      await login(loginInput.parse(req.body), config, req.ip ?? "unknown"),
    ),
  );
  router.post("/send-otp", (_req, _res) =>
    fail(503, "OTP_UNAVAILABLE", "SMS authentication is not configured"),
  );
  router.post("/verify-otp", (_req, _res) =>
    fail(503, "OTP_UNAVAILABLE", "SMS authentication is not configured"),
  );
  router.get("/profile",authenticate(config),async(req,res)=>{
    const user=await User.findById(actor(req).id).select("name phone email emailVerifiedAt profileVersion").lean();if(!user)fail(404,"NOT_FOUND","Account not found");
    res.json({name:user.name,phone:user.phone,email:user.email,emailVerified:!!user.emailVerifiedAt,version:user.profileVersion??0});
  });
  router.patch("/profile",authenticate(config),async(req,res)=>{
    const input=z.object({name:z.string().trim().min(2).max(100),version:z.number().int().nonnegative()}).strict().parse(req.body);
    await throttle(`profile:${actor(req).id}`,config,20);
    const user=await User.findOneAndUpdate({_id:actor(req).id,active:true,...(input.version===0?{$or:[{profileVersion:0},{profileVersion:{$exists:false}}]}:{profileVersion:input.version})},{$set:{name:input.name},$inc:{profileVersion:1}},{returnDocument:"after"});
    if(!user)fail(409,"VERSION_CONFLICT","Profile changed; reload before retrying");res.json({name:user.name,phone:user.phone,email:user.email,emailVerified:!!user.emailVerifiedAt,version:user.profileVersion??0});
  });
  router.get("/me", authenticate(config), async (req, res) => {
    const user = await User.findById(actor(req).id);
    res.json({
      userId: user!._id,
      name: user!.name,
      role: user!.role,
      isDemo: false,
    });
  });
  router.post("/logout", authenticate(config), async (req, res) => {
    await Session.deleteOne({
      _id: tokenHash(req.headers.authorization!.slice(7), config),
    });
    res.status(204).end();
  });
  router.post("/password",authenticate(config),async(req,res)=>{
    const input=z.object({currentPassword:password,newPassword:password}).strict().parse(req.body);
    await secureAccount(actor(req).id,input.currentPassword,input.newPassword,config);res.status(204).end();
  });
  router.post("/logout-all",authenticate(config),async(req,res)=>{
    const input=z.object({currentPassword:password}).strict().parse(req.body);
    await secureAccount(actor(req).id,input.currentPassword,undefined,config);res.status(204).end();
  });
  return router;
}
