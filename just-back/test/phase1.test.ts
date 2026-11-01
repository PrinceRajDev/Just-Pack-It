import {Settlement,Journal,Remittance,Payout} from "../src/settlements/models.js";
import {SupportMessage} from "../src/support/conversation.js";
import {Partner} from "../src/delivery/models.js";
import {pinCoverage} from "../src/addresses/serviceability.js";
import {SupportTicket} from "../src/support/routes.js";
import { beforeAll, afterAll, beforeEach,afterEach,describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import {S3Client,PutObjectCommand,DeleteObjectCommand} from "@aws-sdk/client-s3";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { resolve } from "node:path";
import { randomUUID,createHmac } from "node:crypto";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";
import { connectDatabase, disconnectDatabase } from "../src/db.js";
import { createUser, login } from "../src/auth/service.js";
import { User } from "../src/auth/models.js";
import { Session } from "../src/auth/models.js";
import { throttle, tokenHash } from "../src/auth/service.js";
import {
  categoryPatch,
  shopPatch,
  productPatch,
  variantPatch,
} from "../src/catalogue/validators.js";
import { verifyCriticalIndexes } from "../src/common/indexes.js";
import { Category, Area, Shop, Product } from "../src/catalogue/models.js";
import { isOpen } from "../src/catalogue/presenters.js";
import { shopCreate, productCreate } from "../src/catalogue/validators.js";
import {
  createShop,
  createProduct,
  changeApproval,
} from "../src/catalogue/service.js";
import type { Actor } from "../src/auth/middleware.js";
import { InventoryReservation } from "../src/inventory/models.js";
import { reserveInventory, releaseInventory, releaseExpiredInventory, sweepExpiredInventory } from "../src/inventory/service.js";
import {verifyInventoryIndexes} from "../src/inventory/operations.js";
import {Order} from "../src/orders/models.js";
import {createCodOrder} from "../src/orders/service.js";
import {verifyOrderIndexes} from "../src/orders/routes.js";
import {transitionSellerSuborder,cancelBuyerSuborder} from "../src/orders/seller.js";
import {issueReceiptCode,completeCashHandoff} from "../src/orders/receipts.js";
import {OnlinePayment,PaymentEvent,PaymentAudit} from "../src/payments/razorpay.js";
import {Refund} from "../src/payments/refund-model.js";
import {sweepPaymentRecovery} from "../src/payments/recovery.js";
import { patchProduct } from "../src/catalogue/service.js";
import mongoose from "mongoose";
import {Notification,NotificationRead,notify,notificationEventId as readNotificationKey} from "../src/notifications/service.js";
import {PushSubscription,PushJob,pushId} from "../src/notifications/push-models.js";
import {sweepPush} from "../src/notifications/push.js";
import {EmailChallenge,EmailCooldown} from "../src/auth/email-otp.js";

const config = loadConfig({
  NODE_ENV: "test",
  EMAIL_OTP_REQUIRED:"false",
  MONGODB_URI: "mongodb://127.0.0.1:27017/isolated_test",
  CORS_ORIGINS: "http://localhost:8081",
  SESSION_PEPPER: "test-session-only-".repeat(4),
  CURSOR_SECRET: "test-cursor-only-".repeat(4),
  LOG_LEVEL: "silent",
});
const app = createApp(config),
  api = request(app);
let repl: MongoMemoryReplSet;
let categoryId: string, areaId: string, otherAreaId: string;
let admin: Actor,
  seller: Actor,
  otherSeller: Actor,
  buyer: Actor,
  delivery: Actor;
const tokens: Record<string, string> = {};
let shopId: string,
  otherShopId: string,
  productId: string,
  otherProductId: string;
const password = "Isolated-test-password-2026";
const auth = (who: Actor) => `Bearer ${tokens[who.id]}`;
describe("GPS six kilometre discovery",()=>{
  it("selects the nearest eligible shop area automatically and excludes inactive areas",async()=>{
    const original=await Shop.find({_id:{$in:[shopId,otherShopId]}}).lean();
    const area=await Area.create({name:"TEST GPS SECOND AREA",city:"TEST",pincodes:["999997"],active:true});
    try{
      await Shop.updateOne({_id:shopId},{$set:{location:{type:"Point",coordinates:[86,26]},areaIds:[areaId],status:"approved",active:true}});
      await Shop.updateOne({_id:otherShopId},{$set:{location:{type:"Point",coordinates:[86,26.02]},areaIds:[area._id],status:"approved",active:true}});
      const result=await api.get("/location/resolve?lat=26&lng=86");expect(result.status).toBe(200);expect(result.body.recommendedAreaId).toBe(areaId);expect(result.body.areas.map((a:{id:string})=>a.id)).toEqual([areaId,area._id]);
      await Area.updateOne({_id:area._id},{$set:{active:false}});const inactive=await api.get("/location/resolve?lat=26&lng=86");expect(inactive.body.areas.map((a:{id:string})=>a.id)).toEqual([areaId]);
      const empty=await api.get("/location/resolve?lat=0&lng=0");expect(empty.body.areas).toEqual([]);expect(empty.body.recommendedAreaId).toBeUndefined();
    }finally{for(const shop of original)await Shop.updateOne({_id:shop._id},{$set:{areaIds:shop.areaIds,status:shop.status,active:shop.active},$unset:{location:1}});await Area.deleteOne({_id:area._id});}
  });

  it("filters shops and products by real shop coordinates and resolves active service areas",async()=>{
    const original=await Shop.find({_id:{$in:[shopId,otherShopId]}}).lean();
    try{
      await Shop.updateOne({_id:shopId},{$set:{location:{type:"Point",coordinates:[86,26]},status:"approved",active:true}});
      await Shop.updateOne({_id:otherShopId},{$set:{location:{type:"Point",coordinates:[86,26.06]},status:"approved",active:true}});
      const near=await api.get("/shops?lat=26&lng=86");expect(near.status).toBe(200);expect(near.body.some((shop:{id:string})=>shop.id===shopId)).toBe(true);expect(near.body.some((shop:{id:string})=>shop.id===otherShopId)).toBe(false);
      const products=await api.get("/products?lat=26&lng=86");expect(products.status).toBe(200);expect(products.body.some((p:{id:string})=>p.id===productId)).toBe(true);expect(products.body.some((p:{shopId:string})=>p.shopId===otherShopId)).toBe(false);
      const resolved=await api.get("/location/resolve?lat=26&lng=86");expect(resolved.status).toBe(200);expect(resolved.body.radiusKm).toBe(6);expect(resolved.body.areas.some((area:{id:string})=>area.id===areaId)).toBe(true);
      expect((await api.get("/shops?lat=26")).status).toBe(400);expect((await api.get("/location/resolve?lat=91&lng=86")).status).toBe(400);expect((await api.get("/shops?lat=26&lng=86&radiusKm=100")).status).toBe(400);
      await Shop.updateOne({_id:shopId},{$unset:{location:1}});expect((await api.get("/shops?lat=26&lng=86")).body.some((shop:{id:string})=>shop.id===shopId)).toBe(false);
    }finally{for(const shop of original)await Shop.updateOne({_id:shop._id},{$set:{status:shop.status,active:shop.active},$unset:{location:1}});}
  });
});
describe("Brevo email OTP registration",()=>{
  it("never accepts a signup OTP as a password recovery proof",async()=>{
    try{const email="signup-not-reset@example.test",{response,code}=await send(email);expect((await emailApi.post("/auth/password-recovery/reset").send({email,emailChallengeId:response.body.challengeId,emailOtp:code,newPassword:password})).body.code).toBe("OTP_INVALID");expect((await EmailChallenge.findById(response.body.challengeId))!.state).toBe("sent");}finally{vi.unstubAllGlobals();}
  });
  it("recovers only verified accounts, revokes sessions, and rejects proof reuse or purpose confusion",async()=>{
    const email="recover-verified@example.test",phone="+919888000001",user=await createUser({name:"Recovery test",phone,password});
    await User.updateOne({_id:user._id},{$set:{email,emailVerifiedAt:new Date()}});
    const previous=await login({phone,password},emailConfig,"recovery-test");let code="";
    const provider=vi.fn(async(_url:unknown,init?:RequestInit)=>{const payload=JSON.parse(String(init?.body));expect(payload.subject).toContain("reset your password");code=payload.textContent.match(/code is (\d{6})/)[1];return new Response(JSON.stringify({messageId:"isolated-recovery"}),{status:201});});vi.stubGlobal("fetch",provider);
    try{
      const requested=await emailApi.post("/auth/password-recovery/request").send({email});expect(requested.status).toBe(202);
      const proof={email,emailChallengeId:requested.body.challengeId,emailOtp:code};
      expect((await emailApi.post("/auth/register").send({name:"Wrong purpose",phone:"+919888000002",password,...proof})).body.code).toBe("OTP_INVALID");
      const newPassword="New-only-recovery-password-2026";
      expect((await emailApi.post("/auth/password-recovery/reset").send({...proof,newPassword})).status).toBe(204);
      expect((await emailApi.get("/auth/me").set("Authorization",`Bearer ${previous.token}`)).status).toBe(401);
      expect((await emailApi.post("/auth/password-recovery/reset").send({...proof,newPassword})).status).toBe(400);
      expect((await emailApi.post("/auth/login").send({phone,password})).status).toBe(401);
      expect((await emailApi.post("/auth/login").send({phone,password:newPassword})).status).toBe(200);
    }finally{vi.unstubAllGlobals();}
  });
  it("returns a generic recovery request for unknown emails without sending mail",async()=>{
    const provider=vi.fn();vi.stubGlobal("fetch",provider);
    try{const result=await emailApi.post("/auth/password-recovery/request").send({email:"unknown-recovery@example.test"});expect(result.status).toBe(202);expect(result.body.challengeId).toBeTruthy();expect(provider).not.toHaveBeenCalled();expect((await emailApi.post("/auth/password-recovery/reset").send({email:"unknown-recovery@example.test",emailChallengeId:result.body.challengeId,emailOtp:"123456",newPassword:password})).status).toBe(400);}finally{vi.unstubAllGlobals();}
  });
  it("invalidates recovery after a new login changes the bound auth version",async()=>{
    const email="recover-stale@example.test",phone="+919888000003",user=await createUser({name:"Recovery stale",phone,password});await User.updateOne({_id:user._id},{$set:{email,emailVerifiedAt:new Date()}});let code="";
    vi.stubGlobal("fetch",vi.fn(async(_url:unknown,init?:RequestInit)=>{code=JSON.parse(String(init?.body)).textContent.match(/code is (\d{6})/)[1];return new Response(JSON.stringify({messageId:"stale-test"}),{status:201});}));
    try{const result=await emailApi.post("/auth/password-recovery/request").send({email});await login({phone,password},emailConfig,"stale-login");expect((await emailApi.post("/auth/password-recovery/reset").send({email,emailChallengeId:result.body.challengeId,emailOtp:code,newPassword:"New-stale-test-password"})).status).toBe(400);expect((await EmailChallenge.findById(result.body.challengeId))!.state).toBe("sent");}finally{vi.unstubAllGlobals();}
  });
  beforeEach(async()=>{await (await import("../src/auth/models.js")).Throttle.deleteMany({});});
  afterEach(async()=>{await (await import("../src/auth/models.js")).Throttle.deleteMany({});});
  const emailConfig={...config,EMAIL_OTP_REQUIRED:true,EMAIL_OTP_SECRET:"isolated-email-secret-".repeat(4),BREVO_API_KEY:"isolated-brevo-key-not-real",EMAIL_FROM:"sender@example.test"},emailApi=request(createApp(emailConfig));
  async function send(email:string){
    let code="";const provider=vi.fn(async(_url:unknown,init?:RequestInit)=>{const payload=JSON.parse(String(init?.body));code=payload.textContent.match(/code is (\d{6})/)[1];expect(payload.sender.email).toBe(emailConfig.EMAIL_FROM);return new Response(JSON.stringify({messageId:"isolated-message"}),{status:201});});
    vi.stubGlobal("fetch",provider);const response=await emailApi.post("/auth/email-otp/send").send({email});return {response,code,provider};
  }
  it("fails closed without sender credentials and prevents direct registration bypass",async()=>{
    expect((await api.get("/auth/registration-options")).body.emailOtpAvailable).toBe(false);
    const closed=request(createApp({...config,EMAIL_OTP_REQUIRED:true}));
    expect((await closed.post("/auth/register").send({name:"Test",phone:"+919999000001",password})).status).toBe(503);
    expect((await emailApi.post("/auth/register").send({name:"Test",phone:"+919999000001",password})).body.code).toBe("EMAIL_VERIFICATION_REQUIRED");
    expect(await User.exists({phone:"+919999000001"})).toBeNull();
  });
  it("submits via HTTPS, stores only digests, enforces cooldown and consumes signup proof once",async()=>{
    try{
      const email="buyer-otp@example.test",{response,code,provider}=await send(email);expect(response.status).toBe(202);expect(response.body).not.toHaveProperty("code");expect(provider.mock.calls[0][0]).toBe("https://api.brevo.com/v3/smtp/email");
      const row=await EmailChallenge.findById(response.body.challengeId).select("+digest").lean();expect(row!.digest).not.toBe(code);expect(row!.digest).toHaveLength(64);
      expect((await emailApi.post("/auth/email-otp/send").send({email})).status).toBe(429);
      const input={name:"OTP Buyer",phone:"+919999000002",password,email,emailChallengeId:response.body.challengeId,emailOtp:code};
      const registered=await emailApi.post("/auth/register").send(input);expect(registered.status).toBe(201);
      const user=await User.findById(registered.body.userId).lean();expect(user!.email).toBe(email);expect(user!.emailVerifiedAt).toBeInstanceOf(Date);
      expect((await emailApi.post("/auth/register").send({...input,phone:"+919999000003"})).body.code).toBe("OTP_INVALID");
    }finally{vi.unstubAllGlobals();}
  });
  it("limits wrong guesses, rejects expired codes and invalidates old codes on resend",async()=>{
    try{
      const email="limits-otp@example.test",{response,code}=await send(email),base={name:"Test",phone:"+919999000004",password,email,emailChallengeId:response.body.challengeId};
      for(let i=0;i<5;i++)expect((await emailApi.post("/auth/register").send({...base,emailOtp:code==="000000" ? "111111" : "000000"})).body.code).toBe("OTP_INVALID");
      expect((await emailApi.post("/auth/register").send({...base,emailOtp:code})).body.code).toBe("OTP_INVALID");
      const original=await EmailChallenge.findById(response.body.challengeId).lean();
      await EmailCooldown.updateOne({_id:original!.target},{$set:{expiresAt:new Date(0)}});
      const next=await send(email);expect(next.response.status).toBe(202);expect((await EmailChallenge.findById(response.body.challengeId))!.state).toBe("superseded");
      await EmailChallenge.updateOne({_id:next.response.body.challengeId},{$set:{expiresAt:new Date(0)}});
      expect((await emailApi.post("/auth/register").send({...base,emailChallengeId:next.response.body.challengeId,emailOtp:next.code})).body.code).toBe("OTP_INVALID");
    }finally{vi.unstubAllGlobals();}
  });
  it("rejects unconfirmed provider sends without exposing provider response or enabling a code",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({message:"private provider error"}),{status:401})));
    try{const result=await emailApi.post("/auth/email-otp/send").send({email:"failed-otp@example.test"});expect(result.status).toBe(502);expect(JSON.stringify(result.body)).not.toContain("private provider error");expect((await EmailChallenge.findOne({email:"failed-otp@example.test"}))!.state).toBe("failed");}finally{vi.unstubAllGlobals();}
  });
  it("allows only one concurrent registration to consume the same code",async()=>{
    try{
      const email="race-otp@example.test",{response,code}=await send(email),input={name:"OTP race",password,email,emailChallengeId:response.body.challengeId,emailOtp:code};
      const results=await Promise.all([emailApi.post("/auth/register").send({...input,phone:"+919999000011"}),emailApi.post("/auth/register").send({...input,phone:"+919999000012"})]);
      expect(results.map(row=>row.status).sort()).toEqual([201,400]);expect(await User.countDocuments({email})).toBe(1);
    }finally{vi.unstubAllGlobals();}
  });
  it("rolls back OTP consumption when seller setup fails, then permits a valid seller signup",async()=>{
    try{
      const email="seller-otp@example.test",{response,code}=await send(email),input={name:"OTP Seller",phone:"+919999000005",password,email,emailChallengeId:response.body.challengeId,emailOtp:code,shop:{name:"OTP test shop",address:"Test street",categoryIds:[categoryId],serviceAreaIds:[randomUUID()],since:2020,fulfilment:["pickup"]}};
      expect((await emailApi.post("/auth/register/seller").send(input)).status).toBe(400);expect((await EmailChallenge.findById(response.body.challengeId))!.state).toBe("sent");expect(await User.exists({phone:input.phone})).toBeNull();
      const result=await emailApi.post("/auth/register/seller").send({...input,shop:{...input.shop,serviceAreaIds:[areaId]}});expect(result.status).toBe(201);expect((await User.findById(result.body.userId))!.email).toBe(email);expect((await Shop.findOne({ownerId:result.body.userId}))!.status).toBe("pending");
    }finally{vi.unstubAllGlobals();}
  });
});
describe("private durable notifications",()=>{
  const pushConfig={...config,FIREBASE_PUSH_ENABLED:true,FIREBASE_PROJECT_ID:"isolated-test",GOOGLE_APPLICATION_CREDENTIALS:"never-read-in-mocked-test.json"};
  const pushApi=request(createApp(pushConfig));
  it("binds push to the current session without exposing tokens or accepting roles",async()=>{
    expect((await pushApi.put("/notifications/push").send({token:"a".repeat(50)})).status).toBe(401);
    expect((await pushApi.put("/notifications/push").set("Authorization",auth(buyer)).send({token:"a".repeat(50),role:"admin"})).status).toBe(400);
    expect((await api.put("/notifications/push").set("Authorization",auth(buyer)).send({token:"a".repeat(50)})).status).toBe(503);
    expect((await pushApi.put("/notifications/push").set("Authorization",auth(buyer)).send({token:"a".repeat(50)})).status).toBe(204);
    const status=await pushApi.get("/notifications/push").set("Authorization",auth(buyer));expect(status.body).toEqual({available:true,subscribed:true});
    expect((await pushApi.get("/notifications/push").set("Authorization",auth(seller))).body.subscribed).toBe(false);
    expect((await pushApi.put("/notifications/push").set("Authorization",auth(seller)).send({token:"a".repeat(50)})).status).toBe(409);
    expect((await pushApi.delete("/notifications/push").set("Authorization",auth(buyer))).status).toBe(204);
  });
  it("queues once atomically, sends once, and never sends to revoked sessions",async()=>{
    const token="b".repeat(60),key=randomUUID();
    await pushApi.put("/notifications/push").set("Authorization",auth(buyer)).send({token});
    for(let i=0;i<2;i++)await mongoose.connection.transaction(session=>notify(key,{userId:buyer.id},"Private details","Never on lockscreen","/account",session));
    expect(await PushJob.countDocuments({notificationId:readNotificationKey(key)})).toBe(1);
    const send=vi.fn(async()=>"mock-provider-acceptance");expect((await sweepPush(pushConfig,send)).sent).toBe(1);expect(send).toHaveBeenCalledWith(token,readNotificationKey(key));
    await sweepPush(pushConfig,send);expect(send).toHaveBeenCalledTimes(1);
    await mongoose.connection.transaction(session=>notify(`${key}:revoked`,{userId:buyer.id},"Details","Details","/account",session));
    await PushSubscription.updateOne({_id:pushId(token)},{$set:{sessionId:"revoked-session"}});
    expect((await sweepPush(pushConfig,send)).discarded).toBe(1);expect(send).toHaveBeenCalledTimes(1);
    await PushSubscription.deleteOne({_id:pushId(token)});
  });
  it("retries transient push failures and removes invalid registrations",async()=>{
    const token="c".repeat(60),key=randomUUID();
    await pushApi.put("/notifications/push").set("Authorization",auth(buyer)).send({token});
    await mongoose.connection.transaction(session=>notify(key,{userId:buyer.id},"Details","Details","/account",session));
    expect((await sweepPush(pushConfig,async()=>{throw new Error("temporary");})).retry).toBe(1);
    await PushJob.updateOne({notificationId:readNotificationKey(key)},{$set:{nextAt:new Date(0)}});
    expect((await sweepPush(pushConfig,async()=>{throw Object.assign(new Error("invalid"),{code:"messaging/registration-token-not-registered"});})).discarded).toBe(1);
    expect(await PushSubscription.exists({_id:pushId(token)})).toBeNull();
  });
  it("requires authentication and prevents cross-account reads",async()=>{
    const id=randomUUID();
    await Notification.create({_id:id,recipientId:buyer.id,title:"Private update",body:"Order details",link:"/orders",createdAt:new Date()});
    expect((await api.get("/notifications")).status).toBe(401);
    const page=await api.get("/notifications").set("Authorization",auth(buyer));
    expect(page.status).toBe(200);expect(page.body.some((row:{id:string})=>row.id===id)).toBe(true);
    expect((await api.post(`/notifications/${id}/read`).set("Authorization",auth(seller)).send({})).status).toBe(404);
    for(let i=0;i<2;i++)expect((await api.post(`/notifications/${id}/read`).set("Authorization",auth(buyer)).send({})).status).toBe(204);
    expect(await NotificationRead.countDocuments({notificationId:id,userId:buyer.id})).toBe(1);
  });
  it("keeps admin broadcast reads personal and cursors scoped",async()=>{
    const id=randomUUID();await Notification.create({_id:id,admin:true,title:"Review",body:"Review shop",link:"/admin/partners",createdAt:new Date()});
    const page=await api.get("/notifications?limit=1").set("Authorization",auth(admin));
    expect(page.status).toBe(200);expect(page.body[0].id).toBe(id);
    expect((await api.post(`/notifications/${id}/read`).set("Authorization",auth(buyer)).send({})).status).toBe(404);
    expect((await api.post(`/notifications/${id}/read`).set("Authorization",auth(admin)).send({})).status).toBe(204);
    expect(await NotificationRead.countDocuments({notificationId:id,userId:buyer.id})).toBe(0);
    const cursor=page.headers["x-next-cursor"];
    expect(cursor).toBeTruthy();expect((await api.get(`/notifications?cursor=${encodeURIComponent(cursor)}`).set("Authorization",auth(buyer))).status).toBe(400);
    expect((await api.get("/notifications?limit=51").set("Authorization",auth(buyer))).status).toBe(400);
    const count=await api.get("/notifications/unread-count").set("Authorization",auth(admin));expect(count.status).toBe(200);expect(typeof count.body.count).toBe("number");
  });
  it("deduplicates events and rolls back notifications with business transactions",async()=>{
    const key=randomUUID(),title=`Test ${key}`;
    for(let i=0;i<2;i++)await mongoose.connection.transaction(session=>notify(key,{userId:buyer.id},title,"Details","/orders",session));
    expect(await Notification.countDocuments({title})).toBe(1);
    await expect(mongoose.connection.transaction(async session=>{await notify(`${key}:rollback`,{userId:buyer.id},`${title} rollback`,"Details","/orders",session);throw new Error("rollback");})).rejects.toThrow("rollback");
    expect(await Notification.countDocuments({title:`${title} rollback`})).toBe(0);
  });
});
describe("COD orders with explicitly enabled isolated configuration",()=>{
  const enabled=request(createApp({...config,ORDERS_COD_ENABLED:true}));
  async function fixture(run:(product:string,address:string)=>Promise<void>){
    await Order.init();await InventoryReservation.init();
    const shop=await Shop.findById(shopId),area=await Area.findById(areaId);
    await Shop.updateOne({_id:shopId},{$set:{temporarilyClosed:false,openingHours:Array.from({length:7},(_,day)=>({day,opens:"00:00",closes:"23:59"})),fulfilment:["pickup","seller_delivery","platform_delivery"],areaIds:[areaId],deliveryFeeCents:1500,minimumOrderCents:0}});
    await Area.updateOne({_id:areaId},{$addToSet:{pincodes:"999999"}});
    const product=await Product.create({_id:randomUUID(),shopId,categoryId,name:"Order snapshot listing",sortName:"order snapshot listing",unit:"pack",description:"",priceCents:1250,stock:5,sortPriceCents:1250,totalStock:5,variants:[],active:true});
    const address=(await api.post("/addresses").set("Authorization",auth(buyer)).send({label:"Test order address",line1:"Isolated test lane",locality:"Test",city:"Test",pincode:"999999"})).body;
    try {await run(product._id,address.id);} finally {
      await Order.deleteMany({"subOrders.lines.productId":product._id});await InventoryReservation.deleteMany({"lines.productId":product._id});await Product.deleteOne({_id:product._id});
      await api.delete(`/addresses/${address.id}`).set("Authorization",auth(buyer)).send({version:0});
      await Area.updateOne({_id:areaId},{$set:{pincodes:area!.pincodes}});
      await Shop.updateOne({_id:shopId},{$set:{status:shop!.status,active:shop!.active,temporarilyClosed:shop!.temporarilyClosed,openingHours:shop!.openingHours,fulfilment:shop!.fulfilment,areaIds:shop!.areaIds},$unset:{deliveryFeeCents:1,minimumOrderCents:1}});
      if(shop!.deliveryFeeCents!==undefined)await Shop.updateOne({_id:shopId},{$set:{deliveryFeeCents:shop!.deliveryFeeCents}});
      if(shop!.minimumOrderCents!==undefined)await Shop.updateOne({_id:shopId},{$set:{minimumOrderCents:shop!.minimumOrderCents}});
    }
  }
  const body=(product:string,address:string)=>({areaId,addressId:address,addressVersion:0,paymentMethod:"cod" as const,expectedTotal:25,items:[{productId:product,qty:2}],fulfilments:[{shopId,method:"pickup" as const}]});
  it("H01 blocks discovery, quote, fulfilment and reused-hold checkout after seller suspension",async()=>fixture(async(product,address)=>{
    const shop=await Shop.findById(shopId);
    const existingKey=randomUUID(),existing=await createCodOrder(buyer,existingKey,body(product,address));
    const key=randomUUID();await reserveInventory(buyer,{key,items:[{productId:product,qty:2}]});
    const accessVersion=(await User.findById(seller.id))!.accessVersion ?? 0;
    const access=async(active:boolean,version:number)=>enabled.patch(`/admin/users/${seller.id}/access`).set("Authorization",auth(admin)).send({active,version,reason:"Security regression seller suspension"});
    expect((await access(false,accessVersion)).status).toBe(200);
    try {
      expect((await api.get('/shops')).body.some((s:{id:string})=>s.id===shopId)).toBe(false);
      expect((await api.get(`/shops/${shop!.slug}`)).status).toBe(404);
      expect((await api.get(`/products/${product}`)).status).toBe(404);
      expect((await api.get('/products')).body.some((p:{id:string})=>p.id===product)).toBe(false);
      const quote=await api.post('/cart/quote').send({areaId,items:[{productId:product,qty:1}]});
      expect(quote.body.lines[0].issues[0].code).toBe('PRODUCT_UNAVAILABLE');
      const fulfilment=await enabled.post('/cart/fulfilment').set('Authorization',auth(buyer)).send({addressId:address,shopIds:[shopId]});
      expect(fulfilment.body.shops[0].issues[0].code).toBe('SHOP_UNAVAILABLE');
      await expect(reserveInventory(buyer,{key:randomUUID(),items:[{productId:product,qty:1}]})).rejects.toMatchObject({code:'SHOP_UNAVAILABLE'});
      await expect(createCodOrder(buyer,key,body(product,address))).rejects.toMatchObject({code:'SHOP_UNAVAILABLE'});
      expect((await Product.findById(product))!.stock).toBe(1);
      expect(await Order.countDocuments({'subOrders.lines.productId':product})).toBe(1);
      const replay=await createCodOrder(buyer,existingKey,body(product,address));
      expect(replay.replayed).toBe(true);expect(replay.order._id).toBe(existing.order._id);
    } finally {
      expect((await access(true,accessVersion+1)).status).toBe(200);
      const user=await User.findById(seller.id);tokens[seller.id]=(await login({phone:user!.phone,password},config,'security-restore')).token;
    }
    expect((await api.get(`/shops/${shop!.slug}`)).status).toBe(200);
    await Shop.updateOne({_id:shopId},{$set:{status:'suspended'}});
    expect((await api.get(`/shops/${shop!.slug}`)).status).toBe(404);
  }));
  it("H01 retries checkout against a concurrent admin block without committing stock",async()=>fixture(async(product,address)=>{
    let reached!:()=>void,release!:()=>void;
    const waiting=new Promise<void>(resolve=>{reached=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
    const original=User.updateOne.bind(User);
    const spy=vi.spyOn(User,'updateOne');
    // Pause after the transaction's snapshot reads but before its owner fence write.
    spy.mockImplementationOnce(((...args:Parameters<typeof User.updateOne>)=>{
      reached();return gate.then(()=>original(...args));
    }) as typeof User.updateOne);
    const version=(await User.findById(seller.id))!.accessVersion ?? 0;
    const pending=createCodOrder(buyer,randomUUID(),body(product,address));
    // Attach rejection immediately while the request is deliberately paused.
    const outcome=pending.then(()=>null,error=>error);
    try {
      await waiting;
      const blocked=await enabled.patch(`/admin/users/${seller.id}/access`).set('Authorization',auth(admin)).send({active:false,version,reason:'Security regression concurrent block'});
      expect(blocked.status).toBe(200);release();
      expect(await outcome).toMatchObject({code:'SHOP_UNAVAILABLE'});
      expect((await Product.findById(product))!.stock).toBe(5);
      expect(await Order.countDocuments({'subOrders.lines.productId':product})).toBe(0);
    } finally {
      release();spy.mockRestore();await outcome;
      await enabled.patch(`/admin/users/${seller.id}/access`).set('Authorization',auth(admin)).send({active:true,version:version+1,reason:'Security regression restore account'});
      const user=await User.findById(seller.id);tokens[seller.id]=(await login({phone:user!.phone,password},config,'security-race-restore')).token;
    }
  }));
  it("lets only the buyer cancel before preparation, idempotently returns stock and updates COD due",async()=>fixture(async(product,address)=>{
    const created=await createCodOrder(buyer,randomUUID(),body(product,address)),id=created.order._id,sub=created.order.subOrders[0],path=`/orders/${id}/suborders/${sub._id}/cancel`;
    expect((await enabled.post(path).set("Authorization",auth(seller)).send({version:0,reason:"Changed plans"})).status).toBe(403);
    await expect(cancelBuyerSuborder({id:otherSeller.id,role:"buyer"},id,sub._id,{version:0,reason:"Changed plans"})).rejects.toMatchObject({code:"NOT_FOUND"});
    expect((await enabled.post(path).set("Authorization",auth(buyer)).send({version:0,reason:""})).status).toBe(400);
    for(let i=0;i<2;i++)expect((await enabled.post(path).set("Authorization",auth(buyer)).send({version:0,reason:"Changed plans"})).status).toBe(204);
    expect((await Product.findById(product))!.stock).toBe(5);const order=await Order.findById(id);expect(order!.subOrders[0].status).toBe("cancelled");expect(order!.subOrders[0].history).toHaveLength(1);expect(order!.totalCents).toBe(2500);
  }));
  it("serializes buyer cancellation against seller preparation and preserves inventory",async()=>fixture(async(product,address)=>{
    const {order}=await createCodOrder(buyer,randomUUID(),body(product,address)),sub=order.subOrders[0];await transitionSellerSuborder(seller,order._id,sub._id,{version:0,status:"accepted"});
    const results=await Promise.allSettled([cancelBuyerSuborder(buyer,order._id,sub._id,{version:1,reason:"Changed plans"}),transitionSellerSuborder(seller,order._id,sub._id,{version:1,status:"preparing"})]);expect(results.filter(row=>row.status==="fulfilled")).toHaveLength(1);
    const stored=await Order.findById(order._id);expect(["cancelled","preparing"]).toContain(stored!.subOrders[0].status);expect((await Product.findById(product))!.stock).toBe(stored!.subOrders[0].status==="cancelled" ? 5 : 3);
  }));
  it("shows admin attention queues without customer/receipt/provider secrets",async()=>fixture(async(product,address)=>{
    const {order}=await createCodOrder(buyer,randomUUID(),body(product,address));await Order.updateOne({_id:order._id},{$set:{createdAt:new Date(0),"subOrders.0.updatedAt":new Date(0)}});
    expect((await enabled.get("/admin/operations").set("Authorization",auth(buyer))).status).toBe(403);
    const result=await enabled.get("/admin/operations").set("Authorization",auth(admin));expect(result.status).toBe(200);expect(result.body.staleSuborders.items.some((row:{orderId:string})=>row.orderId===order._id)).toBe(true);expect(result.body.thresholds.orderStaleMinutes).toBe(60);expect(result.body.totals).toEqual({shops:await Shop.countDocuments({}),products:await Product.countDocuments({})});expect(result.body.staleSuborders.items.length).toBeLessThanOrEqual(10);expect(JSON.stringify(result.body)).not.toContain("Isolated test lane");expect(JSON.stringify(result.body)).not.toContain("receipt");
  }));
  const acknowledgement=(version=3)=>({version,confirmReceived:true as const,confirmCashPaid:true as const});
  const paymentConfig={...config,RAZORPAY_ENABLED:true,RAZORPAY_KEY_ID:"rzp_test_isolated",RAZORPAY_KEY_SECRET:"isolated-provider-secret-for-unit-tests",RAZORPAY_WEBHOOK_SECRET:"isolated-webhook-secret-for-unit-tests"};
  const online=request(createApp(paymentConfig));
  const refundApi=request(createApp({...paymentConfig,RAZORPAY_REFUNDS_ENABLED:true}));
  const recoveryConfig={...paymentConfig,PAYMENT_RECOVERY_WORKER_ENABLED:true};
  it("does not quote a product whose subcategory is inactive",async()=>fixture(async(product,_address)=>{
    const category=await Category.findById(categoryId).lean(),subId=randomUUID();
    try{await Category.updateOne({_id:categoryId},{$push:{subcategories:{_id:subId,slug:"audit-inactive",name:"Inactive audit fixture",active:false}}});await Product.updateOne({_id:product},{$set:{subcategoryId:subId}});
      const review=await api.post("/cart/quote").send({areaId,items:[{productId:product,qty:1}]});expect(review.status).toBe(200);expect(review.body.lines[0].issues[0].code).toBe("PRODUCT_UNAVAILABLE");expect(review.body.lines[0].unitPrice).toBeUndefined();expect(review.body.itemsSubtotal).toBe(0);
    }finally{await Category.updateOne({_id:categoryId},{$set:{subcategories:category!.subcategories}});}
  }));
  it("rejects a provider payment/refund response with a different requested identifier",async()=>fixture(async(product,address)=>{
    const {id,subId,paymentId}=await paidRefundFixture(product,address);
    const row=await OnlinePayment.findById(id).lean();
    const callback={razorpay_order_id:row!.providerOrderId,razorpay_payment_id:paymentId,razorpay_signature:createHmac("sha256",paymentConfig.RAZORPAY_KEY_SECRET).update(`${row!.providerOrderId}|${paymentId}`).digest("hex")};
    const fetcher=vi.fn(async(url:string)=>new Response(JSON.stringify(url.endsWith(`/orders/${row!.providerOrderId}`) ? {id:row!.providerOrderId,amount:2500,currency:"INR",receipt:id,status:"paid"} : {id:"pay_different",order_id:row!.providerOrderId,amount:2500,currency:"INR",status:"captured",captured:true,amount_refunded:0})));
    vi.stubGlobal("fetch",fetcher);
    try{
      expect((await online.post(`/payments/razorpay/orders/${id}/verify`).set("Authorization",auth(buyer)).send(callback)).status).toBe(409);
      await transitionSellerSuborder(seller,id,subId,{version:0,status:"cancelled",reason:"Audit fixture cannot supply"});
      await Refund.updateOne({_id:subId},{$set:{providerRefundId:"rfnd_expected",state:"pending"}});
      fetcher.mockImplementation(async()=>new Response(JSON.stringify({id:"rfnd_different",payment_id:paymentId,amount:2500,currency:"INR",receipt:subId,status:"processed"})));
      expect((await refundApi.post(`/admin/refunds/${subId}/reconcile`).set("Authorization",auth(admin)).send({})).status).toBe(409);
      expect((await Refund.findById(subId))!.state).toBe("pending");
    }finally{vi.unstubAllGlobals();await cleanRefundFixture(id);}
  }));
  it("cannot resume a test-mode order against live credentials after a payment-record creation gap",async()=>fixture(async(product,address)=>{
    const key=randomUUID(),input=body(product,address);const created=await createCodOrder(buyer,key,input,"razorpay",true);
    const live=request(createApp({...paymentConfig,RAZORPAY_KEY_ID:"rzp_live_isolated",RAZORPAY_LIVE_ENABLED:true}));
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    try{const result=await live.post("/payments/razorpay/orders").set("Authorization",auth(buyer)).set("Idempotency-Key",key).send({...input,paymentMethod:"razorpay"});expect(result.status).toBe(409);expect(result.body.code).toBe("PAYMENT_ACCOUNT_CHANGED");expect(fetcher).not.toHaveBeenCalled();expect(await OnlinePayment.exists({_id:created.order._id})).toBeNull();expect((await Product.findById(product))!.stock).toBe(3);}finally{vi.unstubAllGlobals();}
  }));
  async function recoveryFixture(product:string,address:string){
    const {order}=await createCodOrder(buyer,randomUUID(),body(product,address),"razorpay",true);
    await OnlinePayment.init();await Refund.init();
    const suffix=order._id.replaceAll("-","");
    await OnlinePayment.create({_id:order._id,buyerId:buyer.id,keyId:paymentConfig.RAZORPAY_KEY_ID,state:"ready",providerOrderId:`order_${suffix}`,amountCents:order.totalCents,createdAt:new Date()});
    return {id:order._id,providerOrderId:`order_${suffix}`,paymentId:`pay_${suffix}`};
  }
  it("recovers a missed capture using provider GETs once across concurrent workers without changing stock",async()=>fixture(async(product,address)=>{
    const {id,providerOrderId,paymentId}=await recoveryFixture(product,address);
    const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{expect(init?.method).toBe("GET");return new Response(JSON.stringify(url.endsWith("/payments") ? {items:[{id:paymentId,order_id:providerOrderId,amount:2500,currency:"INR",status:"captured",captured:true,amount_refunded:0}]} : {id:providerOrderId,amount:2500,currency:"INR",receipt:id,status:"paid"}));});vi.stubGlobal("fetch",fetcher);
    try{
      expect((await sweepPaymentRecovery(paymentConfig)).claimed).toBe(0);expect(fetcher).not.toHaveBeenCalled();
      await OnlinePayment.updateOne({_id:id},{$set:{keyId:"rzp_test_otheraccount"}});expect((await sweepPaymentRecovery(recoveryConfig)).claimed).toBe(0);expect(fetcher).not.toHaveBeenCalled();await OnlinePayment.updateOne({_id:id},{$set:{keyId:paymentConfig.RAZORPAY_KEY_ID}});
      const passes=await Promise.all([sweepPaymentRecovery(recoveryConfig),sweepPaymentRecovery(recoveryConfig)]);
      expect(passes.reduce((sum,pass)=>sum+pass.claimed,0)).toBe(1);expect((await Order.findById(id))!.paymentStatus).toBe("paid");expect((await Product.findById(product))!.stock).toBe(3);
      expect(fetcher).toHaveBeenCalledTimes(2);expect((await sweepPaymentRecovery(recoveryConfig)).claimed).toBe(0);
      const detail=await online.get(`/admin/payments/${id}`).set("Authorization",auth(admin));expect(detail.body.recovery.lastCheckedAt).toBeTruthy();expect(detail.body.recovery.nextCheckAt).toBeNull();expect(detail.body.recovery.manualReview).toBe(false);expect(detail.body.recovery).not.toHaveProperty("leaseId");
    }finally{vi.unstubAllGlobals();await cleanRefundFixture(id);}
  }));
  it("backs off failed checks and flags old unpaid records without freeing inventory",async()=>fixture(async(product,address)=>{
    const {id}=await recoveryFixture(product,address);
    await OnlinePayment.updateOne({_id:id},{$set:{createdAt:new Date(Date.now()-25*3_600_000),"recovery.failures":7}});
    const fetcher=vi.fn().mockRejectedValue(new Error("isolated provider timeout"));vi.stubGlobal("fetch",fetcher);
    try{
      await OnlinePayment.updateOne({_id:id},{$set:{"recovery.leaseId":"isolated-old-worker","recovery.leaseUntil":new Date(Date.now()+120_000)}});expect((await sweepPaymentRecovery(recoveryConfig)).claimed).toBe(0);expect(fetcher).not.toHaveBeenCalled();await OnlinePayment.updateOne({_id:id},{$set:{"recovery.leaseUntil":new Date(Date.now()-1000)}});
      const result=await sweepPaymentRecovery(recoveryConfig);expect(result.failed).toBe(1);expect(result.review).toBe(1);
      const record=await OnlinePayment.findById(id).lean();expect(record!.recovery).toMatchObject({failures:8,manualReview:true,code:"PAYMENT_PROVIDER_UNAVAILABLE"});expect(record!.recovery!.nextCheckAt!.getTime()).toBeGreaterThan(Date.now()+3_500_000);
      expect((await sweepPaymentRecovery(recoveryConfig)).claimed).toBe(0);expect(fetcher).toHaveBeenCalledTimes(1);expect((await Order.findById(id))!.paymentStatus).toBe("unpaid");expect((await Product.findById(product))!.stock).toBe(3);
      expect((await sweepPaymentRecovery(recoveryConfig,{shouldStop:()=>true})).claimed).toBe(0);
      fetcher.mockImplementation(async(url:string)=>new Response(JSON.stringify(url.endsWith("/payments") ? {items:[{id:"pay_manualrecovery",order_id:record!.providerOrderId,amount:2500,currency:"INR",status:"captured",captured:true,amount_refunded:0}]} : {id:record!.providerOrderId,amount:2500,currency:"INR",receipt:id,status:"paid"})));
      expect((await online.post(`/payments/razorpay/orders/${id}/reconcile`).set("Authorization",auth(buyer)).send({})).body.paymentStatus).toBe("paid");
      expect((await OnlinePayment.findById(id))!.recovery).toMatchObject({manualReview:false,nextCheckAt:null});expect((await Product.findById(product))!.stock).toBe(3);
    }finally{vi.unstubAllGlobals();await cleanRefundFixture(id);}
  }));
  it("checks only mapped existing refunds and never submits refund requests",async()=>fixture(async(product,address)=>{
    const {id,subId,paymentId}=await paidRefundFixture(product,address);
    const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{expect(init?.method).toBe("GET");return new Response(JSON.stringify({id:"rfnd_worker",payment_id:paymentId,amount:2500,currency:"INR",receipt:subId,status:"processed"}));});vi.stubGlobal("fetch",fetcher);
    try{
      await transitionSellerSuborder(seller,id,subId,{version:0,status:"cancelled",reason:"Cannot supply"});
      expect((await sweepPaymentRecovery(recoveryConfig)).claimed).toBe(0);expect(fetcher).not.toHaveBeenCalled();
      await Refund.updateOne({_id:subId},{$set:{state:"pending",providerRefundId:"rfnd_worker"}});
      const result=await sweepPaymentRecovery(recoveryConfig);expect(result.claimed).toBe(1);expect((await Refund.findById(subId))!.state).toBe("processed");expect((await Product.findById(product))!.stock).toBe(5);expect(fetcher).toHaveBeenCalledTimes(1);
    }finally{vi.unstubAllGlobals();await cleanRefundFixture(id);}
  }));
  async function paidRefundFixture(product:string,address:string){
    await OnlinePayment.init();await Refund.init();
    const {order}=await createCodOrder(buyer,randomUUID(),body(product,address),"razorpay",true);
    await Order.updateOne({_id:order._id},{$set:{paymentStatus:"paid"}});
    const suffix=order._id.replaceAll("-","");
    await OnlinePayment.create({_id:order._id,buyerId:buyer.id,keyId:paymentConfig.RAZORPAY_KEY_ID,state:"paid",providerOrderId:`order_${suffix}`,providerPaymentId:`pay_${suffix}`,amountCents:order.totalCents,createdAt:new Date(),paidAt:new Date()});
    return {id:order._id,subId:order.subOrders[0]._id,paymentId:`pay_${suffix}`};
  }
  async function cleanRefundFixture(id:string){await Refund.deleteMany({orderId:id});await OnlinePayment.deleteOne({_id:id});await PaymentAudit.deleteMany({orderId:id});await PaymentEvent.deleteMany({_id:{$in:["refund-test-processed","refund-test-old"]}});}
  it("buyer prepaid cancellation creates one requested refund and never claims bank credit",async()=>fixture(async(product,address)=>{
    const {id,subId}=await paidRefundFixture(product,address);
    try{for(let i=0;i<2;i++)await cancelBuyerSuborder(buyer,id,subId,{version:0,reason:"Changed plans"});expect(await Refund.countDocuments({orderId:id})).toBe(1);const refund=await Refund.findOne({orderId:id});expect(refund!.state).toBe("requested");expect(refund!.amountCents).toBe(2500);expect((await Product.findById(product))!.stock).toBe(5);}finally{await cleanRefundFixture(id);}
  }));
  it("cancels only owned prepaid stock once, requests exact refund and requires admin confirmation to submit",async()=>fixture(async(product,address)=>{
    const {id,subId,paymentId}=await paidRefundFixture(product,address);
    let processed=false,posts=0;
    const remote=()=>({id:"rfnd_isolated",payment_id:paymentId,amount:2500,currency:"INR",receipt:subId,status:processed ? "processed" : "pending"});
    vi.stubGlobal("fetch",vi.fn(async(_url:string,init?:RequestInit)=>{if(init?.method==="POST"){posts++;expect((init.headers as Record<string,string>)["X-Refund-Idempotency"]).toBe(subId);expect(JSON.parse(String(init.body))).toEqual({amount:2500,speed:"normal",receipt:subId});}return new Response(JSON.stringify(remote()));}));
    try{
      await expect(transitionSellerSuborder(otherSeller,id,subId,{version:0,status:"cancelled",reason:"Cannot supply"})).rejects.toMatchObject({code:"NOT_FOUND"});
      const command={version:0,status:"cancelled" as const,reason:"Cannot supply before preparation"};
      const results=await Promise.all([transitionSellerSuborder(seller,id,subId,command),transitionSellerSuborder(seller,id,subId,command)]);
      expect(results.every(row=>row.refund?.state==="requested")).toBe(true);expect(await Refund.countDocuments({orderId:id})).toBe(1);expect((await Product.findById(product))!.stock).toBe(5);
      expect((await online.post(`/admin/refunds/${subId}/submit`).set("Authorization",auth(admin)).send({confirmRefund:true})).status).toBe(503);expect(posts).toBe(0);
      for(const who of [buyer,seller,otherSeller,delivery])expect((await refundApi.post(`/admin/refunds/${subId}/submit`).set("Authorization",auth(who)).send({confirmRefund:true})).status).toBe(403);
      expect((await refundApi.post(`/admin/refunds/${subId}/submit`).set("Authorization",auth(admin)).send({confirmRefund:true,amount:1})).status).toBe(400);
      expect((await refundApi.post(`/admin/refunds/${subId}/submit`).set("Authorization",auth(admin)).send({})).status).toBe(400);
      const submissions=await Promise.all([refundApi.post(`/admin/refunds/${subId}/submit`).set("Authorization",auth(admin)).send({confirmRefund:true}),refundApi.post(`/admin/refunds/${subId}/submit`).set("Authorization",auth(admin)).send({confirmRefund:true})]);
      expect(submissions.every(result=>[200,409].includes(result.status))).toBe(true);
      const submitted=submissions.find(result=>result.status===200)!;
      expect(submitted.status).toBe(200);expect(submitted.body.state).toBe("pending");expect(submitted.body.amount).toBe(25);expect(posts).toBe(1);
      await refundApi.post(`/admin/refunds/${subId}/submit`).set("Authorization",auth(admin)).send({confirmRefund:true});expect(posts).toBe(1);
      processed=true;
      const event=JSON.stringify({event:"refund.processed",payload:{refund:{entity:remote()}}}),signature=createHmac("sha256",paymentConfig.RAZORPAY_WEBHOOK_SECRET).update(event).digest("hex");
      for(let n=0;n<2;n++)expect((await refundApi.post("/webhooks/razorpay").set("Content-Type","application/json").set("x-razorpay-event-id","refund-test-processed").set("X-Razorpay-Signature",signature).send(event)).status).toBe(200);
      expect((await Refund.findById(subId))!.state).toBe("processed");
      const buyerOrder=await online.get(`/orders/${id}`).set("Authorization",auth(buyer));expect(buyerOrder.body.subOrders[0].refund).toMatchObject({state:"processed",amount:25});expect(buyerOrder.body.paymentStatus).toBe("paid");expect(buyerOrder.body.cashRecordedAmount).toBe(0);
      expect(buyerOrder.body.subOrders[0].refund).not.toHaveProperty("paymentId");
      processed=false;await refundApi.post(`/admin/refunds/${subId}/reconcile`).set("Authorization",auth(admin)).send({});expect((await Refund.findById(subId))!.state).toBe("processed");expect(posts).toBe(1);expect((await Product.findById(product))!.stock).toBe(5);
    }finally{vi.unstubAllGlobals();await cleanRefundFixture(id);}
  }));
  it("recovers a timed-out refund using the same immutable request and rejects mismatched provider amounts",async()=>fixture(async(product,address)=>{
    const {id,subId,paymentId}=await paidRefundFixture(product,address);const calls:{body:string;key:string}[]=[];let wrong=true;
    const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{
      if(init?.method==="POST"){calls.push({body:String(init.body),key:(init.headers as Record<string,string>)["X-Refund-Idempotency"]});if(calls.length===1)throw new Error("simulated lost response");}
      return new Response(JSON.stringify({id:"rfnd_recovered",payment_id:paymentId,amount:wrong ? 1 : 2500,currency:"INR",receipt:subId,status:"processed"}));
    });vi.stubGlobal("fetch",fetcher);
    try{
      await transitionSellerSuborder(seller,id,subId,{version:0,status:"cancelled",reason:"Cannot supply"});
      expect((await refundApi.post(`/admin/refunds/${subId}/submit`).set("Authorization",auth(admin)).send({confirmRefund:true})).status).toBe(502);expect((await Refund.findById(subId))!.state).toBe("uncertain");
      expect((await refundApi.post(`/admin/refunds/${subId}/submit`).set("Authorization",auth(admin)).send({confirmRefund:true})).status).toBe(409);expect((await Refund.findById(subId))!.state).not.toBe("processed");
      wrong=false;
      expect((await refundApi.post(`/admin/refunds/${subId}/submit`).set("Authorization",auth(admin)).send({confirmRefund:true})).body.state).toBe("processed");
      expect(calls).toHaveLength(3);expect(calls[0]).toEqual(calls[1]);expect(calls[1]).toEqual(calls[2]);expect((await Product.findById(product))!.stock).toBe(5);
    }finally{vi.unstubAllGlobals();await cleanRefundFixture(id);}
  }));
  it("does not create refund obligations after preparation or change inventory on rejected transitions",async()=>fixture(async(product,address)=>{
    const {id,subId}=await paidRefundFixture(product,address);
    try{await transitionSellerSuborder(seller,id,subId,{version:0,status:"accepted"});await transitionSellerSuborder(seller,id,subId,{version:1,status:"preparing"});await expect(transitionSellerSuborder(seller,id,subId,{version:2,status:"cancelled",reason:"Too late"})).rejects.toMatchObject({code:"INVALID_TRANSITION"});expect(await Refund.countDocuments({orderId:id})).toBe(0);expect((await Product.findById(product))!.stock).toBe(3);}finally{await cleanRefundFixture(id);}
  }));
  it("allows only admins to inspect paginated payment records even while checkout is disabled",async()=>{
    const ids=[randomUUID(),randomUUID(),randomUUID()];
    await OnlinePayment.create(ids.map((id,index)=>({_id:id,buyerId:buyer.id,keyId:index===2 ? "rzp_live_isolated" : paymentConfig.RAZORPAY_KEY_ID,state:index===0 ? "uncertain" as const : "paid" as const,amountCents:2500,createdAt:new Date(),...(index ? {providerOrderId:`order_list${index}`,providerPaymentId:`pay_list${index}`} : {})})));
    try{
      expect((await api.get("/admin/payments")).status).toBe(401);
      for(const who of [buyer,seller,delivery]){
        expect((await api.get("/admin/payments").set("Authorization",auth(who))).status).toBe(403);
        expect((await api.get(`/admin/payments/${ids[0]}`).set("Authorization",auth(who))).status).toBe(403);
        expect((await api.post(`/admin/payments/${ids[0]}/reconcile`).set("Authorization",auth(who)).send({})).status).toBe(403);
      }
      const page=await api.get("/admin/payments?mode=test&limit=1").set("Authorization",auth(admin));
      expect(page.status).toBe(200);expect(page.body).toHaveLength(1);expect(page.headers["cache-control"]).toBe("private, no-store");expect(page.headers["x-has-more"]).toBe("true");
      expect(page.body[0].onlineEnabled).toBe(false);expect(page.body[0].accountMatches).toBe(false);
      for(const key of ["buyerId","keyId","RAZORPAY_KEY_SECRET","address","receipt"])expect(page.body[0]).not.toHaveProperty(key);
      const cursor=encodeURIComponent(page.headers["x-next-cursor"]);
      const next=await api.get(`/admin/payments?mode=test&limit=1&cursor=${cursor}`).set("Authorization",auth(admin));
      expect(next.status).toBe(200);expect(next.body[0].orderId).not.toBe(page.body[0].orderId);
      expect((await api.get(`/admin/payments?mode=live&cursor=${cursor}`).set("Authorization",auth(admin))).status).toBe(400);
      expect((await api.get("/admin/payments?state=refunded").set("Authorization",auth(admin))).status).toBe(400);
      const uncertain=await api.get("/admin/payments?state=uncertain&mode=test").set("Authorization",auth(admin));expect(uncertain.body.map((row:{orderId:string})=>row.orderId)).toEqual([ids[0]]);
      const detail=await api.get(`/admin/payments/${ids[0]}`).set("Authorization",auth(admin));expect(detail.body.audit).toEqual([]);
      expect((await api.post(`/admin/payments/${ids[0]}/reconcile`).set("Authorization",auth(admin)).send({})).status).toBe(503);
    }finally{await OnlinePayment.deleteMany({_id:{$in:ids}});}
  });
  it("audits verified admin mapping recovery and rejects missing consent, mismatches and mapping replacement",async()=>fixture(async(product,address)=>{
    await OnlinePayment.init();await PaymentAudit.init();
    const provider=vi.fn().mockRejectedValueOnce(new Error("simulated create timeout"));vi.stubGlobal("fetch",provider);
    let id="";
    try{
      const created=await online.post("/payments/razorpay/orders").set("Authorization",auth(buyer)).set("Idempotency-Key",randomUUID()).send({...body(product,address),paymentMethod:"razorpay"});
      id=created.body.orderId;expect(created.body.state).toBe("uncertain");
      const mapping={providerOrderId:"order_recovered",confirmProviderOrder:true,reason:"Matched receipt in isolated test dashboard"};
      expect((await online.post(`/admin/payments/${id}/reconcile`).set("Authorization",auth(admin)).send({providerOrderId:mapping.providerOrderId})).status).toBe(400);
      provider.mockResolvedValueOnce(new Response(JSON.stringify({id:"order_recovered",amount:1,currency:"INR",receipt:id,status:"created"})));
      expect((await online.post(`/admin/payments/${id}/reconcile`).set("Authorization",auth(admin)).send(mapping)).status).toBe(409);
      expect((await OnlinePayment.findById(id))!.providerOrderId).toBeUndefined();
      provider.mockImplementation(async(url:string)=>new Response(JSON.stringify(url.endsWith("/payments") ? {items:[]} : {id:"order_recovered",amount:2500,currency:"INR",receipt:id,status:"created"})));
      const mapped=await online.post(`/admin/payments/${id}/reconcile`).set("Authorization",auth(admin)).send(mapping);
      expect(mapped.status).toBe(200);expect(mapped.body.paymentStatus).toBe("unpaid");expect((await OnlinePayment.findById(id))!.providerOrderId).toBe("order_recovered");
      expect((await Product.findById(product))!.stock).toBe(3);
      expect((await online.post(`/admin/payments/${id}/reconcile`).set("Authorization",auth(admin)).send({...mapping,providerOrderId:"order_different"})).status).toBe(409);
      const detail=await online.get(`/admin/payments/${id}`).set("Authorization",auth(admin));
      expect(detail.body.audit.some((row:{outcome:string})=>row.outcome==="not_captured")).toBe(true);
      expect(detail.body.audit.some((row:{code:string})=>row.code==="PAYMENT_MISMATCH")).toBe(true);
      expect(detail.body.audit.some((row:{action:string})=>row.action==="provider_order_bound")).toBe(true);
      expect(await PaymentAudit.exists({orderId:id,actorId:admin.id,reason:mapping.reason})).toBeTruthy();
      expect(JSON.stringify(detail.body)).not.toContain(paymentConfig.RAZORPAY_KEY_SECRET);
      expect(detail.body.audit[0]).not.toHaveProperty("actorId");expect(detail.body).not.toHaveProperty("buyerId");
      expect(provider.mock.calls.filter((call:unknown[])=> (call[1] as RequestInit|undefined)?.method==="POST")).toHaveLength(1);
    }finally{vi.unstubAllGlobals();await OnlinePayment.deleteMany({buyerId:buyer.id});if(id)await PaymentAudit.deleteMany({orderId:id});}
  }));
  it("recovers failed and pending attempts to late capture once across concurrent webhook and buyer checks",async()=>fixture(async(product,address)=>{
    await OnlinePayment.init();await PaymentEvent.init();let state="failed",id="",posts=0;
    const remoteOrder="order_recoverymatrix",remotePayment="pay_recoverymatrix",eventId=randomUUID();
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
      if(init?.method==="POST"){posts++;const input=JSON.parse(String(init.body));id=input.receipt;return new Response(JSON.stringify({id:remoteOrder,receipt:id,amount:2500,currency:"INR",status:"created"}));}
      if(url.endsWith(`/orders/${remoteOrder}`))return new Response(JSON.stringify({id:remoteOrder,receipt:id,amount:2500,currency:"INR",status:state==="captured"?"paid":"attempted"}));
      const row={id:remotePayment,order_id:remoteOrder,amount:2500,currency:"INR",captured:state==="captured",status:state};return new Response(JSON.stringify(url.endsWith("/payments")?{items:[row]}:row));
    }));
    try{
      const made=await online.post("/payments/razorpay/orders").set("Authorization",auth(buyer)).set("Idempotency-Key",randomUUID()).send({...body(product,address),paymentMethod:"razorpay"});expect(made.status).toBe(200);
      for(const pending of ["failed","created","authorized"]){state=pending;const check=await online.post(`/payments/razorpay/orders/${id}/reconcile`).set("Authorization",auth(buyer)).send({});expect(check.body.paymentStatus).toBe("unpaid");expect((await Product.findById(product))!.stock).toBe(3);expect(await Notification.countDocuments({_id:readNotificationKey(`${id}:seller:${shopId}`),recipientId:seller.id})).toBe(0);}
      const event=JSON.stringify({event:"payment.captured",payload:{payment:{entity:{id:remotePayment,order_id:remoteOrder}}}}),signature=createHmac("sha256",paymentConfig.RAZORPAY_WEBHOOK_SECRET).update(event).digest("hex");
      const webhook=()=>online.post("/webhooks/razorpay").set("Content-Type","application/json").set("X-Razorpay-Signature",signature).set("x-razorpay-event-id",eventId).send(event);
      expect((await webhook()).status).toBe(503);expect(await PaymentEvent.countDocuments({_id:eventId})).toBe(0);
      state="captured";const results=await Promise.all([webhook(),webhook(),online.post(`/payments/razorpay/orders/${id}/reconcile`).set("Authorization",auth(buyer)).send({})]);expect(results.map(r=>r.status)).toEqual([200,200,200]);
      expect(await PaymentEvent.countDocuments({_id:eventId})).toBe(1);expect((await OnlinePayment.findById(id))!.state).toBe("paid");expect(posts).toBe(1);expect((await Product.findById(product))!.stock).toBe(3);expect(await Notification.countDocuments({_id:readNotificationKey(`${id}:seller:${shopId}`),recipientId:seller.id})).toBe(1);
      state="failed";expect((await online.post(`/payments/razorpay/orders/${id}/reconcile`).set("Authorization",auth(buyer)).send({})).body.paymentStatus).toBe("paid");
    }finally{vi.unstubAllGlobals();await OnlinePayment.deleteMany({buyerId:buyer.id});await PaymentEvent.deleteOne({_id:eventId});}
  }));
  it("does not reopen checkout against an old payment account after credentials rotate",async()=>fixture(async(product,address)=>{
    const {id}=await paidRefundFixture(product,address);
    try{await OnlinePayment.updateOne({_id:id},{$set:{keyId:"rzp_test_oldaccount",state:"ready"},$unset:{providerPaymentId:1}});const own=await online.get(`/payments/razorpay/orders/${id}`).set("Authorization",auth(buyer));expect(own.status).toBe(409);expect(own.body.code).toBe("PAYMENT_ACCOUNT_CHANGED");expect((await online.get(`/payments/razorpay/orders/${id}`).set("Authorization",auth(otherSeller))).status).toBe(403);}finally{await cleanRefundFixture(id);}
  }));
  it("distinguishes provider rejection from timeout without exposing provider response data",async()=>{
    const {provider}=await import("../src/payments/razorpay.js");
    try{vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{description:"SENSITIVE_PROVIDER_BODY"}}),{status:400})));await expect(provider(paymentConfig,"payments/pay_test/refund",{amount:100})).rejects.toMatchObject({status:502,code:"PAYMENT_PROVIDER_REJECTED"});
      try{await provider(paymentConfig,"payments/pay_test/refund",{amount:100});}catch(error){expect(String(error)).not.toContain("SENSITIVE_PROVIDER_BODY");}
      vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("SENSITIVE_PROVIDER_BODY",{status:429})));await expect(provider(paymentConfig,"orders/order_test")).rejects.toMatchObject({code:"PAYMENT_PROVIDER_UNAVAILABLE"});
    }finally{vi.unstubAllGlobals();}
  });
  it("flags provider-rejected refund for review without claiming success or issuing another obligation",async()=>fixture(async(product,address)=>{
    const {id,subId}=await paidRefundFixture(product,address);vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{description:"PRIVATE_GATEWAY_DETAILS"}}),{status:400})));
    try{await cancelBuyerSuborder(buyer,id,subId,{version:0,reason:"QA provider rejection"});const result=await refundApi.post(`/admin/refunds/${subId}/submit`).set("Authorization",auth(admin)).send({confirmRefund:true});expect(result.status).toBe(502);expect(result.body.code).toBe("PAYMENT_PROVIDER_REJECTED");expect(JSON.stringify(result.body)).not.toContain("PRIVATE_GATEWAY_DETAILS");const saved=await Refund.findById(subId);expect(saved!.state).toBe("uncertain");expect(saved!.providerRefundId).toBeUndefined();expect(saved!.recovery?.manualReview).toBe(true);expect(await Refund.countDocuments({orderId:id})).toBe(1);expect((await Product.findById(product))!.stock).toBe(5);expect(await PaymentAudit.exists({orderId:id,code:"PAYMENT_PROVIDER_REJECTED"})).toBeTruthy();}finally{vi.unstubAllGlobals();await cleanRefundFixture(id);}
  }));
  it("rejects signed malformed webhook JSON and reused event IDs with changed content",async()=>{
    const malformed="{",signature=createHmac("sha256",paymentConfig.RAZORPAY_WEBHOOK_SECRET).update(malformed).digest("hex");
    const invalid=await online.post("/webhooks/razorpay").set("Content-Type","application/json").set("X-Razorpay-Signature",signature).send(malformed);expect(invalid.status).toBe(400);expect(invalid.body.code).toBe("INVALID_WEBHOOK_BODY");
    const eventId=randomUUID(),payload=JSON.stringify({event:"payment.captured",payload:{}});await PaymentEvent.create({_id:eventId,digest:"a".repeat(64),processedAt:new Date()});
    try{const reply=await online.post("/webhooks/razorpay").set("Content-Type","application/json").set("x-razorpay-event-id",eventId).set("X-Razorpay-Signature",createHmac("sha256",paymentConfig.RAZORPAY_WEBHOOK_SECRET).update(payload).digest("hex")).send(payload);expect(reply.status).toBe(409);expect(reply.body.code).toBe("WEBHOOK_CONFLICT");}finally{await PaymentEvent.deleteOne({_id:eventId});}
  });
  it("keeps processed refunds terminal under reordered failed events without another refund POST",async()=>fixture(async(product,address)=>{
    const {id,subId,paymentId}=await paidRefundFixture(product,address);let state="pending",posts=0;const eventId=randomUUID();
    const remote=()=>({id:"rfnd_terminalmatrix",payment_id:paymentId,amount:2500,currency:"INR",receipt:subId,status:state});
    vi.stubGlobal("fetch",vi.fn(async(_url:string,init?:RequestInit)=>{if(init?.method==="POST")posts++;return new Response(JSON.stringify(remote()));}));
    try{await cancelBuyerSuborder(buyer,id,subId,{version:0,reason:"QA cancellation"});expect((await refundApi.post(`/admin/refunds/${subId}/submit`).set("Authorization",auth(admin)).send({confirmRefund:true})).body.state).toBe("pending");
      state="processed";expect((await refundApi.post(`/admin/refunds/${subId}/reconcile`).set("Authorization",auth(admin)).send({})).body.state).toBe("processed");state="failed";
      const event=JSON.stringify({event:"refund.failed",payload:{refund:{entity:remote()}}});const send=()=>refundApi.post("/webhooks/razorpay").set("Content-Type","application/json").set("x-razorpay-event-id",eventId).set("X-Razorpay-Signature",createHmac("sha256",paymentConfig.RAZORPAY_WEBHOOK_SECRET).update(event).digest("hex")).send(event);
      expect((await send()).status).toBe(200);expect((await send()).status).toBe(200);expect((await Refund.findById(subId))!.state).toBe("processed");expect(posts).toBe(1);expect((await Product.findById(product))!.stock).toBe(5);
    }finally{vi.unstubAllGlobals();await cleanRefundFixture(id);await PaymentEvent.deleteOne({_id:eventId});}
  }));
  it("verifies captured online payment, webhook retries and prepaid handoff without cash or duplicate inventory",async()=>fixture(async(product,address)=>{
    await OnlinePayment.init();await PaymentEvent.init();
    const remoteOrder="order_isolated",remotePayment="pay_isolated";let calls=0,paid=false,paymentAmount=2500;
    const provider=vi.fn(async(url: string,init?:RequestInit)=>{
      if(init?.method==="POST"){calls++;const input=JSON.parse(String(init.body));expect(input.amount).toBe(2500);expect(input.currency).toBe("INR");return new Response(JSON.stringify({id:remoteOrder,amount:2500,currency:"INR",receipt:input.receipt,status:"created"}));}
      const row=await OnlinePayment.findOne({providerOrderId:remoteOrder}).lean();
      if(url.endsWith(`/orders/${remoteOrder}`))return new Response(JSON.stringify({id:remoteOrder,amount:2500,currency:"INR",receipt:row!._id,status:paid ? "paid" : "attempted"}));
      const payment={id:remotePayment,order_id:remoteOrder,amount:paymentAmount,currency:"INR",status:paid ? "captured" : "authorized",captured:paid,amount_refunded:0};
      return new Response(JSON.stringify(url.endsWith("/payments") ? {items:[payment]} : payment));
    });vi.stubGlobal("fetch",provider);
    try{
      const input={...body(product,address),paymentMethod:"razorpay"},key=randomUUID();
      expect((await online.post("/payments/razorpay/orders").set("Authorization",auth(seller)).set("Idempotency-Key",key).send(input)).status).toBe(403);
      const created=await online.post("/payments/razorpay/orders").set("Authorization",auth(buyer)).set("Idempotency-Key",key).send(input);
      expect(created.status).toBe(200);expect(created.body.state).toBe("ready");expect(created.body.testMode).toBe(true);
      expect((await online.post("/payments/razorpay/orders").set("Authorization",auth(buyer)).set("Idempotency-Key",key).send(input)).body.orderId).toBe(created.body.orderId);expect(calls).toBe(1);
      expect((await Product.findById(product))!.stock).toBe(3);
      const id=created.body.orderId,stored=await Order.findById(id).lean(),subId=stored!.subOrders[0]._id;
      expect(await Notification.countDocuments({_id:readNotificationKey(`${id}:seller:${shopId}`)})).toBe(0);
      await expect(transitionSellerSuborder(seller,id,subId,{version:0,status:"accepted"})).rejects.toMatchObject({code:"PAYMENT_PENDING"});
      const hidden=await online.get("/seller/orders").set("Authorization",auth(seller));expect(hidden.body.some((row:{orderId:string})=>row.orderId===id)).toBe(false);
      expect((await online.post(`/payments/razorpay/orders/${id}/verify`).set("Authorization",auth(buyer)).send({razorpay_order_id:remoteOrder,razorpay_payment_id:remotePayment,razorpay_signature:"0".repeat(64)})).status).toBe(400);
      const signature=createHmac("sha256",paymentConfig.RAZORPAY_KEY_SECRET).update(`${remoteOrder}|${remotePayment}`).digest("hex");
      const callback={razorpay_order_id:remoteOrder,razorpay_payment_id:remotePayment,razorpay_signature:signature};
      expect((await online.post(`/payments/razorpay/orders/${id}/verify`).set("Authorization",auth(buyer)).send(callback)).body.paymentStatus).toBe("unpaid");
      paid=true;
      paymentAmount=1;
      expect((await online.post(`/payments/razorpay/orders/${id}/verify`).set("Authorization",auth(buyer)).send(callback)).status).toBe(409);
      expect((await Order.findById(id))!.paymentStatus).toBe("unpaid");paymentAmount=2500;
      const event=JSON.stringify({event:"payment.captured",payload:{payment:{entity:{id:remotePayment,order_id:remoteOrder}}}}),webhookSignature=createHmac("sha256",paymentConfig.RAZORPAY_WEBHOOK_SECRET).update(event).digest("hex");
      expect((await online.post("/webhooks/razorpay").set("Content-Type","application/json").set("X-Razorpay-Signature","0".repeat(64)).send(event)).status).toBe(400);
      for(let n=0;n<2;n++)expect((await online.post("/webhooks/razorpay").set("Content-Type","application/json").set("X-Razorpay-Signature",webhookSignature).set("x-razorpay-event-id","isolated-event").send(event)).status).toBe(200);
      const verified=await online.post(`/payments/razorpay/orders/${id}/verify`).set("Authorization",auth(buyer)).send(callback);
      expect(verified.body.paymentStatus).toBe("paid");expect(verified.body.testMode).toBe(true);expect(verified.body.amountDue).toBe(0);expect(verified.body.cashRecordedAmount).toBe(0);expect(await PaymentEvent.countDocuments({_id:"isolated-event"})).toBe(1);
      expect(await Notification.countDocuments({_id:readNotificationKey(`${id}:seller:${shopId}`),recipientId:seller.id})).toBe(1);
      await expect(transitionSellerSuborder(otherSeller,id,subId,{version:0,status:"cancelled",reason:"Cannot supply"})).rejects.toMatchObject({code:"NOT_FOUND"});
      await ready(id,subId);
      const proof=await issueReceiptCode(buyer,id,subId,{version:3,confirmReceived:true},paymentConfig);
      await expect(completeCashHandoff(seller,id,subId,{version:3,code:proof.code,confirmCashReceived:true,amountReceived:25},paymentConfig)).rejects.toMatchObject({code:"INVALID_HANDOFF_METHOD"});
      const completed=await completeCashHandoff(seller,id,subId,{version:3,code:proof.code,confirmHandoff:true},paymentConfig,true);
      expect(completed.status).toBe("delivered");expect(completed.cashCollection).toBeUndefined();expect(completed.paymentStatus).toBe("paid");
      expect((await Product.findById(product))!.stock).toBe(3);
      expect(await Order.countDocuments({_id:id})).toBe(1);
    }finally{vi.unstubAllGlobals();await OnlinePayment.deleteMany({buyerId:buyer.id});await PaymentEvent.deleteMany({_id:"isolated-event"});}
  }));
  it("keeps uncertain provider creation recoverable without issuing a second payable provider order",async()=>fixture(async(product,address)=>{
    const provider=vi.fn().mockRejectedValue(new Error("simulated timeout"));vi.stubGlobal("fetch",provider);
    try{
      const input={...body(product,address),paymentMethod:"razorpay"},key=randomUUID();
      const created=await online.post("/payments/razorpay/orders").set("Authorization",auth(buyer)).set("Idempotency-Key",key).send(input);
      expect(created.body.state).toBe("uncertain");
      const retry=await online.post("/payments/razorpay/orders").set("Authorization",auth(buyer)).set("Idempotency-Key",key).send(input);
      expect(retry.body.orderId).toBe(created.body.orderId);expect(provider).toHaveBeenCalledTimes(1);expect((await Product.findById(product))!.stock).toBe(3);
      expect((await online.post(`/payments/razorpay/orders/${created.body.orderId}/reconcile`).set("Authorization",auth(buyer)).send({})).status).toBe(409);
      expect((await online.post("/payments/razorpay/orders").set("Authorization",auth(buyer)).set("Idempotency-Key",randomUUID()).send(input)).status).toBe(409);
      expect((await Product.findById(product))!.stock).toBe(3);
    }finally{vi.unstubAllGlobals();await OnlinePayment.deleteMany({buyerId:buyer.id});}
  }));
  it("restricts admin cash monitoring, filters records and binds pagination without leaking customer or proof data",async()=>fixture(async(product,address)=>{
    const first=await enabled.post("/orders").set("Authorization",auth(buyer)).set("Idempotency-Key",randomUUID()).send(body(product,address));
    expect(first.status).toBe(201);
    const second=await enabled.post("/orders").set("Authorization",auth(buyer)).set("Idempotency-Key",randomUUID()).send(body(product,address));
    expect(second.status).toBe(201);
    expect((await api.get("/admin/orders")).status).toBe(401);
    for(const who of [buyer,seller,delivery])expect((await api.get("/admin/orders").set("Authorization",auth(who))).status).toBe(403);
    const page=await api.get(`/admin/orders?limit=1&cash=outstanding&shopId=${shopId}`).set("Authorization",auth(admin));
    expect(page.status).toBe(200);expect(page.body).toHaveLength(1);expect(page.headers["cache-control"]).toBe("private, no-store");
    expect(page.headers["x-has-more"]).toBe("true");
    const exact=await api.get(`/admin/orders?orderId=${first.body.id.toUpperCase()}`).set("Authorization",auth(admin));expect(exact.status).toBe(200);expect(exact.body.map((order:{id:string})=>order.id)).toEqual([first.body.id]);expect(exact.headers["x-has-more"]).toBe("false");expect(exact.body[0]).not.toHaveProperty("address");
    expect((await api.get(`/admin/orders?orderId=${randomUUID()}`).set("Authorization",auth(admin))).body).toEqual([]);
    expect((await api.get("/admin/orders?orderId=invalid").set("Authorization",auth(admin))).status).toBe(400);
    expect((await api.get(`/admin/orders?orderId=${first.body.id}&cash=recorded`).set("Authorization",auth(admin))).body).toEqual([]);
    expect((await api.get(`/admin/orders?orderId=${first.body.id}&cursor=${encodeURIComponent(page.headers["x-next-cursor"])}`).set("Authorization",auth(admin))).status).toBe(400);
    const row=page.body[0];expect(row.amountDue).toBe(25);expect(row.cashRecordedAmount).toBe(0);
    for(const key of ["buyerId","address","addressId","fingerprint","reservationId"])expect(row).not.toHaveProperty(key);
    for(const key of ["receipt","history","reportedBy"])expect(row.subOrders[0]).not.toHaveProperty(key);
    const next=await api.get(`/admin/orders?limit=1&cash=outstanding&shopId=${shopId}&cursor=${encodeURIComponent(page.headers["x-next-cursor"])}`).set("Authorization",auth(admin));
    expect(next.status).toBe(200);expect(next.body[0].id).not.toBe(row.id);
    expect((await api.get(`/admin/orders?cash=recorded&cursor=${encodeURIComponent(page.headers["x-next-cursor"])}`).set("Authorization",auth(admin))).status).toBe(400);
    expect((await api.get("/admin/orders?cash=paid").set("Authorization",auth(admin))).status).toBe(400);
    const recorded=await api.get(`/admin/orders?cash=recorded&shopId=${shopId}`).set("Authorization",auth(admin));
    expect(recorded.body.some((item:{id:string})=>item.id===first.body.id)).toBe(false);
    const subId=first.body.subOrders[0].id;
    await ready(first.body.id,subId);
    const proof=await issueReceiptCode(buyer,first.body.id,subId,acknowledgement(),config);
    await completeCashHandoff(seller,first.body.id,subId,{version:3,code:proof.code,confirmCashReceived:true,amountReceived:25},config);
    const collected=await api.get(`/admin/orders?cash=recorded&shopId=${shopId}`).set("Authorization",auth(admin));
    const cashRow=collected.body.find((item:{id:string})=>item.id===first.body.id);
    expect(cashRow.cashRecordedAmount).toBe(25);expect(cashRow.amountDue).toBe(0);
    expect(cashRow.subOrders[0].cashCollection).not.toHaveProperty("reportedBy");
    expect(JSON.stringify(cashRow)).not.toContain(proof.code);
    expect(cashRow.subOrders[0]).not.toHaveProperty("receipt");
  }));
  async function ready(orderId:string,subId:string){await transitionSellerSuborder(seller,orderId,subId,{version:0,status:"accepted"});await transitionSellerSuborder(seller,orderId,subId,{version:1,status:"preparing"});await transitionSellerSuborder(seller,orderId,subId,{version:2,status:"ready"});}
  it("binds receipt issuance to the owned eligible suborder and hides secrets from ordinary DTOs",async()=>fixture(async(product,address)=>{
    const created=await createCodOrder(buyer,randomUUID(),body(product,address)),id=created.order._id,sub=created.order.subOrders[0],path=`/orders/${id}/suborders/${sub._id}/receipt-code`;
    expect((await enabled.post(path).send(acknowledgement())).status).toBe(401);expect((await enabled.post(path).set("Authorization",auth(seller)).send(acknowledgement())).status).toBe(403);
    expect((await enabled.post(path).set("Authorization",auth(buyer)).send(acknowledgement(0))).status).toBe(409);
    await ready(id,sub._id);
    expect((await enabled.post(path).set("Authorization",auth(buyer)).send({...acknowledgement(),confirmCashPaid:false})).status).toBe(400);
    expect((await enabled.post(path).set("Authorization",auth(buyer)).send({...acknowledgement(),code:"123456"})).status).toBe(400);
    await User.updateOne({_id:delivery.id},{$set:{role:"buyer"}});
    try {expect((await enabled.post(path).set("Authorization",auth(delivery)).send(acknowledgement())).status).toBe(404);}finally{await User.updateOne({_id:delivery.id},{$set:{role:"delivery"}});}
    const issued=await enabled.post(path).set("Authorization",auth(buyer)).send(acknowledgement());expect(issued.status).toBe(200);expect(issued.headers["cache-control"]).toContain("no-store");expect(issued.body.code).toMatch(/^[0-9]{6}$/);expect(issued.body.amount).toBe(25);
    const saved=(await Order.findById(id))!.subOrders[0].receipt!;expect(saved.hash).not.toBe(issued.body.code);expect(saved.hash).toHaveLength(64);
    const buyerView=await enabled.get(`/orders/${id}`).set("Authorization",auth(buyer)),sellerView=await enabled.get("/seller/orders").set("Authorization",auth(seller));expect(buyerView.body.subOrders[0]).not.toHaveProperty("receipt");expect(sellerView.body[0]).not.toHaveProperty("receipt");expect(JSON.stringify(buyerView.body)).not.toContain(saved.hash);
  }));
  it("records one cash handoff atomically under duplicate retries without changing stock or original totals",async()=>fixture(async(product,address)=>{
    const key=randomUUID(),input=body(product,address),created=await createCodOrder(buyer,key,input),id=created.order._id,sub=created.order.subOrders[0];await ready(id,sub._id);
    const proof=await issueReceiptCode(buyer,id,sub._id,acknowledgement(),config),command={version:3,code:proof.code,confirmCashReceived:true as const,amountReceived:25};
    await expect(completeCashHandoff(otherSeller,id,sub._id,command,config)).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(completeCashHandoff(seller,id,sub._id,{...command,amountReceived:1},config)).rejects.toMatchObject({code:"CASH_AMOUNT_MISMATCH"});
    await Shop.updateOne({_id:shopId},{$set:{status:"suspended",active:false}});
    const [a,b]=await Promise.all([completeCashHandoff(seller,id,sub._id,command,config),completeCashHandoff(seller,id,sub._id,command,config)]);expect(a).toMatchObject({status:"delivered",version:4,paymentStatus:"cash_recorded",amountDue:0,cashCollection:{amount:25,method:"cash"}});expect(b.version).toBe(4);expect((await Product.findById(product))!.stock).toBe(3);
    const saved=await Order.findById(id);expect(saved!.subOrders[0].history).toHaveLength(4);expect(saved!.subOrders[0].receipt!.consumedAt).toBeInstanceOf(Date);expect(saved!.subOrders[0].cashCollection!.amountCents).toBe(2500);
    const view=await enabled.get(`/orders/${id}`).set("Authorization",auth(buyer));expect(view.body).toMatchObject({paymentStatus:"cash_recorded",total:25,amountDue:0,cancelledAmount:0,cashRecordedAmount:25});expect(view.body.subOrders[0].cashCollection).not.toHaveProperty("reportedBy");
    await expect(transitionSellerSuborder(seller,id,sub._id,{version:4,status:"cancelled",reason:"Too late now"})).rejects.toMatchObject({code:"INVALID_TRANSITION"});
    expect((await createCodOrder(buyer,key,input)).order.totalCents).toBe(2500);
    await expect(completeCashHandoff(seller,id,sub._id,{...command,code:"000000"},config)).rejects.toMatchObject({code:"HANDOFF_ALREADY_RECORDED"});
  }));
  it("expires and rotates codes without accepting a previous code or inventing payment",async()=>fixture(async(product,address)=>{
    const created=await createCodOrder(buyer,randomUUID(),body(product,address)),id=created.order._id,sub=created.order.subOrders[0];await ready(id,sub._id);
    const first=await issueReceiptCode(buyer,id,sub._id,acknowledgement(),config);await expect(issueReceiptCode(buyer,id,sub._id,acknowledgement(),config)).rejects.toMatchObject({code:"RECEIPT_COOLDOWN"});
    await Order.updateOne({_id:id},{$set:{"subOrders.0.receipt.issuedAt":new Date(Date.now()-61_000)}});
    const replacement=await issueReceiptCode(buyer,id,sub._id,acknowledgement(),config);expect(replacement.code).not.toBe(first.code);
    await expect(completeCashHandoff(seller,id,sub._id,{version:3,code:first.code,confirmCashReceived:true,amountReceived:25},config)).rejects.toMatchObject({code:"INVALID_RECEIPT_CODE"});
    await Order.updateOne({_id:id},{$set:{"subOrders.0.receipt.expiresAt":new Date(0)}});
    await expect(completeCashHandoff(seller,id,sub._id,{version:3,code:replacement.code,confirmCashReceived:true,amountReceived:25},config)).rejects.toMatchObject({code:"RECEIPT_EXPIRED"});expect((await Order.findById(id))!.paymentStatus).toBe("unpaid");expect((await Product.findById(product))!.stock).toBe(3);
  }));
  it("persists wrong-code attempts and lockout across rejected transactions and code reissue",async()=>fixture(async(product,address)=>{
    const created=await createCodOrder(buyer,randomUUID(),body(product,address)),id=created.order._id,sub=created.order.subOrders[0];await ready(id,sub._id);const proof=await issueReceiptCode(buyer,id,sub._id,acknowledgement(),config);
    for(let attempt=1;attempt<=5;attempt++){
      await expect(completeCashHandoff(seller,id,sub._id,{version:3,code:"000000",confirmCashReceived:true,amountReceived:25},config)).rejects.toMatchObject({code:attempt===5 ? "RECEIPT_LOCKED" : "INVALID_RECEIPT_CODE"});expect((await Order.findById(id))!.subOrders[0].receipt!.attempts).toBe(attempt);
    }
    await expect(completeCashHandoff(seller,id,sub._id,{version:3,code:proof.code,confirmCashReceived:true,amountReceived:25},config)).rejects.toMatchObject({code:"RECEIPT_LOCKED"});await expect(issueReceiptCode(buyer,id,sub._id,acknowledgement(),config)).rejects.toMatchObject({code:"RECEIPT_LOCKED"});
    await Order.updateOne({_id:id},{$set:{"subOrders.0.receipt.lockedUntil":new Date(0),"subOrders.0.receipt.issuedAt":new Date(Date.now()-61_000),"subOrders.0.receipt.expiresAt":new Date(0)}});
    const fresh=await issueReceiptCode(buyer,id,sub._id,acknowledgement(),config);await completeCashHandoff(seller,id,sub._id,{version:3,code:fresh.code,confirmCashReceived:true,amountReceived:25},config);expect((await Order.findById(id))!.subOrders[0].cashCollection).toBeDefined();
  }));
  it("requires dispatch for seller delivery and rejects direct cash/status bypasses",async()=>fixture(async(product,address)=>{
    const input={...body(product,address),expectedTotal:40,fulfilments:[{shopId,method:"seller_delivery" as const}]},created=await createCodOrder(buyer,randomUUID(),input),id=created.order._id,sub=created.order.subOrders[0];await ready(id,sub._id);
    await expect(issueReceiptCode(buyer,id,sub._id,acknowledgement(),config)).rejects.toMatchObject({code:"RECEIPT_UNAVAILABLE"});await transitionSellerSuborder(seller,id,sub._id,{version:3,status:"out_for_delivery"});
    const proof=await issueReceiptCode(buyer,id,sub._id,acknowledgement(4),config),path=`/seller/orders/${id}/suborders/${sub._id}/complete-cash`;
    expect((await enabled.post(path).set("Authorization",auth(buyer)).send({version:4,code:proof.code,confirmCashReceived:true,amountReceived:40})).status).toBe(403);
    expect((await enabled.post(path).set("Authorization",auth(seller)).send({version:4,code:proof.code,confirmCashReceived:false,amountReceived:40})).status).toBe(400);
    const result=await enabled.post(path).set("Authorization",auth(seller)).send({version:4,code:proof.code,confirmCashReceived:true,amountReceived:40});expect(result.status).toBe(200);expect(result.body).toMatchObject({status:"delivered",paymentStatus:"cash_recorded",amountDue:0});expect(result.body).not.toHaveProperty("receipt");
  }));
  it("keeps partial cash, cancellation and seller privacy separate across shops",async()=>fixture(async(product,address)=>{
    const original=await Shop.findById(otherShopId);
    await Shop.updateOne({_id:otherShopId},{$set:{status:"approved",active:true,temporarilyClosed:false,openingHours:Array.from({length:7},(_,day)=>({day,opens:"00:00",closes:"23:59"})),areaIds:[areaId],fulfilment:["pickup"],minimumOrderCents:0}});
    const second=await Product.create({_id:randomUUID(),shopId:otherShopId,categoryId,name:"Isolated cash counter",sortName:"isolated cash counter",unit:"pack",description:"",priceCents:2000,stock:2,sortPriceCents:2000,totalStock:2,variants:[],active:true});
    try{
      const input=body(product,address),created=await createCodOrder(buyer,randomUUID(),{...input,expectedTotal:45,items:[...input.items,{productId:second._id,qty:1}],fulfilments:[...input.fulfilments,{shopId:otherShopId,method:"pickup"}]});
      const first=created.order.subOrders.find(sub=>sub.shopId===shopId)!,other=created.order.subOrders.find(sub=>sub.shopId===otherShopId)!;
      await ready(created.order._id,first._id);const proof=await issueReceiptCode(buyer,created.order._id,first._id,acknowledgement(),config);await completeCashHandoff(seller,created.order._id,first._id,{version:3,code:proof.code,confirmCashReceived:true,amountReceived:25},config);
      let view=await enabled.get(`/orders/${created.order._id}`).set("Authorization",auth(buyer));expect(view.body).toMatchObject({total:45,amountDue:20,cashRecordedAmount:25,cancelledAmount:0,paymentStatus:"partially_cash_recorded"});
      const privateView=await enabled.get("/seller/orders").set("Authorization",auth(otherSeller));expect(privateView.body[0].paymentStatus).toBe("unpaid");expect(privateView.body[0]).not.toHaveProperty("cashCollection");
      await transitionSellerSuborder(otherSeller,created.order._id,other._id,{version:0,status:"cancelled",reason:"No supply today"});
      view=await enabled.get(`/orders/${created.order._id}`).set("Authorization",auth(buyer));expect(view.body).toMatchObject({total:45,amountDue:0,cashRecordedAmount:25,cancelledAmount:20,paymentStatus:"cash_recorded"});expect((await Product.findById(product))!.stock).toBe(3);expect((await Product.findById(second._id))!.stock).toBe(2);
    }finally{await Product.deleteOne({_id:second._id});await Shop.updateOne({_id:otherShopId},{$set:{status:original!.status,active:original!.active,temporarilyClosed:original!.temporarilyClosed,openingHours:original!.openingHours,areaIds:original!.areaIds,fulfilment:original!.fulfilment},$unset:{minimumOrderCents:1}});if(original!.minimumOrderCents!==undefined)await Shop.updateOne({_id:otherShopId},{$set:{minimumOrderCents:original!.minimumOrderCents}});}
  }));
  it("allows only owned seller-delivery dispatch, without completing delivery or reporting cash",async()=>fixture(async(product,address)=>{
    const input=body(product,address);
    const pickup=await createCodOrder(buyer,randomUUID(),{...input,items:[{productId:product,qty:1}],expectedTotal:12.5});
    const deliveryOrder=await createCodOrder(buyer,randomUUID(),{...input,expectedTotal:40,fulfilments:[{shopId,method:"seller_delivery"}]});
    for(const order of [pickup.order,deliveryOrder.order]){
      const sub=order.subOrders[0];await transitionSellerSuborder(seller,order._id,sub._id,{version:0,status:"accepted"});await transitionSellerSuborder(seller,order._id,sub._id,{version:1,status:"preparing"});await transitionSellerSuborder(seller,order._id,sub._id,{version:2,status:"ready"});
    }
    await expect(transitionSellerSuborder(seller,pickup.order._id,pickup.order.subOrders[0]._id,{version:3,status:"out_for_delivery"})).rejects.toMatchObject({code:"INVALID_TRANSITION"});
    const sub=deliveryOrder.order.subOrders[0],path=`/seller/orders/${deliveryOrder.order._id}/suborders/${sub._id}`;
    expect((await enabled.patch(path).set("Authorization",auth(otherSeller)).send({version:3,status:"out_for_delivery"})).status).toBe(404);
    const dispatched=await enabled.patch(path).set("Authorization",auth(seller)).send({version:3,status:"out_for_delivery"});expect(dispatched.status).toBe(200);expect(dispatched.body).toMatchObject({status:"out_for_delivery",version:4,paymentStatus:"unpaid",amountDue:40});
    const replay=await enabled.patch(path).set("Authorization",auth(seller)).send({version:3,status:"out_for_delivery"});expect(replay.body.version).toBe(4);
    expect((await enabled.patch(path).set("Authorization",auth(seller)).send({version:4,status:"delivered",paymentStatus:"paid"})).status).toBe(400);
    const buyerView=await enabled.get(`/orders/${deliveryOrder.order._id}`).set("Authorization",auth(buyer));expect(buyerView.body).toMatchObject({paymentStatus:"unpaid",amountDue:40});expect(buyerView.body.subOrders[0].status).toBe("out_for_delivery");expect((await Product.findById(product))!.stock).toBe(2);
  }));
  it("authorizes seller ownership and enforces versioned accept/prepare/ready transitions",async()=>fixture(async(product,address)=>{
    const created=await createCodOrder(buyer,randomUUID(),body(product,address)),sub=created.order.subOrders[0];
    const path=`/seller/orders/${created.order._id}/suborders/${sub._id}`;
    expect((await enabled.get("/seller/orders")).status).toBe(401);expect((await enabled.get("/seller/orders").set("Authorization",auth(buyer))).status).toBe(403);
    expect((await enabled.patch(path).set("Authorization",auth(otherSeller)).send({version:0,status:"accepted"})).status).toBe(404);
    expect((await enabled.patch(path).set("Authorization",auth(buyer)).send({version:0,status:"accepted"})).status).toBe(403);
    expect((await enabled.patch(path).set("Authorization",auth(seller)).send({version:0,status:"ready"})).status).toBe(409);
    expect((await enabled.patch(path).set("Authorization",auth(seller)).send({version:0,status:"cancelled"})).status).toBe(400);
    const accepted=await enabled.patch(path).set("Authorization",auth(seller)).send({version:0,status:"accepted"});expect(accepted.status).toBe(200);expect(accepted.body).toMatchObject({status:"accepted",version:1});expect(accepted.body.lines[0]).toMatchObject({productId:product,price:12.5});expect(accepted.body.lines[0]).not.toHaveProperty("_doc");
    const replay=await enabled.patch(path).set("Authorization",auth(seller)).send({version:0,status:"accepted"});expect(replay.body.version).toBe(1);
    expect((await enabled.patch(path).set("Authorization",auth(seller)).send({version:0,status:"preparing"})).status).toBe(409);
    await transitionSellerSuborder(seller,created.order._id,sub._id,{version:1,status:"preparing"});
    await expect(transitionSellerSuborder(seller,created.order._id,sub._id,{version:2,status:"cancelled",reason:"Already prepared"})).rejects.toMatchObject({code:"INVALID_TRANSITION"});
    await transitionSellerSuborder(seller,created.order._id,sub._id,{version:2,status:"ready"});expect((await Product.findById(product))!.stock).toBe(3);
    expect((await Order.findById(created.order._id))!.subOrders[0].history).toHaveLength(3);
    const buyerView=await enabled.get(`/orders/${created.order._id}`).set("Authorization",auth(buyer));expect(buyerView.body.subOrders[0]).toMatchObject({status:"ready",version:3});expect(buyerView.body.subOrders[0]).not.toHaveProperty("history");
  }));
  it("restocks cancellation exactly once under concurrent retries without changing original totals",async()=>fixture(async(product,address)=>{
    const key=randomUUID(),input=body(product,address),created=await createCodOrder(buyer,key,input),sub=created.order.subOrders[0],command={version:0,status:"cancelled" as const,reason:"Item unavailable"};
    const [a,b]=await Promise.all([transitionSellerSuborder(seller,created.order._id,sub._id,command),transitionSellerSuborder(seller,created.order._id,sub._id,command)]);
    expect(a.version).toBe(1);expect(b.version).toBe(1);expect(a.amountDue).toBe(0);expect((await Product.findById(product))!.stock).toBe(5);
    const saved=await Order.findById(created.order._id);expect(saved!.subOrders[0].history).toHaveLength(1);expect(saved!.subOrders[0].restockedAt).toBeInstanceOf(Date);
    const replay=await createCodOrder(buyer,key,input);expect(replay.order.totalCents).toBe(2500);expect(replay.order.subOrders[0].status).toBe("cancelled");
    const view=await enabled.get(`/orders/${created.order._id}`).set("Authorization",auth(buyer));expect(view.body).toMatchObject({total:25,amountDue:0,cancelledAmount:25,paymentStatus:"unpaid"});
    await expect(transitionSellerSuborder(seller,created.order._id,sub._id,{...command,reason:"Different reason"})).rejects.toMatchObject({code:"VERSION_CONFLICT"});
  }));
  it("serializes conflicting accept/cancel commands and allows rejection after suspension",async()=>fixture(async(product,address)=>{
    const created=await createCodOrder(buyer,randomUUID(),body(product,address)),sub=created.order.subOrders[0];
    const race=await Promise.allSettled([transitionSellerSuborder(seller,created.order._id,sub._id,{version:0,status:"accepted"}),transitionSellerSuborder(seller,created.order._id,sub._id,{version:0,status:"cancelled",reason:"Cannot fulfil"})]);
    expect(race.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    const current=(await Order.findById(created.order._id))!.subOrders[0];expect((await Product.findById(product))!.stock).toBe(current.status==="cancelled" ? 5 : 3);
    const pending=current.status==="accepted" ? {orderId:created.order._id,sub:current} : await createCodOrder(buyer,randomUUID(),body(product,address)).then(result=>({orderId:result.order._id,sub:result.order.subOrders[0]}));
    await Shop.updateOne({_id:shopId},{$set:{status:"suspended",active:false}});
    await expect(transitionSellerSuborder(seller,pending.orderId,pending.sub._id,{version:pending.sub.version ?? 0,status:pending.sub.status==="accepted" ? "preparing" : "accepted"})).rejects.toMatchObject({code:"SHOP_UNAVAILABLE"});
    await transitionSellerSuborder(seller,pending.orderId,pending.sub._id,{version:pending.sub.version ?? 0,status:"cancelled",reason:"Shop suspended"});
    expect((await Product.findById(product))!.stock).toBe(5);
  }));
  it("rolls back cancellation when committed proof is corrupt, then restores inactive listings safely",async()=>fixture(async(product,address)=>{
    const created=await createCodOrder(buyer,randomUUID(),body(product,address)),sub=created.order.subOrders[0];
    await InventoryReservation.updateOne({_id:created.order.reservationId},{$set:{"lines.0.qty":3}});
    await expect(transitionSellerSuborder(seller,created.order._id,sub._id,{version:0,status:"cancelled",reason:"No availability"})).rejects.toMatchObject({code:"INVENTORY_INVARIANT"});
    expect((await Order.findById(created.order._id))!.subOrders[0].status).toBe("placed");expect((await Product.findById(product))!.stock).toBe(3);
    await InventoryReservation.updateOne({_id:created.order.reservationId},{$set:{"lines.0.qty":2}});await Product.updateOne({_id:product},{$set:{active:false}});
    await transitionSellerSuborder(seller,created.order._id,sub._id,{version:0,status:"cancelled",reason:"Listing withdrawn"});const restored=await Product.findById(product);expect(restored!.stock).toBe(5);expect(restored!.active).toBe(false);
  }));
  it("scopes seller list cursors/filters and only exposes the owned delivery address",async()=>fixture(async(product,address)=>{
    const input=body(product,address);await createCodOrder(buyer,randomUUID(),{...input,expectedTotal:40,fulfilments:[{shopId,method:"seller_delivery"}]});await createCodOrder(buyer,randomUUID(),input);
    const first=await enabled.get("/seller/orders?limit=1").set("Authorization",auth(seller));expect(first.status).toBe(200);expect(first.headers["cache-control"]).toContain("no-store");expect(first.headers["x-has-more"]).toBe("true");expect(first.body[0]).not.toHaveProperty("deliveryAddress");
    const cursor=encodeURIComponent(first.headers["x-next-cursor"]);
    const second=await enabled.get(`/seller/orders?limit=1&cursor=${cursor}`).set("Authorization",auth(seller));expect(second.body[0].deliveryAddress.line1).toBe("Isolated test lane");expect(second.body[0]).not.toHaveProperty("buyerId");expect(second.body[0]).not.toHaveProperty("reservationId");
    expect((await enabled.get(`/seller/orders?status=accepted&cursor=${cursor}`).set("Authorization",auth(seller))).status).toBe(400);
    expect((await enabled.get(`/seller/orders?cursor=${cursor}`).set("Authorization",auth(otherSeller))).status).toBe(400);
    expect((await enabled.get("/seller/orders").set("Authorization",auth(otherSeller))).body).toEqual([]);
    expect((await enabled.patch(`/seller/orders/${randomUUID()}/suborders/${first.body[0].id}`).set("Authorization",auth(seller)).send({version:0,status:"accepted"})).status).toBe(404);
  }));
  it("is off by default and restricts writes to authenticated buyers",async()=>fixture(async(product,address)=>{
    expect((await api.post("/orders").set("Authorization",auth(buyer)).set("Idempotency-Key",randomUUID()).send(body(product,address))).status).toBe(503);
    expect((await enabled.post("/orders").send(body(product,address))).status).toBe(401);
    expect((await enabled.post("/orders").set("Authorization",auth(seller)).send(body(product,address))).status).toBe(403);
    expect((await enabled.post("/orders").set("Authorization",auth(buyer)).send(body(product,address))).status).toBe(400);
    expect((await Product.findById(product))!.stock).toBe(5);
  }));
  it("creates an unpaid server-priced order once and committed stock never expires",async()=>fixture(async(product,address)=>{
    const key=randomUUID(),input=body(product,address);
    const placed=await enabled.post("/orders").set("Authorization",auth(buyer)).set("Idempotency-Key",key).send(input);
    expect(placed.status).toBe(201);expect(placed.body).toMatchObject({paymentMethod:"cod",paymentStatus:"unpaid",total:25,address:{line1:"Isolated test lane"}});expect(placed.body.subOrders[0]).toMatchObject({shopId,status:"placed",deliveryFee:0});expect(placed.body).not.toHaveProperty("fingerprint");expect(placed.body).not.toHaveProperty("buyerId");
    const replay=await enabled.post("/orders").set("Authorization",auth(buyer)).set("Idempotency-Key",key).send(input);expect(replay.status).toBe(200);expect(replay.body.id).toBe(placed.body.id);expect((await Product.findById(product))!.stock).toBe(3);
    expect(await Notification.countDocuments({_id:readNotificationKey(`${placed.body.id}:placed`),recipientId:buyer.id})).toBe(1);
    expect(await Notification.countDocuments({_id:readNotificationKey(`${placed.body.id}:seller:${shopId}`),recipientId:seller.id})).toBe(1);
    const hold=await InventoryReservation.findOne({"lines.productId":product});expect(hold!.state).toBe("committed");await InventoryReservation.updateOne({_id:hold!._id},{$set:{expiresAt:new Date(0)}});
    await releaseExpiredInventory();await releaseInventory(buyer,hold!._id);expect((await Product.findById(product))!.stock).toBe(3);
    await api.delete(`/addresses/${address}`).set("Authorization",auth(buyer)).send({version:0});
    const fetched=await enabled.get(`/orders/${placed.body.id}`).set("Authorization",auth(buyer));expect(fetched.body.address.line1).toBe("Isolated test lane");expect(fetched.body.subOrders[0].lines[0].name).toBe("Order snapshot listing");
    await expect(createCodOrder(buyer,key,{...input,expectedTotal:12.5})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
    await verifyOrderIndexes();
  }));
  it("rolls back stock and ledger when accepted total, minimum or method validation fails",async()=>fixture(async(product,address)=>{
    const input=body(product,address);
    await expect(createCodOrder(buyer,randomUUID(),{...input,expectedTotal:1})).rejects.toMatchObject({code:"PRICE_CHANGED"});
    await expect(createCodOrder(buyer,randomUUID(),{...input,fulfilments:[{shopId,method:"platform_delivery"}]})).rejects.toMatchObject({code:"METHOD_UNAVAILABLE"});
    await Shop.updateOne({_id:shopId},{$set:{minimumOrderCents:10000}});
    await expect(createCodOrder(buyer,randomUUID(),input)).rejects.toMatchObject({code:"MINIMUM_NOT_MET"});
    expect((await Product.findById(product))!.stock).toBe(5);expect(await InventoryReservation.countDocuments({"lines.productId":product})).toBe(0);expect(await Order.countDocuments({"subOrders.lines.productId":product})).toBe(0);
  }));
  it("validates address ownership/version and seller-delivery charges and coverage",async()=>fixture(async(product,address)=>{
    const input=body(product,address);
    await expect(createCodOrder({...buyer,id:seller.id},randomUUID(),input)).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(createCodOrder(buyer,randomUUID(),{...input,addressVersion:1})).rejects.toMatchObject({code:"ADDRESS_CHANGED"});
    const delivered=await createCodOrder(buyer,randomUUID(),{...input,expectedTotal:40,fulfilments:[{shopId,method:"seller_delivery"}]});expect(delivered.order.totalCents).toBe(4000);expect(delivered.order.subOrders[0].deliveryFeeCents).toBe(1500);
    await Shop.updateOne({_id:shopId},{$unset:{deliveryFeeCents:1}});await expect(createCodOrder(buyer,randomUUID(),{...input,fulfilments:[{shopId,method:"seller_delivery"}]})).rejects.toMatchObject({code:"DELIVERY_FEE_UNKNOWN"});
    await Area.updateOne({_id:areaId},{$set:{pincodes:["111111"]}});await expect(createCodOrder(buyer,randomUUID(),{...input,fulfilments:[{shopId,method:"seller_delivery"}]})).rejects.toMatchObject({code:"ADDRESS_UNSERVICEABLE"});expect((await Product.findById(product))!.stock).toBe(3);
  }));
  it("serializes duplicate order attempts and last-unit competition",async()=>fixture(async(product,address)=>{
    const input=body(product,address),key=randomUUID();
    const [a,b]=await Promise.all([createCodOrder(buyer,key,input),createCodOrder(buyer,key,input)]);expect(a.order._id).toBe(b.order._id);expect((await Product.findById(product))!.stock).toBe(3);
    const attempts=await Promise.allSettled([createCodOrder(buyer,randomUUID(),input),createCodOrder(buyer,randomUUID(),input)]);expect(attempts.filter(result=>result.status==="fulfilled")).toHaveLength(1);expect((await Product.findById(product))!.stock).toBe(1);
  }));
  it("paginates only owned orders with signed buyer-scoped cursors",async()=>fixture(async(product,address)=>{
    const input={...body(product,address),items:[{productId:product,qty:1}],expectedTotal:12.5};
    await createCodOrder(buyer,randomUUID(),input);await createCodOrder(buyer,randomUUID(),input);
    const first=await enabled.get("/orders?limit=1").set("Authorization",auth(buyer));expect(first.status).toBe(200);expect(first.headers["x-has-more"]).toBe("true");expect(first.body).toHaveLength(1);
    const second=await enabled.get(`/orders?limit=1&cursor=${encodeURIComponent(first.headers["x-next-cursor"])}`).set("Authorization",auth(buyer));expect(second.body[0].id).not.toBe(first.body[0].id);
    const unknown=await enabled.get(`/orders/${randomUUID()}`).set("Authorization",auth(buyer));expect(unknown.status).toBe(404);
    expect((await enabled.get(`/orders/${first.body[0].id}`).set("Authorization",auth(seller))).status).toBe(403);
    expect((await enabled.get("/orders?cursor=tampered").set("Authorization",auth(buyer))).status).toBe(400);
    await User.updateOne({_id:delivery.id},{$set:{role:"buyer"}});
    try {
      expect((await enabled.get("/orders").set("Authorization",auth(delivery))).body).toEqual([]);
      expect((await enabled.get(`/orders/${first.body[0].id}`).set("Authorization",auth(delivery))).status).toBe(404);
      expect((await enabled.get(`/orders?cursor=${encodeURIComponent(first.headers["x-next-cursor"])}`).set("Authorization",auth(delivery))).status).toBe(400);
    } finally {await User.updateOne({_id:delivery.id},{$set:{role:"delivery"}});}
  }));
  it("keeps same-name products, variant prices and suborders independent across shops",async()=>fixture(async(product,address)=>{
    const original=await Shop.findById(otherShopId),variant=randomUUID();
    await Shop.updateOne({_id:otherShopId},{$set:{temporarilyClosed:false,openingHours:Array.from({length:7},(_,day)=>({day,opens:"00:00",closes:"23:59"})),areaIds:[areaId],fulfilment:["pickup"],minimumOrderCents:0}});
    const second=await Product.create({_id:randomUUID(),shopId:otherShopId,categoryId,name:"Order snapshot listing",sortName:"order snapshot listing",unit:"box",description:"",priceCents:500,stock:99,sortPriceCents:2000,totalStock:2,variants:[{_id:variant,label:"Large",priceCents:2000,stock:2,active:true}],active:true});
    try {
      const input=body(product,address);
      const result=await createCodOrder(buyer,randomUUID(),{...input,expectedTotal:45,items:[...input.items,{productId:second._id,variantId:variant,qty:1}],fulfilments:[...input.fulfilments,{shopId:otherShopId,method:"pickup"}]});
      expect(result.order.subOrders).toHaveLength(2);expect(result.order.totalCents).toBe(4500);
      expect(result.order.subOrders.find(sub=>sub.shopId===shopId)!.lines[0].priceCents).toBe(1250);
      expect(result.order.subOrders.find(sub=>sub.shopId===otherShopId)!.lines[0]).toMatchObject({priceCents:2000,variantId:variant,variantLabel:"Large"});
      const current=await Product.findById(second._id);expect(current!.stock).toBe(99);expect(current!.variants[0].stock).toBe(1);
      const own=(await enabled.get("/seller/orders").set("Authorization",auth(seller))).body;
      expect(own).toHaveLength(1);expect(own[0].shopId).toBe(shopId);expect(own[0]).not.toHaveProperty("subOrders");expect(own[0]).not.toHaveProperty("buyerId");expect(own[0]).not.toHaveProperty("deliveryAddress");
      const firstSub=result.order.subOrders.find(sub=>sub.shopId===shopId)!;
      await transitionSellerSuborder(seller,result.order._id,firstSub._id,{version:0,status:"cancelled",reason:"Cannot supply"});
      const partial=await enabled.get(`/orders/${result.order._id}`).set("Authorization",auth(buyer));expect(partial.body).toMatchObject({total:45,amountDue:20,cancelledAmount:25});expect(partial.body.subOrders.find((sub:{shopId:string})=>sub.shopId===otherShopId).status).toBe("placed");expect((await Product.findById(second._id))!.variants[0].stock).toBe(1);
      const secondSub=result.order.subOrders.find(sub=>sub.shopId===otherShopId)!;
      await transitionSellerSuborder(otherSeller,result.order._id,secondSub._id,{version:0,status:"cancelled",reason:"No supply today"});expect((await Product.findById(second._id))!.variants[0].stock).toBe(2);expect((await Product.findById(second._id))!.stock).toBe(99);
    } finally {
      await Product.deleteOne({_id:second._id});await Shop.updateOne({_id:otherShopId},{$set:{temporarilyClosed:original!.temporarilyClosed,openingHours:original!.openingHours,areaIds:original!.areaIds,fulfilment:original!.fulfilment},$unset:{minimumOrderCents:1}});
      if(original!.minimumOrderCents!==undefined)await Shop.updateOne({_id:otherShopId},{$set:{minimumOrderCents:original!.minimumOrderCents}});
    }
  }));
  it("rejects extra prices/roles and returns a policy-correct quote only when enabled",async()=>fixture(async(product,address)=>{
    const input=body(product,address);
    for(const invalid of [{...input,role:"admin"},{...input,items:[{productId:product,qty:1,price:1}]},{...input,paymentMethod:"upi"}]) expect((await enabled.post("/orders").set("Authorization",auth(buyer)).set("Idempotency-Key",randomUUID()).send(invalid)).status).toBe(400);
    const result=await enabled.post("/checkout/review").set("Authorization",auth(buyer)).send({areaId,addressId:address,addressVersion:0,items:input.items,fulfilments:input.fulfilments});expect(result.body).toMatchObject({checkoutAvailable:true,grandTotal:25,deliveryTotal:0,reserved:false,paymentMethods:["cod"]});expect((await Product.findById(product))!.stock).toBe(5);
  }));
});
describe("transactional inventory holds (internal only)",()=>{
  it("restricts inventory monitoring to admins and omits operational customer data",async()=>{
    expect((await api.get("/admin/inventory")).status).toBe(401);
    expect((await api.get("/admin/inventory").set("Authorization",auth(seller))).status).toBe(403);
    const result=await api.get("/admin/inventory").set("Authorization",auth(admin));expect(result.status).toBe(200);expect(result.headers["cache-control"]).toContain("no-store");expect(result.body.workerConfigured).toBe(false);expect(result.body).not.toHaveProperty("buyerId");expect(result.body).not.toHaveProperty("lines");
  });
  async function fixture(run:(base:string,variantProduct:string,variant:string)=>Promise<void>){
    const original=await Shop.findById(shopId);
    await InventoryReservation.init();
    await Shop.updateOne({_id:shopId},{$set:{temporarilyClosed:false,openingHours:Array.from({length:7},(_,day)=>({day,opens:"00:00",closes:"23:59"}))}});
    const base=await Product.create({_id:randomUUID(),shopId,categoryId,name:"Isolated inventory",sortName:"isolated inventory",unit:"pack",description:"",priceCents:1050,stock:5,sortPriceCents:1050,totalStock:5,variants:[],active:true});
    const variant=randomUUID();
    const options=await Product.create({_id:randomUUID(),shopId,categoryId,name:"Isolated options",sortName:"isolated options",unit:"pack",description:"",priceCents:500,stock:99,sortPriceCents:2000,totalStock:3,variants:[{_id:variant,label:"Small",priceCents:2000,stock:3,active:true}],active:true});
    try {await run(base._id,options._id,variant);} finally {
      await InventoryReservation.deleteMany({"lines.productId":{$in:[base._id,options._id]}});
      await Product.deleteMany({_id:{$in:[base._id,options._id]}});
      await Shop.updateOne({_id:shopId},{$set:{temporarilyClosed:original!.temporarilyClosed,openingHours:original!.openingHours}});
    }
  }
  it("serializes competing attempts at the last unit without overselling",async()=>fixture(async(base)=>{
    await Product.updateOne({_id:base},{$set:{stock:1,totalStock:1}});
    const attempts=await Promise.allSettled([reserveInventory(buyer,{key:randomUUID(),items:[{productId:base,qty:1}]}),reserveInventory(buyer,{key:randomUUID(),items:[{productId:base,qty:1}]})]);
    expect(attempts.filter(result=>result.status==="fulfilled")).toHaveLength(1);expect(attempts.filter(result=>result.status==="rejected")).toHaveLength(1);
    expect((await Product.findById(base))!.stock).toBe(0);expect(await InventoryReservation.countDocuments({"lines.productId":base,state:"held"})).toBe(1);
  }));
  it("replays duplicate concurrent requests once and rejects a changed payload",async()=>fixture(async(base)=>{
    const input={key:randomUUID(),items:[{productId:base,qty:2}]};
    const [a,b]=await Promise.all([reserveInventory(buyer,input),reserveInventory(buyer,input)]);
    expect(a._id).toBe(b._id);expect(a.lines[0].priceCents).toBe(1050);expect((await Product.findById(base))!.stock).toBe(3);
    await expect(reserveInventory(buyer,{...input,items:[{productId:base,qty:1}]})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
    await Promise.all([releaseInventory(buyer,a._id),releaseInventory(buyer,a._id)]);
    expect((await Product.findById(base))!.stock).toBe(5);expect((await reserveInventory(buyer,input)).state).toBe("released");expect((await Product.findById(base))!.stock).toBe(5);
  }));
  it("rolls back the entire bag when one line is short or a variant belongs elsewhere",async()=>fixture(async(base,option,variant)=>{
    await expect(reserveInventory(buyer,{key:randomUUID(),items:[{productId:base,qty:2},{productId:option,variantId:variant,qty:4}]})).rejects.toMatchObject({code:"INSUFFICIENT_STOCK"});
    expect((await Product.findById(base))!.stock).toBe(5);expect(await InventoryReservation.countDocuments({"lines.productId":base})).toBe(0);
    await expect(reserveInventory(buyer,{key:randomUUID(),items:[{productId:base,variantId:variant,qty:1}]})).rejects.toMatchObject({code:"VARIANT_UNAVAILABLE"});
    await expect(reserveInventory(buyer,{key:randomUUID(),items:[{productId:option,qty:1}]})).rejects.toMatchObject({code:"VARIANT_UNAVAILABLE"});
  }));
  it("keeps base and option stock independent and protects held listings from edits",async()=>fixture(async(base,option,variant)=>{
    const hold=await reserveInventory(buyer,{key:randomUUID(),items:[{productId:option,variantId:variant,qty:2}]});
    let record=await Product.findById(option);expect(record!.stock).toBe(99);expect(record!.variants[0].stock).toBe(1);expect(record!.totalStock).toBe(1);
    await expect(patchProduct(seller,option,productPatch.parse({version:record!.version,stock:100}))).rejects.toMatchObject({code:"INVENTORY_HELD"});
    await expect(releaseInventory({...buyer,id:seller.id},hold._id)).rejects.toMatchObject({code:"NOT_FOUND"});
    await releaseInventory(buyer,hold._id);record=await Product.findById(option);expect(record!.variants[0].stock).toBe(3);expect(record!.stock).toBe(99);
    await patchProduct(seller,option,productPatch.parse({version:record!.version,stock:100}));
    expect((await Product.findById(base))!.stock).toBe(5);
  }));
  it("restores expired holds exactly once and never removes ledger records by TTL",async()=>fixture(async(base)=>{
    const hold=await reserveInventory(buyer,{key:randomUUID(),items:[{productId:base,qty:3}]});
    expect(await releaseExpiredInventory()).toBe(0);
    await InventoryReservation.updateOne({_id:hold._id},{$set:{expiresAt:new Date(Date.now()-1000)}});
    await Promise.all([releaseExpiredInventory(),releaseExpiredInventory(),releaseInventory(buyer,hold._id)]);
    expect((await Product.findById(base))!.stock).toBe(5);expect((await InventoryReservation.findById(hold._id))!.state).toBe("expired");
    expect((await InventoryReservation.collection.indexes()).some(index=>index.expireAfterSeconds!==undefined)).toBe(false);
  }));
  it("fails closed for seller callers, duplicate SKUs and closed shops",async()=>fixture(async(base)=>{
    await expect(reserveInventory(seller,{key:randomUUID(),items:[{productId:base,qty:1}]})).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(reserveInventory(buyer,{key:randomUUID(),items:[{productId:base,qty:1},{productId:base,qty:1}]})).rejects.toThrow();
    await Shop.updateOne({_id:shopId},{$set:{temporarilyClosed:true}});
    await expect(reserveInventory(buyer,{key:randomUUID(),items:[{productId:base,qty:1}]})).rejects.toMatchObject({code:"SHOP_UNAVAILABLE"});
    expect((await Product.findById(base))!.stock).toBe(5);
  }));
  it("rolls back release when a held variant is missing until reconciliation repairs it",async()=>fixture(async(base,option,variant)=>{
    const hold=await reserveInventory(buyer,{key:randomUUID(),items:[{productId:base,qty:2},{productId:option,variantId:variant,qty:1}]});
    const saved=(await Product.findById(option))!.toObject().variants[0];
    // Simulate an out-of-band data corruption; normal seller mutations are blocked.
    await Product.updateOne({_id:option},{$set:{variants:[]}});
    await expect(releaseInventory(buyer,hold._id)).rejects.toMatchObject({code:"INVENTORY_INVARIANT"});
    expect((await InventoryReservation.findById(hold._id))!.state).toBe("held");expect((await Product.findById(base))!.stock).toBe(3);
    await Product.updateOne({_id:option},{$set:{variants:[saved]}});
    await releaseInventory(buyer,hold._id);expect((await Product.findById(base))!.stock).toBe(5);expect((await Product.findById(option))!.variants[0].stock).toBe(3);
  }));
  it("backs off a corrupt expired hold without starving healthy later holds",async()=>fixture(async(base,option,variant)=>{
    const bad=await reserveInventory(buyer,{key:randomUUID(),items:[{productId:option,variantId:variant,qty:1}]}),good=await reserveInventory(buyer,{key:randomUUID(),items:[{productId:base,qty:2}]});
    const saved=(await Product.findById(option))!.toObject().variants;
    await Product.updateOne({_id:option},{$set:{variants:[]}});
    await InventoryReservation.updateOne({_id:bad._id},{$set:{expiresAt:new Date(Date.now()-2000)}});await InventoryReservation.updateOne({_id:good._id},{$set:{expiresAt:new Date(Date.now()-1000)}});
    const result=await sweepExpiredInventory();expect(result).toEqual({examined:2,completed:1,failed:1});expect((await Product.findById(base))!.stock).toBe(5);
    const pending=await InventoryReservation.findById(bad._id);expect(pending!.state).toBe("held");expect(pending!.lastFailureCode).toBe("INVENTORY_INVARIANT");expect(pending!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    expect((await sweepExpiredInventory()).examined).toBe(0);
    const status=await api.get("/admin/inventory").set("Authorization",auth(admin));expect(status.body).toMatchObject({overdueCount:1,retryingCount:1});
    await Product.updateOne({_id:option},{$set:{variants:saved}});await InventoryReservation.updateOne({_id:bad._id},{$set:{nextAttemptAt:new Date(0)}});
    expect((await sweepExpiredInventory()).completed).toBe(1);expect((await Product.findById(option))!.variants[0].stock).toBe(3);
    await verifyInventoryIndexes();
    await InventoryReservation.collection.createIndex({releasedAt:1},{expireAfterSeconds:0,name:"isolated_bad_ttl"});
    try {await expect(verifyInventoryIndexes()).rejects.toThrow("TTL");} finally {await InventoryReservation.collection.dropIndex("isolated_bad_ttl");}
  }));
});
describe("combined checkout review",()=>{
  it("revalidates selected methods and stock without enabling orders or trusting caller prices",async()=>{
    const address=(await api.post("/addresses").set("Authorization",auth(buyer)).send({label:"Test review",line1:"Isolated test address",locality:"Test",city:"Test",pincode:"999999"})).body;
    const product=await Product.findById(productId);
    const body={areaId,addressId:address.id,addressVersion:0,items:[{productId,variantId:product!.variants.find(v=>v.active)!._id,qty:999}],fulfilments:[]};
    try {
      expect((await api.post("/checkout/review").send(body)).status).toBe(401);
      expect((await api.post("/checkout/review").set("Authorization",auth(seller)).send(body)).status).toBe(404);
      const result=await api.post("/checkout/review").set("Authorization",auth(buyer)).send(body);
      expect(result.status).toBe(200);expect(result.body).toMatchObject({reserved:false,checkoutAvailable:false,grandTotal:null,addressVersion:0});expect(result.body.lines[0].issues[0].code).toBe("INSUFFICIENT_STOCK");expect(result.body.fulfilments[0].issues.some((issue:{code:string})=>issue.code==="METHOD_REQUIRED")).toBe(true);expect(result.body.issues[0].code).toBe("FINAL_QUOTE_PENDING");
      for(const invalid of [{...body,total:0},{...body,items:[body.items[0],body.items[0]]},{...body,fulfilments:[{shopId:otherShopId,method:"pickup"}]},{...body,fulfilments:[{shopId,method:"pickup"},{shopId,method:"pickup"}]}]) expect((await api.post("/checkout/review").set("Authorization",auth(buyer)).send(invalid)).status).toBe(400);
      const changed=await api.post("/checkout/review").set("Authorization",auth(buyer)).send({...body,addressVersion:1,fulfilments:[{shopId,method:"platform_delivery"}]});expect(changed.status).toBe(200);expect(changed.body.issues.some((issue:{code:string})=>issue.code==="ADDRESS_CHANGED")).toBe(true);
      expect((await Product.findById(productId))!.totalStock).toBe(product!.totalStock);
    } finally {await api.delete(`/addresses/${address.id}`).set("Authorization",auth(buyer)).send({version:0});}
  });
});
describe("address fulfilment review",()=>{
  const input={label:"Test",line1:"Isolated address",locality:"Test",city:"Test",pincode:"999999"};
  it("requires an owned address and rejects client fees and duplicate shops",async()=>{
    expect((await api.post("/cart/fulfilment").send({addressId:randomUUID(),shopIds:[shopId]})).status).toBe(401);
    const address=(await api.post("/addresses").set("Authorization",auth(buyer)).send(input)).body;
    try {
      expect((await api.post("/cart/fulfilment").set("Authorization",auth(seller)).send({addressId:address.id,shopIds:[shopId]})).status).toBe(404);
      for(const body of [{addressId:address.id,shopIds:[shopId,shopId]},{addressId:address.id,shopIds:[shopId],fee:0}]) expect((await api.post("/cart/fulfilment").set("Authorization",auth(buyer)).send(body)).status).toBe(400);
    } finally {await api.delete(`/addresses/${address.id}`).set("Authorization",auth(buyer)).send({version:0});}
  });
  it("separates pickup from delivery coverage, keeps platform capacity unverified and hides private shops",async()=>{
    const original=await Shop.findById(shopId),area=await Area.findById(areaId);
    const address=(await api.post("/addresses").set("Authorization",auth(buyer)).send(input)).body;
    await Area.updateOne({_id:areaId},{$addToSet:{pincodes:input.pincode}});
    await Shop.updateOne({_id:shopId},{$set:{status:"approved",active:true,temporarilyClosed:false,openingHours:Array.from({length:7},(_,day)=>({day,opens:"00:00",closes:"23:59"})),fulfilment:["pickup","seller_delivery","platform_delivery"],deliveryFeeCents:1250,areaIds:[areaId]}});
    const review=()=>api.post("/cart/fulfilment").set("Authorization",auth(buyer)).send({addressId:address.id,shopIds:[shopId]});
    try {
      const covered=await review();expect(covered.status).toBe(200);expect(covered.headers["cache-control"]).toContain("no-store");expect(covered.body.shops[0].options.map((o:{status:string})=>o.status)).toEqual(["eligible","eligible","unverified"]);expect(covered.body.shops[0].options[1].listedFee).toBe(12.5);expect(covered.body.checkoutAvailable).toBe(false);expect(covered.body).not.toHaveProperty("line1");
      await Shop.updateOne({_id:shopId},{$set:{areaIds:[]}});
      expect((await review()).body.shops[0].options.map((o:{status:string})=>o.status)).toEqual(["eligible","unavailable","unavailable"]);
      await Shop.updateOne({_id:shopId},{$set:{temporarilyClosed:true}});expect((await review()).body.shops[0].options.every((o:{status:string})=>o.status==="unavailable")).toBe(true);
      await Shop.updateOne({_id:shopId},{$set:{status:"pending"}});expect((await review()).body.shops[0]).toEqual({shopId,options:[],issues:[{code:"SHOP_UNAVAILABLE",message:"This shop is unavailable."}]});
    } finally {
      await Shop.updateOne({_id:shopId},{$set:{status:original!.status,active:original!.active,temporarilyClosed:original!.temporarilyClosed,openingHours:original!.openingHours,fulfilment:original!.fulfilment,areaIds:original!.areaIds},...(original!.deliveryFeeCents===undefined ? {$unset:{deliveryFeeCents:1}} : {})});
      if(original!.deliveryFeeCents!==undefined) await Shop.updateOne({_id:shopId},{$set:{deliveryFeeCents:original!.deliveryFeeCents}});
      await Area.updateOne({_id:areaId},{$set:{pincodes:area!.pincodes}});await api.delete(`/addresses/${address.id}`).set("Authorization",auth(buyer)).send({version:0});
    }
  });
});
describe("private saved addresses",()=>{
  const input={label:"Home",line1:"Isolated test address",locality:"Test locality",city:"Test city",pincode:"999999"};
  it("requires authentication and rejects ownership overrides and invalid input",async()=>{
    expect((await api.get("/addresses")).status).toBe(401);
    for(const body of [{...input,userId:seller.id},{...input,pincode:"123"},{...input,line1:" "}]) {
      expect((await api.post("/addresses").set("Authorization",auth(buyer)).send(body)).status).toBe(400);
    }
  });
  it("isolates accounts and conditionally updates/deletes by version",async()=>{
    const created=await api.post("/addresses").set("Authorization",auth(buyer)).send(input);
    expect(created.status).toBe(201);expect(created.body.version).toBe(0);expect(created.body).not.toHaveProperty("userId");
    const path=`/addresses/${created.body.id}`;
    const listed=await api.get("/addresses").set("Authorization",auth(buyer));
    expect(listed.headers["cache-control"]).toContain("no-store");expect(listed.body.map((a:{id:string})=>a.id)).toContain(created.body.id);
    expect((await api.get("/addresses").set("Authorization",auth(seller))).body).toEqual([]);
    expect((await api.patch(path).set("Authorization",auth(seller)).send({version:0,label:"Other"})).status).toBe(404);
    expect((await api.delete(path).set("Authorization",auth(seller)).send({version:0})).status).toBe(404);
    expect((await api.patch(path).set("Authorization",auth(buyer)).send({version:0})).status).toBe(400);
    const changed=await api.patch(path).set("Authorization",auth(buyer)).send({version:0,label:"Work"});
    expect(changed.status).toBe(200);expect(changed.body).toMatchObject({label:"Work",version:1});
    expect((await api.patch(path).set("Authorization",auth(buyer)).send({version:0,label:"Stale"})).status).toBe(409);
    expect((await api.delete(path).set("Authorization",auth(buyer)).send({version:0})).status).toBe(409);
    expect((await api.delete(path).set("Authorization",auth(buyer)).send({version:1})).status).toBe(204);
    expect((await api.delete(path).set("Authorization",auth(buyer)).send({version:1})).status).toBe(404);
  });
});
describe("read-only cart review",()=>{
  it("prices same-named listings independently by actual product/shop and does not reserve stock",async()=>{
    const first=await Product.findById(productId),second=await Product.findById(otherProductId);
    const a=first!.variants.find(v=>v.active)!,b=second!.variants.find(v=>v.active)!;
    const result=await api.post("/cart/quote").send({areaId,items:[{productId,variantId:a._id,qty:2},{productId:otherProductId,variantId:b._id,qty:2}]});
    expect(result.status).toBe(200);expect(result.body.shops).toHaveLength(2);
    expect(result.body.itemsSubtotal).toBe((a.priceCents*2+b.priceCents*2)/100);
    expect(result.body.lines.map((line:{shopId:string})=>line.shopId)).toEqual([shopId,otherShopId]);
    expect(result.body.lines.every((line:{issues:{code:string}[]})=>!line.issues.some(issue=>issue.code==="INSUFFICIENT_STOCK"))).toBe(true);
    expect(result.body.reserved).toBe(false);expect(result.body.checkoutAvailable).toBe(false);expect(result.body.grandTotal).toBeNull();expect(result.body.deliveryTotal).toBeNull();
    expect((await Product.findById(productId))!.totalStock).toBe(first!.totalStock);
    expect(result.body.shops[0].shop).not.toHaveProperty("ownerId");expect(result.body.shops[0].shop).not.toHaveProperty("review");
  });
  it("never falls back to parent price or stock for missing/unrelated variants",async()=>{
    const other=await Product.findById(otherProductId);
    const missing=await api.post("/cart/quote").send({areaId,items:[{productId,qty:1}]});expect(missing.body.lines[0].issues[0].code).toBe("VARIANT_REQUIRED");expect(missing.body.lines[0]).not.toHaveProperty("unitPrice");
    const unrelated=await api.post("/cart/quote").send({areaId,items:[{productId,variantId:other!.variants[0]._id,qty:1}]});expect(unrelated.body.lines[0].issues[0].code).toBe("VARIANT_UNAVAILABLE");expect(unrelated.body.lines[0]).not.toHaveProperty("availableStock");
  });
  it("rejects duplicate lines, invalid quantities and client pricing/ownership fields",async()=>{
    const item={productId,qty:1};
    for(const items of [[item,item],[{...item,qty:0}],[{...item,qty:1.5}],[{...item,qty:1000}],[{...item,price:1}],[{...item,shopId:otherShopId}]]) expect((await api.post("/cart/quote").send({areaId,items})).status).toBe(400);
  });
  it("does not expose private or unserviceable listings",async()=>{
    const other=await Shop.findById(otherShopId);await Shop.updateOne({_id:otherShopId},{$set:{status:"pending"}});
    try {
      const hidden=await api.post("/cart/quote").send({areaId,items:[{productId:otherProductId,qty:1}]});expect(hidden.status).toBe(200);expect(hidden.body.lines[0].issues[0].code).toBe("PRODUCT_UNAVAILABLE");expect(hidden.body.lines[0]).not.toHaveProperty("product");expect(hidden.body.lines[0]).not.toHaveProperty("shopId");
      const wrongArea=await api.post("/cart/quote").send({areaId:otherAreaId,items:[{productId,qty:1}]});expect(wrongArea.body.shops).toEqual([]);expect(wrongArea.body.lines[0]).not.toHaveProperty("product");
      expect((await api.post("/cart/quote").send({areaId:randomUUID(),items:[{productId,qty:1}]})).status).toBe(400);
    } finally {await Shop.updateOne({_id:otherShopId},{$set:{status:other!.status}});}
  });
  it("uses paise arithmetic and reports closed shops, shortages and minimums",async()=>{
    const original=await Product.findById(productId),shop=await Shop.findById(shopId);const variant=original!.variants[0];
    await Product.updateOne({_id:productId,"variants._id":variant._id},{$set:{"variants.$.priceCents":1050}});await Shop.updateOne({_id:shopId},{$set:{temporarilyClosed:true,minimumOrderCents:10000}});
    try {
      const result=await api.post("/cart/quote").send({areaId,items:[{productId,variantId:variant._id,qty:3}]});expect(result.status).toBe(200);expect(result.body.itemsSubtotal).toBe(31.5);expect(result.body.lines[0].unitPrice).toBe(10.5);expect(result.body.lines[0].issues[0].code).toBe("INSUFFICIENT_STOCK");expect(result.body.shops[0].issues.map((issue:{code:string})=>issue.code)).toEqual(["SHOP_CLOSED","MINIMUM_NOT_MET"]);
    } finally {await Product.updateOne({_id:productId,"variants._id":variant._id},{$set:{"variants.$.priceCents":variant.priceCents}});await Shop.updateOne({_id:shopId},{$set:{temporarilyClosed:shop!.temporarilyClosed},...(shop!.minimumOrderCents===undefined ? {$unset:{minimumOrderCents:1}} : {$set:{temporarilyClosed:shop!.temporarilyClosed,minimumOrderCents:shop!.minimumOrderCents}})});}
  });
});
describe("owned product photo uploads",()=>{
  it("uploads only the seller's shop photo, validates versions/content and returns it to review",async()=>{
    const r2Config={...config,IMAGE_STORAGE_PROVIDER:"r2" as const,CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_R2_ACCESS_KEY_ID:"b".repeat(32),CLOUDFLARE_R2_SECRET_ACCESS_KEY:"c".repeat(64),CLOUDFLARE_R2_BUCKET:"test-products",CLOUDFLARE_R2_PUBLIC_BASE_URL:"https://images.example.com"};
    const client=request(createApp(r2Config)),original=await Shop.findById(shopId).lean(),other=await Shop.findById(otherShopId).lean(),png=await sharp({create:{width:4,height:4,channels:3,background:"green"}}).png().toBuffer();
    const send=vi.spyOn(S3Client.prototype,"send").mockResolvedValue({} as never);
    try{
      expect((await client.post("/seller/shop/image").set("Content-Type","image/png").send(png)).status).toBe(401);
      expect((await client.post("/seller/shop/image").set("Authorization",auth(buyer)).set("Content-Type","image/png").send(png)).status).toBe(403);
      expect((await client.post("/seller/shop/image").set("Authorization",auth(seller)).set("X-Shop-Version",String(original!.version+1)).set("Content-Type","image/png").send(png)).status).toBe(409);
      expect((await client.post("/seller/shop/image").set("Authorization",auth(seller)).set("X-Shop-Version",String(original!.version)).set("Content-Type","image/png").send(Buffer.from("invalid"))).status).toBe(415);
      expect(send).not.toHaveBeenCalled();
      const result=await client.post("/seller/shop/image").set("Authorization",auth(seller)).set("X-Shop-Version",String(original!.version)).set("Content-Type","image/png").send(png);
      expect(result.status).toBe(200);expect(result.body.status).toBe("pending");expect(result.body.version).toBe(original!.version+1);expect(result.body.coverImage).toMatch(/^https:\/\/images.example.com\/shops\/[a-f0-9]{32}\.webp$/);
      expect((await Shop.findById(otherShopId))!.coverImage).toBe(other!.coverImage);
      send.mockImplementationOnce(async()=>{await Shop.updateOne({_id:shopId},{$inc:{version:1}});return {} as never;});
      expect((await client.post("/seller/shop/image").set("Authorization",auth(seller)).set("X-Shop-Version",String(result.body.version)).set("Content-Type","image/png").send(png)).status).toBe(409);
      expect((await Shop.findById(shopId))!.coverImage).toBe(result.body.coverImage);
      expect(send.mock.calls.at(-1)![0]).toBeInstanceOf(DeleteObjectCommand);
    }finally{send.mockRestore();await Shop.updateOne({_id:shopId},{$set:{coverImage:original!.coverImage,status:original!.status,version:original!.version}});}
  });
  it("attaches R2 photos through the existing owner/version endpoint and cleans only a losing attempt",async()=>{
    const r2Config={...config,IMAGE_STORAGE_PROVIDER:"r2" as const,CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_R2_ACCESS_KEY_ID:"b".repeat(32),CLOUDFLARE_R2_SECRET_ACCESS_KEY:"c".repeat(64),CLOUDFLARE_R2_BUCKET:"test-products",CLOUDFLARE_R2_PUBLIC_BASE_URL:"https://images.example.com"};
    const client=request(createApp(r2Config)),original=await Product.findById(productId);
    const send=vi.spyOn(S3Client.prototype,"send").mockResolvedValue({} as never);
    try{
      const path=`/seller/products/${productId}/image`,png=await sharp({create:{width:4,height:4,channels:3,background:"green"}}).png().toBuffer();
      expect((await client.post(path).set("Authorization",auth(otherSeller)).set("X-Product-Version",String(original!.version)).set("Content-Type","image/png").send(png)).status).toBe(404);expect(send).not.toHaveBeenCalled();
      const uploaded=await client.post(path).set("Authorization",auth(seller)).set("X-Product-Version",String(original!.version)).set("Content-Type","image/png").send(png);
      expect(uploaded.status).toBe(200);expect(uploaded.body.image).toMatch(/^https:\/\/images.example.com\/products\/[a-f0-9]{32}\.webp$/);
      const put=send.mock.calls[0][0] as PutObjectCommand;expect((await sharp(put.input.Body as Buffer).metadata()).format).toBe("webp");
      send.mockImplementationOnce(async()=>{await Product.updateOne({_id:productId},{$inc:{version:1}});return {} as never;});
      const loser=await client.post(path).set("Authorization",auth(seller)).set("X-Product-Version",String(uploaded.body.version)).set("Content-Type","image/png").send(png);
      expect(loser.status).toBe(409);expect((await Product.findById(productId))!.image).toBe(uploaded.body.image);
      const losingPut=send.mock.calls[1][0] as PutObjectCommand,cleanup=send.mock.calls[2][0] as DeleteObjectCommand;expect(cleanup).toBeInstanceOf(DeleteObjectCommand);expect(cleanup.input.Key).toBe(losingPut.input.Key);expect(cleanup.input.Key).not.toBe(put.input.Key);
    }finally{send.mockRestore();await Product.updateOne({_id:productId},{$set:{image:original!.image,version:original!.version}});}
  });
  const imageConfig={...config,CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_IMAGES_API_TOKEN:"isolated-test-token-only-2026",CLOUDFLARE_IMAGES_ACCOUNT_HASH:"test-delivery-hash"};
  const images=request(createApp(imageConfig));
  const photo=()=>sharp({create:{width:4,height:4,channels:3,background:"green"}}).png().toBuffer();
  it("keeps capability private and fails closed without configured storage",async()=>{
    expect((await api.get("/seller/image-upload")).status).toBe(401);
    expect((await api.get("/seller/image-upload").set("Authorization",auth(buyer))).status).toBe(403);
    expect((await api.get("/seller/image-upload").set("Authorization",auth(seller))).body.enabled).toBe(false);
    const product=await Product.findById(productId);
    const result=await api.post(`/seller/products/${productId}/image`).set("Authorization",auth(seller)).set("X-Product-Version",String(product!.version)).set("Content-Type","image/png").send(await photo());
    expect(result.status).toBe(503);expect(result.body.code).toBe("IMAGE_UPLOAD_UNAVAILABLE");
  });
  it("checks ownership, version, content and byte limits before calling storage",async()=>{
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    try {
      const product=await Product.findById(productId);const path=`/seller/products/${productId}/image`;
      expect((await images.post(path).set("Authorization",auth(otherSeller)).set("X-Product-Version",String(product!.version)).set("Content-Type","image/png").send(await photo())).status).toBe(404);
      expect((await images.post(path).set("Authorization",auth(seller)).set("X-Product-Version",String(product!.version+10)).set("Content-Type","image/png").send(await photo())).status).toBe(409);
      expect((await images.post(path).set("Authorization",auth(seller)).set("X-Product-Version",String(product!.version)).set("Content-Type","image/png").send(Buffer.from("bad content"))).status).toBe(415);
      expect((await images.post(path).set("Authorization",auth(seller)).set("X-Product-Version",String(product!.version)).set("Content-Type","image/png").send(Buffer.alloc(5*1024*1024+1))).status).toBe(413);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {vi.unstubAllGlobals();}
  });
  it("stores a real decoded image and updates only the owning product image/version",async()=>{
    const original=await Product.findById(productId);
    const fetcher=vi.fn(async(_url:unknown,init:RequestInit)=>{
      const form=init.body as FormData;const file=form.get("file") as File;expect(file.type).toBe("image/webp");
      return new Response(JSON.stringify({success:true,result:{id:form.get("id")}}),{status:200});
    });vi.stubGlobal("fetch",fetcher);
    try {
      const result=await images.post(`/seller/products/${productId}/image`).set("Authorization",auth(seller)).set("X-Product-Version",String(original!.version)).set("Content-Type","image/png").send(await photo());
      expect(result.status).toBe(200);expect(result.body.image).toMatch(/^https:\/\/imagedelivery.net\/test-delivery-hash\/[a-f0-9]{32}\/public$/);
      expect(result.body.version).toBe(original!.version+1);expect(result.body.stock).toBe(original!.stock);expect(result.body.shopId).toBe(original!.shopId);
      expect(JSON.stringify(result.body)).not.toContain(imageConfig.CLOUDFLARE_IMAGES_API_TOKEN);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {vi.unstubAllGlobals();}
  });
  it("returns a safe provider failure and leaves the old image unchanged",async()=>{
    const original=await Product.findById(productId);
    vi.stubGlobal("fetch",vi.fn(async(_url:unknown,init:RequestInit)=>new Response(JSON.stringify(init.method==="DELETE" ? {success:true} : {error:imageConfig.CLOUDFLARE_IMAGES_API_TOKEN}),{status:init.method==="DELETE" ? 200 : 500})));
    try {
      const result=await images.post(`/seller/products/${productId}/image`).set("Authorization",auth(seller)).set("X-Product-Version",String(original!.version)).set("Content-Type","image/png").send(await photo());
      expect(result.status).toBe(502);expect(JSON.stringify(result.body)).not.toContain(imageConfig.CLOUDFLARE_IMAGES_API_TOKEN);
      expect((await Product.findById(productId))!.image).toBe(original!.image);
    } finally {vi.unstubAllGlobals();}
  });
  it("cleans only the new unattached asset when a concurrent edit wins",async()=>{
    const original=await Product.findById(productId);let uploadId:unknown;
    const fetcher=vi.fn(async(_url:unknown,init:RequestInit)=>{
      if(init.method==="DELETE") return new Response(JSON.stringify({success:true}),{status:200});
      const form=init.body as FormData;uploadId=form.get("id");
      await Product.updateOne({_id:productId},{$inc:{version:1}});
      return new Response(JSON.stringify({success:true,result:{id:uploadId}}),{status:200});
    });vi.stubGlobal("fetch",fetcher);
    try {
      const result=await images.post(`/seller/products/${productId}/image`).set("Authorization",auth(seller)).set("X-Product-Version",String(original!.version)).set("Content-Type","image/png").send(await photo());
      expect(result.status).toBe(409);expect((await Product.findById(productId))!.image).toBe(original!.image);
      expect(fetcher.mock.calls[1][0]).toBe(`https://api.cloudflare.com/client/v4/accounts/${imageConfig.CLOUDFLARE_ACCOUNT_ID}/images/v1/${uploadId}`);
      expect(fetcher.mock.calls[1][1].method).toBe("DELETE");
    } finally {vi.unstubAllGlobals();}
  });
});
it("keeps review reasons private, versioned and available after seller resubmission",async()=>{
  const user=await createUser({name:"TEST review seller",phone:"+919000003001",password},"seller");
  const owner={id:user._id,role:"seller" as const};
  const session=await login({phone:user.phone,password},config,"review-test");
  const ownerAuth=`Bearer ${session.token}`;
  const shop=await createShop(owner,shopCreate.parse({slug:"test-review-shop",name:"TEST review shop",locality:"TEST area",categoryIds:[categoryId],serviceAreaIds:[areaId],fulfilment:["pickup"],since:2020,initials:"TR"}));
  const path=`/admin/shops/${shop._id}/approval`;
  for(const status of ["rejected","suspended"]) {
    const missing=await api.patch(path).set("Authorization",auth(admin)).send({status,version:shop.version});
    expect(missing.status).toBe(400);expect(missing.body.fields).toContain("reason");
  }
  const rejected=await api.patch(path).set("Authorization",auth(admin)).send({status:"rejected",version:shop.version,reason:"  Please correct the shop address  "});
  expect(rejected.status).toBe(200);
  const ownerView=await api.get("/seller/shop").set("Authorization",ownerAuth);
  expect(ownerView.body.review.reason).toBe("Please correct the shop address");
  expect(ownerView.body.review).not.toHaveProperty("reviewedBy");
  expect(Number.isFinite(Date.parse(ownerView.body.review.reviewedAt))).toBe(true);
  expect((await Shop.findById(shop._id))!.review!.reviewedBy).toBe(admin.id);
  expect((await api.patch("/seller/shop").set("Authorization",ownerAuth).send({version:rejected.body.version,review:{status:"approved"}})).status).toBe(400);
  const resubmitted=await api.patch("/seller/shop").set("Authorization",ownerAuth).send({version:rejected.body.version,address:"TEST corrected shop address"});
  expect(resubmitted.status).toBe(200);expect(resubmitted.body.status).toBe("pending");expect(resubmitted.body.review.status).toBe("rejected");
  expect((await api.patch(path).set("Authorization",auth(admin)).send({status:"approved",version:rejected.body.version})).status).toBe(409);
  const approved=await api.patch(path).set("Authorization",auth(admin)).send({status:"approved",version:resubmitted.body.version});
  expect(approved.status).toBe(200);expect(approved.body.review.status).toBe("approved");expect(approved.body.review.reason).toBeUndefined();
  const publicView=await api.get(`/shops/${shop.slug}`);expect(publicView.status).toBe(200);expect(publicView.body).not.toHaveProperty("review");
  const decisions=await Promise.all(["rejected","suspended"].map(status=>api.patch(path).set("Authorization",auth(admin)).send({status,version:approved.body.version,reason:"TEST concurrent review reason"})));
  expect(decisions.map(result=>result.status).sort()).toEqual([200,409]);
  const current=await Shop.findById(shop._id);
  await api.patch(path).set("Authorization",auth(admin)).send({status:"pending",version:current!.version});
});
describe("public seller onboarding", () => {
  const sellerInput = (phone:string) => ({name:"TEST self-register seller",phone,password,shop:{name:"TEST neighbourhood shop",address:"TEST full street address, TEST town",categoryIds:[categoryId],serviceAreaIds:[areaId],since:2020,fulfilment:["pickup"]}});
  it("registers a seller and pending owned shop together without exposing it publicly",async()=>{
    const input=sellerInput("+919000002001");
    const result=await api.post("/auth/register/seller").send(input);
    expect(result.status).toBe(201);expect(result.body.role).toBe("seller");
    expect(result.body).not.toHaveProperty("passwordHash");
    const profile=await api.get("/seller/shop").set("Authorization",`Bearer ${result.body.token}`);
    expect(profile.status).toBe(200);expect(profile.body.status).toBe("pending");
    expect(profile.body.address).toBe(input.shop.address);expect(profile.body.name).toBe(input.shop.name);
    expect(profile.body.categoryIds).toEqual([categoryId]);expect(profile.body.serviceAreaIds).toEqual([areaId]);
    expect(profile.body.isOpen).toBe(false);
    expect((await Shop.findById(profile.body.id))!.ownerId).toBe(result.body.userId);
    expect((await api.get(`/shops/${profile.body.slug}`)).status).toBe(404);
    expect((await api.get("/admin/shops").set("Authorization",`Bearer ${result.body.token}`)).status).toBe(403);
  });
  it("rejects privilege/approval injection and missing or invalid shop details",async()=>{
    const input=sellerInput("+919000002002");
    for(const body of [{...input,role:"admin"},{...input,shop:{...input.shop,status:"approved"}},{...input,shop:{...input.shop,ownerId:admin.id}},{...input,shop:{...input.shop,address:""}},{...input,shop:{...input.shop,categoryIds:[]}}]) {
      expect((await api.post("/auth/register/seller").send(body)).status).toBe(400);
    }
    expect(await User.countDocuments({phone:input.phone})).toBe(0);
  });
  it("rolls back user/shop/session creation if category references are invalid",async()=>{
    const input=sellerInput("+919000002003");
    const sessionsBefore=await Session.countDocuments();const shopsBefore=await Shop.countDocuments();
    const result=await api.post("/auth/register/seller").send({...input,shop:{...input.shop,categoryIds:[randomUUID()]}});
    expect(result.status).toBe(400);expect(result.body.code).toBe("INVALID_CATEGORY");
    expect(await User.countDocuments({phone:input.phone})).toBe(0);
    expect(await Shop.countDocuments()).toBe(shopsBefore);expect(await Session.countDocuments()).toBe(sessionsBefore);
  });
  it("keeps registrations atomic under duplicate races and permits identical shop names",async()=>{
    const input=sellerInput("+919000002004");
    const results=await Promise.all([1,2].map(()=>api.post("/auth/register/seller").send(input)));
    expect(results.map(r=>r.status).sort()).toEqual([201,409]);
    const user=await User.findOne({phone:input.phone});expect(user!.role).toBe("seller");
    expect(await Shop.countDocuments({ownerId:user!._id})).toBe(1);
    const second=await api.post("/auth/register/seller").send(sellerInput("+919000002005"));
    expect(second.status).toBe(201);
    const firstShop=await Shop.findOne({ownerId:user!._id});const secondShop=await Shop.findOne({ownerId:second.body.userId});
    expect(firstShop!.name).toBe(secondShop!.name);expect(firstShop!.slug).not.toBe(secondShop!.slug);
  });
});
describe("admin seller provisioning", () => {
  const input = {name:"TEST dashboard seller", phone:"+919000001111", password:"Test-only-admin-created-password"};
  it("rejects anonymous and non-admin account creation/list access", async () => {
    expect((await api.post("/admin/sellers").send(input)).status).toBe(401);
    expect((await api.get("/admin/sellers")).status).toBe(401);
    for (const who of [buyer,seller,delivery]) {
      expect((await api.post("/admin/sellers").set("Authorization",auth(who)).send(input)).status).toBe(403);
      expect((await api.get("/admin/sellers").set("Authorization",auth(who))).status).toBe(403);
    }
  });
  it("creates only a seller with a usable login without exposing secrets or switching admin sessions", async () => {
    const sessionsBefore = await Session.countDocuments({userId:admin.id});
    const result = await api.post("/admin/sellers").set("Authorization",auth(admin)).send(input);
    expect(result.status).toBe(201);
    expect(Object.keys(result.body).sort()).toEqual(["active","id","name","phone","role"]);
    expect(result.body.role).toBe("seller");
    const stored = await User.findById(result.body.id).select("+passwordHash");
    expect(stored!.passwordHash).not.toContain(input.password);
    const signedIn = await api.post("/auth/login").send({phone:input.phone,password:input.password});
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.role).toBe("seller");
    expect((await api.get("/seller/shop").set("Authorization",`Bearer ${signedIn.body.token}`)).status).toBe(404);
    expect(await Session.countDocuments({userId:admin.id})).toBe(sessionsBefore);
  });
  it("rejects role injection, invalid credentials and duplicates without changing existing users", async () => {
    const adminUser=await User.findById(admin.id);
    for(const body of [{...input,role:"admin"},{...input,password:"short"},{...input,phone:"bad"}]) {
      expect((await api.post("/admin/sellers").set("Authorization",auth(admin)).send(body)).status).toBe(400);
    }
    expect((await api.post("/admin/sellers").set("Authorization",auth(admin)).send({...input,phone:adminUser!.phone})).status).toBe(409);
    expect((await User.findById(admin.id))!.role).toBe("admin");
    expect((await api.post("/admin/sellers").set("Authorization",auth(admin)).send(input)).status).toBe(409);
  });
  it("lists only safe seller fields and scopes pagination cursors to their limit", async () => {
    const page = await api.get("/admin/sellers?limit=1").set("Authorization",auth(admin));
    expect(page.status).toBe(200); expect(page.body).toHaveLength(1);
    expect(page.body[0].role).toBe("seller");
    expect(Object.keys(page.body[0]).sort()).toEqual(["active","id","name","phone","role"]);
    const cursor=page.headers["x-next-cursor"];
    expect(cursor).toBeTruthy();
    const next=await api.get("/admin/sellers").query({limit:1,cursor}).set("Authorization",auth(admin));
    expect(next.status).toBe(200);expect(next.body[0].id).not.toBe(page.body[0].id);
    expect((await api.get("/admin/sellers").query({limit:2,cursor}).set("Authorization",auth(admin))).status).toBe(400);
  });
  it("allows only one account under concurrent duplicate creation",async()=>{
    const results=await Promise.all([1,2].map(()=>api.post("/admin/sellers").set("Authorization",auth(admin)).send({...input,phone:"+919000001112"})));
    expect(results.map(result=>result.status).sort()).toEqual([201,409]);
    expect(await User.countDocuments({phone:"+919000001112"})).toBe(1);
  });
});
it("returns the closure override only in managed shop responses", async () => {
  const shop = await Shop.findById(shopId);
  const previous = shop!.temporarilyClosed;
  await Shop.updateOne({ _id: shopId }, { $set: { temporarilyClosed: true } });
  try {
    const owner = await api.get("/seller/shop").set("Authorization", auth(seller));
    expect(owner.status).toBe(200);
    expect(owner.body.temporarilyClosed).toBe(true);
    const visible = await api.get(`/shops/${shop!.slug}`);
    if (visible.status === 200) expect(visible.body).not.toHaveProperty("temporarilyClosed");
  } finally {
    await Shop.updateOne({ _id: shopId }, { $set: { temporarilyClosed: previous } });
  }
});
beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: resolve(".cache/mongodb") },
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await connectDatabase(repl.getUri("phase1_isolated_test"));
  await Promise.all([
    User.init(),
    EmailChallenge.init(),
    EmailCooldown.init(),
    Category.init(),
    Area.init(),
    Shop.init(),
    Product.init(),
    Notification.init(),
    NotificationRead.init(),
    PushSubscription.init(),
    PushJob.init(),
  ]);
  let phone = 1000000000;
  for (const role of [
    "admin",
    "seller",
    "seller",
    "buyer",
    "delivery",
  ] as const) {
    const user = await createUser(
      { name: `TEST ${role}`, phone: `+91${phone++}`, password },
      role,
    );
    const actor = { id: user._id, role };
    tokens[user._id] = (
      await login({ phone: user.phone, password }, config, "test")
    ).token;
    if (role === "admin") admin = actor;
    else if (role === "buyer") buyer = actor;
    else if (role === "delivery") delivery = actor;
    else if (!seller) seller = actor;
    else otherSeller = actor;
  }
  categoryId = (
    await Category.create({ slug: "test-grocery", name: "TEST GROCERY" })
  )._id;
  areaId = (
    await Area.create({
      name: "TEST AREA",
      city: "TEST CITY",
      pincodes: ["000000"],
    })
  )._id;
  otherAreaId = (
    await Area.create({
      name: "OTHER TEST AREA",
      city: "TEST CITY",
      pincodes: ["000001"],
    })
  )._id;
  const shopInput = (slug: string) =>
    shopCreate.parse({
      slug,
      name: `TEST ${slug}`,
      locality: "TEST MARKET",
      categoryIds: [categoryId],
      serviceAreaIds: [areaId],
      fulfilment: ["platform_delivery", "pickup"],
      since: 2026,
      initials: "TS",
      openingHours: [{ day: 0, opens: "00:00", closes: "23:59" }],
      deliveryFee: 25,
    });
  const shop = await createShop(seller, shopInput("test-shop-one"));
  shopId = shop._id;
  await changeApproval(shopId, { status: "approved", version: shop.version });
  const otherShop = await createShop(otherSeller, shopInput("test-shop-two"));
  otherShopId = otherShop._id;
  await changeApproval(otherShopId, {
    status: "approved",
    version: otherShop.version,
  });
  const input = (name: string, price: number) =>
    productCreate.parse({
      name,
      unit: "1 item",
      categoryId,
      price,
      stock: 5,
      variants: [
        { label: "Small", price, stock: 2 },
        { label: "Large", price: price + 10, stock: 0 },
      ],
    });
  productId = (await createProduct(seller, input("TEST Apples", 20)))._id;
  otherProductId = (await createProduct(otherSeller, input("TEST Apples", 50)))
    ._id;
});
afterAll(async () => {
  await disconnectDatabase();
  if (repl) await repl.stop();
});

describe("foundation and authentication", () => {
  it("keeps only the newest successful login valid for each of the four roles",async()=>{
    for(const [index,role] of (["buyer","seller","delivery","admin"] as const).entries()){
      const user=await createUser({name:`Isolated single-session ${role}`,phone:`+91910000200${index}`,password},role);
      const first=await login({phone:user.phone,password},config,"single-session"),old=await Session.findById(tokenHash(first.token,config)).lean();
      await expect(login({phone:user.phone,password:"Incorrect-password-2026"},config,"single-session")).rejects.toMatchObject({code:"INVALID_CREDENTIALS"});
      expect((await api.get("/auth/me").set("Authorization",`Bearer ${first.token}`)).status).toBe(200);
      const second=await login({phone:user.phone,password},config,"single-session");
      expect(await Session.countDocuments({userId:user._id})).toBe(1);
      expect((await api.get("/auth/me").set("Authorization",`Bearer ${first.token}`)).status).toBe(401);
      expect((await api.get("/auth/me").set("Authorization",`Bearer ${second.token}`)).status).toBe(200);
      await Session.create(old!);expect((await api.get("/auth/me").set("Authorization",`Bearer ${first.token}`)).status).toBe(401);
      await Session.deleteOne({_id:old!._id});
    }
  });
  it("does not create two usable sessions when two devices log in concurrently",async()=>{
    const user=await createUser({name:"Isolated simultaneous devices",phone:"+919100002099",password});
    const attempts=await Promise.allSettled([login({phone:user.phone,password},config,"concurrent-device-a"),login({phone:user.phone,password},config,"concurrent-device-b")]);
    const successful=attempts.flatMap(result=>result.status==="fulfilled" ? [result.value] : []);expect(successful.length).toBeGreaterThan(0);
    const statuses=await Promise.all(successful.map(session=>api.get("/auth/me").set("Authorization",`Bearer ${session.token}`).then(response=>response.status)));
    expect(statuses.filter(status=>status===200)).toHaveLength(1);expect(await Session.countDocuments({userId:user._id})).toBe(1);
  });
  it("changes only the authenticated account password and revokes every old session",async()=>{
    const user=await createUser({name:"Isolated security buyer",phone:"+919100001001",password});
    const first=await login({phone:user.phone,password},config,"security-password"),second=await login({phone:user.phone,password},config,"security-password");
    const header=`Bearer ${second.token}`,nextPassword="New-isolated-password-2026";
    expect((await api.post("/auth/password").send({currentPassword:password,newPassword:nextPassword})).status).toBe(401);
    expect((await api.post("/auth/password").set("Authorization",header).send({currentPassword:password,newPassword:nextPassword,userId:buyer.id})).status).toBe(400);
    expect((await api.post("/auth/password").set("Authorization",header).send({currentPassword:"Incorrect-password-2026",newPassword:nextPassword})).status).toBe(403);
    expect((await api.get("/auth/me").set("Authorization",header)).status).toBe(200);
    const changed=await api.post("/auth/password").set("Authorization",header).send({currentPassword:password,newPassword:nextPassword});expect(changed.status).toBe(204);expect(changed.headers["cache-control"]).toBe("private, no-store");
    for(const token of [first.token,second.token])expect((await api.get("/auth/me").set("Authorization",`Bearer ${token}`)).status).toBe(401);
    await expect(login({phone:user.phone,password},config,"security-password")).rejects.toMatchObject({code:"INVALID_CREDENTIALS"});
    const fresh=await login({phone:user.phone,password:nextPassword},config,"security-password");expect((await api.get("/auth/me").set("Authorization",`Bearer ${fresh.token}`)).status).toBe(200);
    expect((await api.get("/auth/me").set("Authorization",auth(buyer))).status).toBe(200);
  });
  it("signs out all roles everywhere with password confirmation and invalidates retained old-version tokens",async()=>{
    for(const [index,role] of (["seller","delivery","admin"] as const).entries()){
      const user=await createUser({name:`Isolated ${role} security`,phone:`+91910000101${index}`,password},role);
      const first=await login({phone:user.phone,password},config,"security-logout"),second=await login({phone:user.phone,password},config,"security-logout");
      const stored=await Session.findOne({_id:tokenHash(second.token,config)}).lean();
      expect((await api.post("/auth/logout-all").set("Authorization",`Bearer ${second.token}`).send({currentPassword:password})).status).toBe(204);
      expect((await api.get("/auth/me").set("Authorization",`Bearer ${first.token}`)).status).toBe(401);
      expect(await Session.countDocuments({userId:user._id})).toBe(0);
      await Session.create(stored!); // Even an old token record left by external cleanup cannot bypass authVersion.
      expect((await api.get("/auth/me").set("Authorization",`Bearer ${second.token}`)).status).toBe(401);
      const fresh=await login({phone:user.phone,password},config,"security-logout");expect((await api.get("/auth/me").set("Authorization",`Bearer ${fresh.token}`)).body.role).toBe(role);
    }
  });
  it("rejects same/short passwords and limits repeated current-password guesses",async()=>{
    const user=await createUser({name:"Isolated password attempts",phone:"+919100001099",password});const session=await login({phone:user.phone,password},config,"security-throttle"),header=`Bearer ${session.token}`;
    expect((await api.post("/auth/password").set("Authorization",header).send({currentPassword:password,newPassword:"short"})).status).toBe(400);
    expect((await api.post("/auth/password").set("Authorization",header).send({currentPassword:password,newPassword:password})).status).toBe(400);
    for(let n=0;n<4;n++)expect((await api.post("/auth/logout-all").set("Authorization",header).send({currentPassword:"Incorrect-current-password"})).status).toBe(403);
    expect((await api.post("/auth/logout-all").set("Authorization",header).send({currentPassword:password})).status).toBe(429);
    expect((await api.get("/auth/me").set("Authorization",header)).status).toBe(200);
  });
  it("does not leave a usable old-password session when login races a password change",async()=>{
    const user=await createUser({name:"Isolated credential race",phone:"+919100001098",password});const original=await login({phone:user.phone,password},config,"security-race");
    const [changed,racing]=await Promise.all([api.post("/auth/password").set("Authorization",`Bearer ${original.token}`).send({currentPassword:password,newPassword:"Isolated-race-new-password"}),login({phone:user.phone,password},config,"security-race").then(value=>value,()=>null)]);
    expect([204,401,409]).toContain(changed.status);
    if(changed.status===204){if(racing)expect((await api.get("/auth/me").set("Authorization",`Bearer ${racing.token}`)).status).toBe(401);}
    else{expect(racing).not.toBeNull();expect((await api.get("/auth/me").set("Authorization",`Bearer ${racing!.token}`)).status).toBe(200);}
    expect((await api.get("/auth/me").set("Authorization",`Bearer ${original.token}`)).status).toBe(401);
  });
  it("exposes safe health and CORS headers without fingerprinting", async () => {
    const r = await api.get("/health").set("Origin", "http://localhost:8081");
    expect(r.status).toBe(200);
    expect(r.headers["x-powered-by"]).toBeUndefined();
    expect(r.headers["x-request-id"]).toBeTruthy();
    expect((await api.get("/health/ready")).status).toBe(200);
  });
  it("rejects missing secrets safely", () => {
    expect(() => loadConfig({})).toThrow("Invalid configuration fields");
    expect(() => loadConfig({ SESSION_PEPPER: "private value" })).not.toThrow(
      "private value",
    );
  });
  it("rejects forged roles at registration and never fakes OTP", async () => {
    expect(
      (
        await api.post("/auth/register").send({
          name: "TEST",
          phone: "+919999999999",
          password,
          role: "admin",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api
          .post("/auth/verify-otp")
          .send({ phone: "+919999999999", otp: "123456" })
      ).status,
    ).toBe(503);
  });
  it("hashes passwords and tokens, logs out, reloads active state from DB", async () => {
    const r = await api
      .post("/auth/register")
      .send({ name: "TEST BUYER", phone: "+919999999998", password });
    expect(r.status).toBe(201);
    expect(r.body.role).toBe("buyer");
    expect(r.body.isDemo).toBe(false);
    expect(r.body).not.toHaveProperty("passwordHash");
    const stored = await User.findById(r.body.userId).select("+passwordHash");
    expect(stored!.passwordHash).not.toBe(password);
    expect(
      (await api.get("/auth/me").set("Authorization", `Bearer ${r.body.token}`))
        .status,
    ).toBe(200);
    expect(
      (
        await api
          .post("/auth/logout")
          .set("Authorization", `Bearer ${r.body.token}`)
      ).status,
    ).toBe(204);
    expect(
      (await api.get("/auth/me").set("Authorization", `Bearer ${r.body.token}`))
        .status,
    ).toBe(401);
    const session = await login(
      { phone: "+919999999998", password },
      config,
      "test",
    );
    await User.updateOne({ _id: r.body.userId }, { $set: { active: false } });
    expect(
      (
        await api
          .get("/auth/me")
          .set("Authorization", `Bearer ${session.token}`)
      ).status,
    ).toBe(401);
  });
  it("returns generic errors and rejects invalid JSON and NoSQL operator input", async () => {
    expect(
      (await api.post("/auth/login").send({ phone: { $ne: null }, password }))
        .status,
    ).toBe(400);
    const r = await api
      .post("/auth/login")
      .send({ phone: "+919999999997", password });
    expect(r.status).toBe(401);
    expect(r.body.message).toBe("Invalid phone or password");
    expect(
      (
        await api
          .post("/auth/login")
          .set("Content-Type", "application/json")
          .send("{")
      ).status,
    ).toBe(400);
  });
});
describe("role and ownership boundaries", () => {
  it("only admin manages taxonomy; buyers and delivery cannot write seller listings", async () => {
    expect(
      (
        await api
          .post("/admin/categories")
          .send({ slug: "new-category", name: "TEST" })
      ).status,
    ).toBe(401);
    for (const actor of [buyer, delivery, seller])
      expect(
        (
          await api
            .post("/admin/categories")
            .set("Authorization", auth(actor))
            .send({ slug: "new-category", name: "TEST" })
        ).status,
      ).toBe(403);
    for (const actor of [buyer, delivery])
      expect(
        (await api.get("/seller/products").set("Authorization", auth(actor)))
          .status,
      ).toBe(403);
  });
  it("hides another seller product and rejects ownership injection", async () => {
    expect(
      (
        await api
          .get(`/seller/products/${otherProductId}`)
          .set("Authorization", auth(seller))
      ).status,
    ).toBe(404);
    const p = await Product.findById(productId);
    expect(
      (
        await api
          .patch(`/seller/products/${productId}`)
          .set("Authorization", auth(seller))
          .send({ version: p!.version, shopId: otherShopId, price: 1 })
      ).status,
    ).toBe(400);
    expect(
      (
        await api
          .patch(`/seller/products/${otherProductId}`)
          .set("Authorization", auth(seller))
          .send({ version: 0, price: 1 })
      ).status,
    ).toBe(404);
  });
  it("never exposes private owner, auth or moderation fields publicly", async () => {
    const shop = await api.get("/shops/test-shop-one");
    expect(shop.status).toBe(200);
    for (const key of [
      "ownerId",
      "passwordHash",
      "revision",
      "status",
      "active",
    ])
      expect(shop.body).not.toHaveProperty(key);
    const product = await api.get(`/products/${productId}`);
    expect(product.body).not.toHaveProperty("_id");
    expect(product.body.shopId).toBe(shopId);
  });
});
describe("product/variant CRUD and validation", () => {
  it("validates prices, stock and taxonomy assignment", async () => {
    for (const patch of [{ price: -1 }, { stock: 1.5 }, { price: 1.001 }])
      expect(
        (
          await api
            .patch(`/seller/products/${productId}`)
            .set("Authorization", auth(seller))
            .send({ version: 0, ...patch })
        ).status,
      ).toBe(400);
    expect(
      (
        await api
          .post("/seller/products")
          .set("Authorization", auth(seller))
          .send({
            name: "TEST wrong category",
            unit: "each",
            categoryId: randomUUID(),
            price: 1,
            stock: 1,
          })
      ).status,
    ).toBe(400);
  });
  it("rejects variant IDs belonging to another product in public and seller routes", async () => {
    const other = await Product.findById(otherProductId);
    const v = other!.variants[0]._id;
    expect((await api.get(`/products/${productId}/variants/${v}`)).status).toBe(
      404,
    );
    const p = await Product.findById(productId);
    expect(
      (
        await api
          .patch(`/seller/products/${productId}/variants/${v}`)
          .set("Authorization", auth(seller))
          .send({ version: p!.version, stock: 9 })
      ).status,
    ).toBe(404);
  });
  it("supports server-generated variants, versioned updates, deletion and per-option inventory", async () => {
    let p = (
      await api
        .get(`/seller/products/${productId}`)
        .set("Authorization", auth(seller))
    ).body;
    const created = await api
      .post(`/seller/products/${productId}/variants`)
      .set("Authorization", auth(seller))
      .send({ version: p.version, label: "Test option", price: 30, stock: 7 });
    expect(created.status).toBe(201);
    expect(created.body.id).toMatch(/^[0-9a-f-]{36}$/);
    const update = await api
      .patch(`/seller/products/${productId}/variants/${created.body.id}`)
      .set("Authorization", auth(seller))
      .send({ version: created.body.version, price: 35, stock: 4 });
    expect(update.status).toBe(200);
    expect(update.body.stock).toBe(4);
    expect(
      (
        await api
          .patch(`/seller/products/${productId}/inventory`)
          .set("Authorization", auth(seller))
          .send({ version: update.body.version, stock: 20 })
      ).status,
    ).toBe(409);
    expect(
      (
        await api
          .delete(`/seller/products/${productId}/variants/${created.body.id}`)
          .set("Authorization", auth(seller))
          .send({ version: update.body.version })
      ).status,
    ).toBe(204);
    p = (
      await api
        .get(`/seller/products/${productId}`)
        .set("Authorization", auth(seller))
    ).body;
    expect(
      p.variants.some((v: { id: string }) => v.id === created.body.id),
    ).toBe(false);
  });
  it("prevents concurrent stale updates from overwriting newer stock", async () => {
    const p = await Product.findById(productId);
    const v = p!.variants[0]._id;
    const requests = [8, 9].map((stock) =>
      api
        .patch(`/seller/products/${productId}/variants/${v}`)
        .set("Authorization", auth(seller))
        .send({ version: p!.version, stock }),
    );
    const results = await Promise.all(requests);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});
describe("visibility, search and pagination", () => {
  it("applies area/category/shop/stock filters before pagination", async () => {
    const result = await api.get(
      `/products?area=${areaId}&category=test-grocery&inStockOnly=true&sort=price_asc&limit=1`,
    );
    expect(result.status).toBe(200);
    expect(result.body).toHaveLength(1);
    expect(result.body[0].id).toBe(productId);
    expect(result.headers["x-total-count"]).toBe("2");
    const next = await api.get(
      `/products?area=${areaId}&category=test-grocery&inStockOnly=true&sort=price_asc&limit=1&cursor=${result.headers["x-next-cursor"]}`,
    );
    expect(next.body[0].id).toBe(otherProductId);
    expect(next.headers["x-has-more"]).toBe("false");
    expect((await api.get(`/products?area=${otherAreaId}`)).body).toEqual([]);
    expect(
      (await api.get(`/products?shop=${otherShopId}`)).body.map(
        (p: { id: string }) => p.id,
      ),
    ).toEqual([otherProductId]);
  });
  it("binds cursor to filters and rejects tampering/injection", async () => {
    const first = await api.get("/products?sort=name&limit=1");
    const cursor = first.headers["x-next-cursor"];
    expect(
      (await api.get(`/products?sort=price_desc&limit=1&cursor=${cursor}`))
        .status,
    ).toBe(400);
    expect(
      (await api.get(`/products?sort=name&limit=1&cursor=${cursor}x`)).status,
    ).toBe(400);
    expect((await api.get("/products?q=TEST%20Apples")).body).toHaveLength(2);
    expect((await api.get("/products?q=%28a%2B%29%2B")).body).toEqual([]);
    expect((await api.get("/products?shop[$ne]=x")).status).toBe(400);
  });
  it("excludes inactive products and unapproved shops, including direct links", async () => {
    await Product.updateOne(
      { _id: otherProductId },
      { $set: { active: false } },
    );
    expect((await api.get(`/products/${otherProductId}`)).status).toBe(404);
    await Product.updateOne(
      { _id: otherProductId },
      { $set: { active: true } },
    );
    await Shop.updateOne({ _id: otherShopId }, { $set: { status: "pending" } });
    expect((await api.get("/shops/test-shop-two")).status).toBe(404);
    expect((await api.get(`/products/${otherProductId}`)).status).toBe(404);
    expect((await api.get(`/products?shop=${otherShopId}`)).body).toEqual([]);
    await Shop.updateOne(
      { _id: otherShopId },
      { $set: { status: "approved" } },
    );
  });
  it("calculates open filters and fee sorting server-side", async () => {
    const result = await api.get(`/shops?area=${areaId}&sort=fee_asc&limit=1`);
    expect(result.status).toBe(200);
    expect(result.body).toHaveLength(1);
    const open = await api.get(`/shops?area=${areaId}&openOnly=true`);
    expect(open.status).toBe(200);
    expect(open.body.every((s: { isOpen: boolean }) => s.isOpen)).toBe(true);
  });
  it("handles overnight hours without parsing the free-text label", async () => {
    const shop = (await Shop.findById(shopId).lean())!;
    shop.openingHours = [{ day: 1, opens: "22:00", closes: "02:00" }];
    shop.timezone = "Asia/Kolkata";
    expect(isOpen(shop, new Date("2026-10-27T19:30:00+05:30"))).toBe(false);
    expect(isOpen(shop, new Date("2026-10-27T01:30:00+05:30"))).toBe(true);
  });
});
describe("additional security and lifecycle boundaries", () => {
  it("PATCH preserves omitted metadata/defaults rather than reactivating records", async () => {
    expect(categoryPatch.parse({ version: 1, name: "TEST" })).toEqual({
      version: 1,
      name: "TEST",
    });
    expect(shopPatch.parse({ version: 1, name: "TEST" })).toEqual({
      version: 1,
      name: "TEST",
    });
    expect(productPatch.parse({ version: 1, price: 5 })).toEqual({
      version: 1,
      price: 5,
    });
    expect(variantPatch.parse({ version: 1, stock: 2 })).toEqual({
      version: 1,
      stock: 2,
    });
    const created = await createProduct(
      seller,
      productCreate.parse({
        name: "TEST lifecycle",
        unit: "each",
        categoryId,
        price: 9,
        stock: 2,
        description: "Keep this description",
        active: false,
        attributes: [{ label: "Test", value: "Value" }],
      }),
    );
    const patched = await api
      .patch(`/seller/products/${created._id}`)
      .set("Authorization", auth(seller))
      .send({ version: created.version, price: 10 });
    expect(patched.status).toBe(200);
    expect(patched.body.active).toBe(false);
    expect(patched.body.description).toBe("Keep this description");
    expect(patched.body.attributes).toHaveLength(1);
    expect((await api.get(`/products/${created._id}`)).status).toBe(404);
    const restored = await api
      .patch(`/admin/shops/${shopId}/products/${created._id}`)
      .set("Authorization", auth(admin))
      .send({ version: patched.body.version, active: true });
    expect(restored.status).toBe(200);
    expect(
      (
        await api
          .delete(`/seller/products/${created._id}`)
          .set("Authorization", auth(seller))
          .send({ version: restored.body.version })
      ).status,
    ).toBe(204);
  });
  it("applies live role and expiry checks instead of trusting stored client roles", async () => {
    await User.updateOne({ _id: buyer.id }, { $set: { role: "seller" } });
    expect(
      (await api.get("/seller/shop").set("Authorization", auth(buyer))).status,
    ).toBe(404);
    await User.updateOne({ _id: buyer.id }, { $set: { role: "buyer" } });
    const token = "a".repeat(43);
    await Session.create({
      _id: tokenHash(token, config),
      userId: buyer.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(
      (await api.get("/auth/me").set("Authorization", `Bearer ${token}`))
        .status,
    ).toBe(401);
  });
  it("enforces persisted throttles and rejects non-allowlisted origins", async () => {
    await throttle("TEST THROTTLE", config, 2);
    await throttle("TEST THROTTLE", config, 2);
    await expect(throttle("TEST THROTTLE", config, 2)).rejects.toMatchObject({
      status: 429,
    });
    const denied = await api
      .get("/health")
      .set("Origin", "https://untrusted.example");
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("ORIGIN_DENIED");
  });
  it("paginates private products without leaking another owner and validates required indexes", async () => {
    const page = await api
      .get("/seller/products?limit=1")
      .set("Authorization", auth(seller));
    expect(page.status).toBe(200);
    expect(page.body[0].shopId).toBe(shopId);
    expect(page.body[0].categorySlug).toBe("test-grocery");
    if (page.headers["x-next-cursor"])
      expect(
        (
          await api
            .get(
              `/seller/products?limit=1&cursor=${page.headers["x-next-cursor"]}`,
            )
            .set("Authorization", auth(otherSeller))
        ).status,
      ).toBe(400);
    await verifyCriticalIndexes();
  });
  it("profile changes revoke approval until reviewed, without resetting unrelated fields", async () => {
    const current = await Shop.findById(otherShopId);
    const updated = await api
      .patch("/seller/shop")
      .set("Authorization", auth(otherSeller))
      .send({ version: current!.version, name: "TEST profile update" });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe("pending");
    expect(updated.body.deliveryFee).toBe(25);
    expect(updated.body.openingHours).toHaveLength(1);
    expect((await api.get("/shops/test-shop-two")).status).toBe(404);
    expect(
      (
        await api
          .patch(`/admin/shops/${otherShopId}/approval`)
          .set("Authorization", auth(admin))
          .send({ version: updated.body.version, status: "approved" })
      ).status,
    ).toBe(200);
  });
  it("serializes category removal against new shop references", async () => {
    const category = await Category.create({
      slug: "test-race",
      name: "TEST RACE",
    });
    const user = await createUser(
      { name: "TEST RACE SELLER", phone: "+919999999996", password },
      "seller",
    );
    const session = await login(
      { phone: user.phone, password },
      config,
      "test",
    );
    const [created, removed] = await Promise.all([
      api
        .post("/seller/shop")
        .set("Authorization", `Bearer ${session.token}`)
        .send({
          slug: "test-race-shop",
          name: "TEST RACE SHOP",
          locality: "TEST MARKET",
          categoryIds: [category._id],
          serviceAreaIds: [areaId],
          fulfilment: ["pickup"],
          since: 2026,
          initials: "TR",
        }),
      api
        .delete(`/admin/categories/${category._id}`)
        .set("Authorization", auth(admin))
        .send({ version: category.version }),
    ]);
    expect([
      [201, 409],
      [400, 204],
    ]).toContainEqual([created.status, removed.status]);
    if (created.status === 201)
      expect((await Category.findById(category._id))!.active).toBe(true);
    else expect(await Shop.exists({ ownerId: user._id })).toBeNull();
  });
});

describe("taxonomy reference safety", () => {
  it("blocks category/area deletion or deactivation while references exist", async () => {
    const category = await Category.findById(categoryId);
    expect(
      (
        await api
          .delete(`/admin/categories/${categoryId}`)
          .set("Authorization", auth(admin))
          .send({ version: category!.version })
      ).status,
    ).toBe(409);
    const area = await Area.findById(areaId);
    expect(
      (
        await api
          .patch(`/admin/areas/${areaId}`)
          .set("Authorization", auth(admin))
          .send({ version: area!.version, active: false })
      ).status,
    ).toBe(409);
  });
  it("creates subcategories with stable IDs and rejects unrelated relationships", async () => {
    const c = await api
      .post("/admin/categories")
      .set("Authorization", auth(admin))
      .send({ slug: "test-unassigned", name: "TEST UNASSIGNED" });
    expect(c.status).toBe(201);
    const sub = await api
      .post(`/admin/categories/${c.body.id}/subcategories`)
      .set("Authorization", auth(admin))
      .send({ slug: "test-sub", name: "TEST SUB", version: 0 });
    expect(sub.status).toBe(201);
    expect(sub.body.subcategories[0].categoryId).toBe(c.body.id);
    expect(
      (
        await api
          .post("/seller/products")
          .set("Authorization", auth(seller))
          .send({
            name: "TEST invalid sub",
            unit: "item",
            categoryId,
            subcategoryId: sub.body.subcategories[0].id,
            price: 1,
            stock: 1,
          })
      ).status,
    ).toBe(400);
    expect(
      (
        await api
          .delete(`/admin/categories/${c.body.id}`)
          .set("Authorization", auth(admin))
          .send({ version: sub.body.version })
      ).status,
    ).toBe(204);
    expect(
      (await api.get("/categories")).body.some(
        (cat: { id: string }) => cat.id === c.body.id,
      ),
    ).toBe(false);
  });
});

describe("order support isolation and resolution",()=>{
 it("derives owned shop context, deduplicates reports and restricts resolution",async()=>{
  const orderId=randomUUID(),subId=randomUUID();
  await Order.create({_id:orderId,buyerId:buyer.id,fingerprint:"support-test",reservationId:randomUUID(),createdAt:new Date(),addressId:randomUUID(),address:{label:"TEST",line1:"TEST",locality:"TEST",city:"TEST",pincode:"999999"},paymentMethod:"cod",paymentStatus:"unpaid",totalCents:100,subOrders:[{_id:subId,shopId,shopName:"TEST SHOP",status:"delivered",fulfilment:"pickup",lines:[],deliveryFeeCents:0,itemsSubtotalCents:100}]});
  const body={orderId,suborderId:subId,kind:"quality",description:"TEST damaged package issue"};
  expect((await api.post("/support").send(body)).status).toBe(401);
  expect((await api.post("/support").set("Authorization",auth(seller)).send(body)).status).toBe(403);
  expect((await api.post("/support").set("Authorization",auth(buyer)).send({...body,suborderId:randomUUID()})).status).toBe(404);
  expect((await api.post("/support").set("Authorization",auth(buyer)).send({...body,shopId:otherShopId})).status).toBe(400);
  expect((await api.post("/support").set("Authorization",auth(buyer)).send({...body,description:"bad"})).status).toBe(400);
  const made=await api.post("/support").set("Authorization",auth(buyer)).send(body);expect(made.status).toBe(200);expect(made.body.shopName).toBe("TEST SHOP");expect(made.body.buyerId).toBeUndefined();
  expect((await api.post("/support").set("Authorization",auth(buyer)).send(body)).body.id).toBe(made.body.id);
  expect(await SupportTicket.countDocuments({_id:subId})).toBe(1);
  const outsider=await createUser({name:"TEST support outsider",phone:"+919999990099",password},"buyer");const outsiderLogin=await login({phone:outsider.phone,password},config,"support-test");
  expect((await api.get(`/support?orderId=${orderId}`).set("Authorization",`Bearer ${outsiderLogin.token}`)).body.items).toEqual([]);
  expect((await api.post("/support").set("Authorization",`Bearer ${outsiderLogin.token}`).send(body)).status).toBe(404);
  expect((await api.patch(`/support/${subId}`).set("Authorization",auth(buyer)).send({version:0,status:"resolved",note:"TEST resolution"})).status).toBe(403);
  expect((await api.patch(`/support/${subId}`).set("Authorization",auth(admin)).send({version:0,status:"resolved",note:""})).status).toBe(400);
  expect((await api.patch(`/support/${subId}`).set("Authorization",auth(admin)).send({version:0,status:"in_progress",note:"TEST reviewing"})).status).toBe(204);
  expect((await api.patch(`/support/${subId}`).set("Authorization",auth(admin)).send({version:0,status:"resolved",note:"TEST stale"})).status).toBe(409);
  expect((await api.patch(`/support/${subId}`).set("Authorization",auth(admin)).send({version:1,status:"resolved",note:"TEST buyer-visible resolution"})).status).toBe(204);
  const resolved=(await api.get(`/support?orderId=${orderId}`).set("Authorization",auth(buyer))).body.items[0];expect(resolved.status).toBe("resolved");expect(resolved.note).toContain("buyer-visible");
  expect((await Order.findById(orderId))!.subOrders[0]!.status).toBe("delivered");
  expect((await api.patch(`/support/${subId}`).set("Authorization",auth(admin)).send({version:2,status:"in_progress",note:"TEST reopen"})).status).toBe(409);
 });
});

describe("support attention overview",()=>{
 it("counts only unresolved tickets, limits oldest samples and excludes sensitive content",async()=>{
  await SupportTicket.deleteMany({});
  const ids=Array.from({length:12},()=>randomUUID());
  await SupportTicket.insertMany(ids.map((id,index)=>({_id:id,buyerId:buyer.id,orderId:randomUUID(),suborderId:id,shopId,shopName:"TEST SUPPORT SHOP",kind:"quality",description:"PRIVATE SUPPORT CONTENT",status:index===11?"resolved":index===10?"in_progress":"open",version:0,note:"PRIVATE ADMIN NOTE",createdAt:new Date(1700000000000+index*1000),updatedAt:new Date()})));
  expect((await api.get("/admin/operations").set("Authorization",auth(seller))).status).toBe(403);
  const result=await api.get("/admin/operations").set("Authorization",auth(admin));expect(result.status).toBe(200);expect(result.body.support.count).toBe(11);expect(result.body.support.items).toHaveLength(10);expect(result.body.support.items[0].id).toBe(ids[0]);expect(result.body.support.items.some((row:{id:string})=>row.id===ids[11])).toBe(false);expect(JSON.stringify(result.body)).not.toContain("PRIVATE SUPPORT CONTENT");expect(JSON.stringify(result.body)).not.toContain("PRIVATE ADMIN NOTE");
  await SupportTicket.deleteMany({});
  expect((await api.get("/admin/operations").set("Authorization",auth(admin))).body.support).toEqual({count:0,items:[]});
 });
});

describe("delivery address pins",()=>{
 it("validates, owns, versions and clears saved pins without accepting verification flags",async()=>{
 const input={label:"TEST PIN",line1:"TEST entrance",locality:"TEST",city:"TEST",pincode:"999999",location:{type:"Point",coordinates:[86,26]}};
 expect((await api.post("/addresses").set("Authorization",auth(buyer)).send({...input,location:{type:"Point",coordinates:[181,26]}})).status).toBe(400);
 expect((await api.post("/addresses").set("Authorization",auth(buyer)).send({...input,verified:true})).status).toBe(400);
 const created=await api.post("/addresses").set("Authorization",auth(buyer)).send(input);expect(created.status).toBe(201);expect(created.body.location).toEqual(input.location);
 expect((await api.patch(`/addresses/${created.body.id}`).set("Authorization",auth(seller)).send({version:0,location:null})).status).toBe(404);
 const edited=await api.patch(`/addresses/${created.body.id}`).set("Authorization",auth(buyer)).send({version:0,location:{type:"Point",coordinates:[86.01,26]}});expect(edited.status).toBe(200);expect(edited.body.version).toBe(1);
 expect((await api.patch(`/addresses/${created.body.id}`).set("Authorization",auth(buyer)).send({version:0,location:null})).status).toBe(409);
 const clear=await api.patch(`/addresses/${created.body.id}`).set("Authorization",auth(buyer)).send({version:1,location:null});expect(clear.status).toBe(200);expect(clear.body.location).toBeUndefined();
 });
 it("checks radius and missing shop pin, preserving pincode-only legacy addresses",()=>{
 expect(pinCoverage(undefined)).toBeNull();expect(pinCoverage({type:"Point",coordinates:[86,26]})).toMatchObject({code:"SHOP_LOCATION_MISSING"});expect(pinCoverage({type:"Point",coordinates:[86,26]},{type:"Point",coordinates:[86,26.02]})).toBeNull();expect(pinCoverage({type:"Point",coordinates:[86,26]},{type:"Point",coordinates:[86,26.06]})).toMatchObject({code:"ADDRESS_OUTSIDE_RADIUS"});
 });
});

describe("delivery pin placement parity",()=>{
 it("blocks outside-pin delivery in review and placement, keeps pickup, and snapshots the confirmed pin",async()=>{
 const original=await Shop.findById(shopId).lean();const originalArea=await Area.findById(areaId).lean();
 const product=await createProduct(seller,productCreate.parse({name:"TEST PIN DELIVERY PRODUCT",unit:"pack",description:"TEST",categoryId,price:25,stock:10}));
 const address=await (await import("../src/addresses/routes.js")).Address.create({userId:buyer.id,label:"TEST PIN",line1:"TEST entrance",locality:"TEST",city:"TEST",pincode:"999999",location:{type:"Point",coordinates:[86,26]}});
 const input={areaId,addressId:address._id,addressVersion:0,paymentMethod:"cod" as const,expectedTotal:35,items:[{productId:product._id,qty:1}],fulfilments:[{shopId,method:"seller_delivery" as const}]};
 try{
 await Area.updateOne({_id:areaId},{$set:{active:true},$addToSet:{pincodes:"999999"}});
 await Shop.updateOne({_id:shopId},{$set:{active:true,status:"approved",temporarilyClosed:false,areaIds:[areaId],categoryIds:[categoryId],fulfilment:["pickup","seller_delivery"],deliveryFeeCents:1000,minimumOrderCents:0,location:{type:"Point",coordinates:[86,26.1]},openingHours:Array.from({length:7},(_,day)=>({day,opens:"00:00",closes:"23:59"}))}});
 const review=await api.post("/cart/fulfilment").set("Authorization",auth(buyer)).send({addressId:address._id,shopIds:[shopId]});expect(review.status).toBe(200);expect(review.body.shops[0].options.find((o:{method:string})=>o.method==="seller_delivery").status).toBe("unavailable");expect(review.body.shops[0].options.find((o:{method:string})=>o.method==="pickup").status).toBe("eligible");
 await expect(createCodOrder(buyer,randomUUID(),input)).rejects.toMatchObject({code:"ADDRESS_UNSERVICEABLE"});expect((await Product.findById(product._id))!.stock).toBe(10);
 await Shop.updateOne({_id:shopId},{$set:{location:{type:"Point",coordinates:[86,26.01]}}});const made=await createCodOrder(buyer,randomUUID(),input);expect(made.order.address.location).toEqual({type:"Point",coordinates:[86,26]});await address.updateOne({$set:{location:{type:"Point",coordinates:[87,27]}}});expect((await Order.findById(made.order._id))!.address.location?.coordinates).toEqual([86,26]);
 }finally{if(originalArea)await Area.updateOne({_id:areaId},{$set:{active:originalArea.active,pincodes:originalArea.pincodes}});if(original){const{_id,...rest}=original;await Shop.replaceOne({_id},rest);}}
 });
});

describe("own account profile",()=>{
 it("limits changes to display name, version-checks and preserves active authentication",async()=>{
 expect((await api.get("/auth/profile")).status).toBe(401);
 const original=await User.findById(buyer.id).lean();
 const profile=await api.get("/auth/profile").set("Authorization",auth(buyer));expect(profile.status).toBe(200);expect(profile.body.phone).toBe(original!.phone);expect(profile.body.passwordHash).toBeUndefined();expect(profile.body.role).toBeUndefined();
 for(const extra of [{role:"admin"},{phone:"+919999990000"},{email:"other@example.test"},{userId:seller.id}])expect((await api.patch("/auth/profile").set("Authorization",auth(buyer)).send({name:"TEST New profile",version:profile.body.version,...extra})).status).toBe(400);
 const saved=await api.patch("/auth/profile").set("Authorization",auth(buyer)).send({name:"TEST Updated name",version:profile.body.version});expect(saved.status).toBe(200);expect(saved.body.version).toBe(profile.body.version+1);expect((await api.get("/auth/me").set("Authorization",auth(buyer))).body.name).toBe("TEST Updated name");
 expect((await api.patch("/auth/profile").set("Authorization",auth(buyer)).send({name:"TEST stale",version:profile.body.version})).status).toBe(409);expect((await User.findById(buyer.id))!.role).toBe("buyer");await User.updateOne({_id:buyer.id},{$set:{name:original!.name}});
 });
});

describe("bounded public shop identity hydration",()=>{
 it("returns only requested eligible public shops and validates the request bound",async()=>{
  const result=await api.get(`/catalogue/shops/by-ids?ids=${shopId}`);expect(result.status).toBe(200);expect(result.body.map((shop:{id:string})=>shop.id)).toEqual([shopId]);expect(result.body[0].ownerId).toBeUndefined();expect(result.body[0].review).toBeUndefined();
  expect((await api.get("/catalogue/shops/by-ids?ids=bad")).status).toBe(400);expect((await api.get(`/catalogue/shops/by-ids?ids=${Array.from({length:25},()=>randomUUID()).join(",")}`)).status).toBe(400);
  const original=await Shop.findById(otherShopId).lean();try{await Shop.updateOne({_id:otherShopId},{$set:{status:"pending"}});expect((await api.get(`/catalogue/shops/by-ids?ids=${otherShopId}`)).body).toEqual([]);}finally{await Shop.updateOne({_id:otherShopId},{$set:{status:original!.status}});}
 });
});


describe("seller daily dashboard",()=>{
 it("requires seller authorization and rejects ownership/query overrides",async()=>{
  expect((await api.get("/seller/dashboard")).status).toBe(401);
  for(const who of [buyer,admin,delivery])expect((await api.get("/seller/dashboard").set("Authorization",auth(who))).status).toBe(403);
  expect((await api.get(`/seller/dashboard?shopId=${otherShopId}`).set("Authorization",auth(seller))).status).toBe(400);
 });
 it("counts owned daily orders, excludes test/unpaid online actions, and counts individual active low-stock variants",async()=>{
  const before=await api.get("/seller/dashboard").set("Authorization",auth(seller));expect(before.status).toBe(200);
  const ids=Array.from({length:5},()=>randomUUID()),lowId=randomUUID();
  const make=(id:string,owner:string,extra:Record<string,unknown>={})=>({_id:id,buyerId:randomUUID(),fingerprint:"isolated-dashboard",reservationId:randomUUID(),createdAt:new Date(),addressId:randomUUID(),address:{label:"TEST",line1:"PRIVATE CUSTOMER ADDRESS",locality:"TEST",city:"TEST",pincode:"999999"},paymentMethod:"cod",paymentStatus:"unpaid",testMode:false,totalCents:100,subOrders:[{_id:randomUUID(),shopId:owner,shopName:"TEST SHOP",shopAddress:"TEST SHOP ADDRESS",status:"placed",version:0,fulfilment:"pickup",lines:[{productId,qty:1,name:"TEST ITEM",unit:"piece",priceCents:100}],itemsSubtotalCents:100,deliveryFeeCents:0}],...extra});
  const source=await Product.findById(productId).lean();
  try{
   await Order.insertMany([make(ids[0],shopId),make(ids[1],shopId,{createdAt:new Date(Date.now()-48*60*60*1000)}),make(ids[2],shopId,{testMode:true}),make(ids[3],shopId,{paymentMethod:"razorpay"}),make(ids[4],otherShopId)]);
   await Product.collection.insertOne({...source!,_id:lowId,shopId,active:true,stock:999,variants:[{_id:randomUUID(),label:"low",stock:3,priceCents:100,active:true},{_id:randomUUID(),label:"out",stock:0,priceCents:100,active:true},{_id:randomUUID(),label:"inactive",stock:0,priceCents:100,active:false}]} as never);
   const result=await api.get("/seller/dashboard").set("Authorization",auth(seller));expect(result.status).toBe(200);expect(result.headers["cache-control"]).toBe("private, no-store");
   expect(result.body.todayOrders).toBe(before.body.todayOrders+1);expect(result.body.pendingPayment).toBe(before.body.pendingPayment+1);expect(result.body.counts.placed).toBe((before.body.counts.placed??0)+2);
   expect(result.body.lowStock.count).toBe(before.body.lowStock.count+2);expect(result.body.lowStock.outOfStock).toBe(before.body.lowStock.outOfStock+1);
   expect(result.body.urgent.length).toBeLessThanOrEqual(5);expect(result.body.lowStock.items.length).toBeLessThanOrEqual(10);
   for(const sub of result.body.urgent){expect(sub.shopId).toBe(shopId);expect(sub.testMode).toBe(false);expect(sub.orderId).not.toBe(ids[3]);if(sub.fulfilment==="pickup")expect(sub.deliveryAddress).toBeUndefined();}
   expect(JSON.stringify(result.body)).not.toContain("PRIVATE CUSTOMER ADDRESS");expect(result.body.timezone).toBeTruthy();
  }finally{await Order.deleteMany({_id:{$in:ids}});await Product.deleteOne({_id:lowId});}
 });
});


describe("live platform delivery",()=>{
 const liveApi=request(createApp({...config,ORDERS_COD_ENABLED:true,PLATFORM_DELIVERY_ENABLED:true}));
 it("guards private workspace, approval writes and default-off dispatch",async()=>{
  expect((await api.get("/delivery/active")).status).toBe(401);
  expect((await api.get("/delivery/active").set("Authorization",auth(buyer))).status).toBe(403);
  expect((await api.put(`/admin/delivery/partners/${delivery.id}`).set("Authorization",auth(delivery)).send({version:0,approved:true,areaIds:[areaId]})).status).toBe(403);
  expect((await api.post(`/delivery/tasks/${randomUUID()}/claim`).set("Authorization",auth(delivery)).send({version:0})).body.code).toBe("DELIVERY_DISABLED");
 });
 it("requires rollout, fresh capacity and pins at checkout and snapshots the listed fee",async()=>{
  const {Address}=await import("../src/addresses/routes.js");
  const shop=await Shop.findById(shopId).lean(),product=await Product.findById(productId).lean(),area=await Area.findById(areaId).lean(),address=await Address.create({userId:buyer.id,label:"TEST PLATFORM",line1:"TEST DROP",locality:"TEST",city:"TEST",pincode:area!.pincodes[0],location:{type:"Point",coordinates:[86,26]}});
  let created:string|undefined;
  try{
   await Shop.updateOne({_id:shopId},{$set:{status:"approved",active:true,areaIds:[areaId],categoryIds:[categoryId],fulfilment:["platform_delivery"],minimumOrderCents:0,deliveryFeeCents:200,location:{type:"Point",coordinates:[86,26]},temporarilyClosed:false,openingHours:Array.from({length:7},(_,day)=>({day,opens:"00:00",closes:"23:59"}))}});
   await Product.updateOne({_id:productId},{$set:{active:true,categoryId,subcategoryId:undefined,variants:[],stock:5,totalStock:5,priceCents:1000,sortPriceCents:1000}});
   await Partner.deleteOne({_id:delivery.id});await Partner.create({_id:delivery.id,approved:true,areaIds:[areaId],online:true,seenAt:new Date(),version:0});
   const input={areaId,addressId:address._id,addressVersion:address.version,paymentMethod:"cod" as const,expectedTotal:12,items:[{productId,qty:1}],fulfilments:[{shopId,method:"platform_delivery" as const}]};
   await expect(createCodOrder(buyer,randomUUID(),input)).rejects.toMatchObject({code:"METHOD_UNAVAILABLE"});
   const quote=await liveApi.post("/checkout/review").set("Authorization",auth(buyer)).send({areaId,addressId:address._id,addressVersion:address.version,items:input.items,fulfilments:input.fulfilments});expect(quote.status).toBe(200);expect(quote.body.issues).toEqual([]);expect(quote.body.shops.flatMap((s:{issues:unknown[]})=>s.issues)).toEqual([]);expect(quote.body.fulfilments.flatMap((s:{issues:unknown[]})=>s.issues)).toEqual([]);expect(quote.body.checkoutAvailable).toBe(true);expect(quote.body.grandTotal).toBe(12);
   await Partner.updateOne({_id:delivery.id},{$set:{seenAt:new Date(0)}});await expect(createCodOrder(buyer,randomUUID(),input,"cod",false,true)).rejects.toMatchObject({code:"METHOD_UNAVAILABLE"});
   await Partner.updateOne({_id:delivery.id},{$set:{seenAt:new Date()}});
   const placed=await createCodOrder(buyer,randomUUID(),input,"cod",false,true);created=placed.order._id;expect(placed.order.subOrders[0].fulfilment).toBe("platform_delivery");expect(placed.order.subOrders[0].deliveryFeeCents).toBe(200);expect(placed.order.totalCents).toBe(1200);
  }finally{
   if(created){const order=await Order.findById(created);await InventoryReservation.deleteOne({_id:order!.reservationId});await Order.deleteOne({_id:created});}
   await Address.deleteOne({_id:address._id});await Partner.deleteOne({_id:delivery.id});
   if(shop)await Shop.replaceOne({_id:shopId},shop);if(product)await Product.replaceOne({_id:productId},product);
  }
 });
 it("exclusively claims, enforces pickup and exact COD proof, and records cash once",async()=>{
  const secondUser=await createUser({name:"TEST SECOND DELIVERY",phone:"+919887001111",password},"delivery"),second:Actor={id:secondUser._id,role:"delivery"};
  const secondSession=await login({phone:secondUser.phone,password},config,"delivery-test");tokens[second.id]=secondSession.token;
  const orderId=randomUUID(),subId=randomUUID(),holdId=randomUUID(),extraOrder=randomUUID(),extraSub=randomUUID();
  const original=await Shop.findById(shopId).lean();
  try{
   await Shop.updateOne({_id:shopId},{$set:{status:"approved",active:true,areaIds:[areaId]}});
   await Partner.deleteMany({_id:{$in:[delivery.id,second.id]}});
   for(const who of [delivery,second]){
    expect((await liveApi.put(`/admin/delivery/partners/${who.id}`).set("Authorization",auth(admin)).send({version:0,approved:true,areaIds:[areaId]})).status).toBe(200);
    expect((await liveApi.put("/delivery/availability").set("Authorization",auth(who)).send({online:true})).status).toBe(200);
   }
   await Order.create({_id:orderId,buyerId:buyer.id,fingerprint:"TEST DELIVERY",reservationId:holdId,createdAt:new Date(),addressId:randomUUID(),address:{label:"TEST",line1:"PRIVATE DELIVERY DROP",locality:"TEST",city:"TEST",pincode:"999999",location:{type:"Point",coordinates:[86,26]}},paymentMethod:"cod",paymentStatus:"unpaid",totalCents:1200,subOrders:[{_id:subId,shopId,shopName:"TEST SHOP",shopAddress:"TEST PICKUP",status:"ready",version:0,fulfilment:"platform_delivery",itemsSubtotalCents:1000,deliveryFeeCents:200,lines:[{productId,name:"TEST ITEM",unit:"bag",priceCents:1000,qty:1}]}]});
   await InventoryReservation.create({_id:holdId,buyerId:buyer.id,orderId,state:"committed",fingerprint:"TEST",createdAt:new Date(),expiresAt:new Date(Date.now()+100000),lines:[{productId,shopId,qty:1,priceCents:1000}]});
   const available=await liveApi.get("/delivery/available").set("Authorization",auth(delivery));expect(available.status).toBe(200);expect(available.body.items.some((t:{id:string})=>t.id===subId)).toBe(true);expect(JSON.stringify(available.body)).not.toContain("PRIVATE DELIVERY DROP");expect(JSON.stringify(available.body)).not.toContain("TEST PICKUP");
   const claims=await Promise.all([delivery,second].map(who=>liveApi.post(`/delivery/tasks/${subId}/claim`).set("Authorization",auth(who)).send({version:0})));
   expect(claims.map(r=>r.status).sort()).toEqual([200,409]);const winner=claims[0].status===200?delivery:second,loser=winner===delivery?second:delivery;
   expect((await liveApi.post(`/delivery/tasks/${subId}/claim`).set("Authorization",auth(winner)).send({version:0})).status).toBe(200);
   const copy=await Order.findById(orderId).lean();await Order.create({...copy!,_id:extraOrder,reservationId:randomUUID(),subOrders:[{...copy!.subOrders[0],_id:extraSub,delivery:undefined,version:0}]});
   expect((await liveApi.post(`/delivery/tasks/${extraSub}/claim`).set("Authorization",auth(winner)).send({version:0})).body.code).toBe("ACTIVE_TASK");
   expect((await liveApi.get(`/delivery/tasks/${subId}/contact`).set("Authorization",auth(loser))).status).toBe(404);
   expect((await liveApi.post(`/delivery/tasks/${subId}/dispatch`).set("Authorization",auth(winner)).send({version:1})).status).toBe(409);
   expect((await liveApi.post(`/seller/orders/${orderId}/suborders/${subId}/pickup`).set("Authorization",auth(otherSeller)).send({version:1,partnerId:winner.id,confirmHandoff:true})).status).toBe(404);
   expect((await liveApi.post(`/seller/orders/${orderId}/suborders/${subId}/pickup`).set("Authorization",auth(seller)).send({version:1,partnerId:winner.id,confirmHandoff:true})).status).toBe(200);
   expect((await liveApi.post(`/delivery/tasks/${subId}/dispatch`).set("Authorization",auth(winner)).send({version:2})).status).toBe(200);
   const proof=await issueReceiptCode(buyer,orderId,subId,{version:3,confirmReceived:true,confirmCashPaid:true},config);
   const command={version:3,code:proof.code,confirmCashReceived:true,amountReceived:12};
   expect((await liveApi.post(`/delivery/tasks/${subId}/complete`).set("Authorization",auth(winner)).send({...command,amountReceived:1})).body.code).toBe("CASH_AMOUNT_MISMATCH");
   const wrong=proof.code==="111111"?"222222":"111111";
   expect((await liveApi.post(`/delivery/tasks/${subId}/complete`).set("Authorization",auth(winner)).send({...command,code:wrong})).status).toBe(400);
   expect((await Order.findById(orderId))!.subOrders[0].receipt!.attempts).toBe(1);
   expect((await liveApi.post(`/seller/orders/${orderId}/suborders/${subId}/complete-cash`).set("Authorization",auth(seller)).send(command)).status).toBe(404);
   expect((await liveApi.post(`/delivery/tasks/${subId}/complete`).set("Authorization",auth(winner)).send(command)).status).toBe(200);
   expect((await liveApi.post(`/delivery/tasks/${subId}/complete`).set("Authorization",auth(winner)).send(command)).status).toBe(200);
   const saved=await Order.findById(orderId);expect(saved!.subOrders[0].status).toBe("delivered");expect(saved!.subOrders[0].cashCollection!.reportedBy).toBe(winner.id);expect(saved!.subOrders[0].cashCollection!.amountCents).toBe(1200);expect((await Partner.findById(winner.id))!.activeTask).toBeUndefined();
   expect((await liveApi.get(`/delivery/tasks/${subId}/contact`).set("Authorization",auth(winner))).status).toBe(404);
  }finally{await Order.deleteMany({_id:{$in:[orderId,extraOrder]}});await InventoryReservation.deleteOne({_id:holdId});await Partner.deleteMany({_id:{$in:[delivery.id,second.id]}});await Shop.updateOne({_id:shopId},{$set:{status:original!.status,active:original!.active,areaIds:original!.areaIds}});}
 });
});


describe("admin moderation and support conversations",()=>{
 it("blocks public lookup/quote/reservations independently of seller edits, audits and restores",async()=>{
  const original=await Product.findById(productId).lean();
  try{
   const listed=await api.get(`/admin/products?shopId=${shopId}`).set("Authorization",auth(admin));expect(listed.status).toBe(200);expect(listed.body.items.some((p:{id:string})=>p.id===productId)).toBe(true);
   expect((await api.get("/admin/products").set("Authorization",auth(seller))).status).toBe(403);
   expect((await api.patch(`/admin/products/${productId}/moderation`).set("Authorization",auth(buyer)).send({version:original!.version,blocked:true,reason:"TEST policy"})).status).toBe(403);
   const blocked=await api.patch(`/admin/products/${productId}/moderation`).set("Authorization",auth(admin)).send({version:original!.version,blocked:true,reason:"TEST policy review"});expect(blocked.status).toBe(200);
   expect((await api.get(`/products/${productId}`)).status).toBe(404);
   const quote=await api.post("/cart/quote").send({areaId,items:[{productId,qty:1}]});expect(quote.body.lines[0].issues[0].code).toBe("PRODUCT_UNAVAILABLE");
   await expect(reserveInventory(buyer,{key:randomUUID(),items:[{productId,qty:1}]})).rejects.toMatchObject({code:"LISTING_UNAVAILABLE"});
   expect((await api.patch(`/seller/products/${productId}`).set("Authorization",auth(seller)).send({version:blocked.body.version,moderation:{blocked:false}})).status).toBe(400);
   const audit=await api.get(`/admin/audit?targetId=${productId}`).set("Authorization",auth(admin));expect(audit.body.items.some((r:{action:string})=>r.action==="product.block")).toBe(true);expect(JSON.stringify(audit.body)).not.toContain("password");
   expect((await api.patch(`/admin/products/${productId}/moderation`).set("Authorization",auth(admin)).send({version:original!.version,blocked:false,reason:"TEST stale"})).status).toBe(409);
   expect((await api.patch(`/admin/products/${productId}/moderation`).set("Authorization",auth(admin)).send({version:blocked.body.version,blocked:false,reason:"TEST reviewed"})).status).toBe(200);
  }finally{if(original)await Product.replaceOne({_id:productId},original);}
 });
 it("reactivates stable taxonomy IDs with parent/version checks and audit",async()=>{
  const subId=randomUUID(),c=await Category.create({slug:`test-reactivate-${randomUUID()}`,name:"TEST inactive",active:false,subcategories:[{_id:subId,slug:"test-sub",name:"TEST SUB",active:false}]});
  try{
   expect((await api.post(`/admin/categories/${c._id}/reactivate`).set("Authorization",auth(admin)).send({version:c.version,subId})).body.code).toBe("INACTIVE_CATEGORY");
   const restored=await api.post(`/admin/categories/${c._id}/reactivate`).set("Authorization",auth(admin)).send({version:c.version});expect(restored.status).toBe(200);
   expect((await api.post(`/admin/categories/${c._id}/reactivate`).set("Authorization",auth(admin)).send({version:restored.body.version,subId})).status).toBe(200);
   expect((await Category.findById(c._id))!.subcategories[0]._id).toBe(subId);expect((await Category.findById(c._id))!.subcategories[0].active).toBe(true);
  }finally{await Category.deleteOne({_id:c._id});}
 });
 it("replies idempotently, preserves resolution when reopening, searches literal text and protects ownership",async()=>{
  const id=randomUUID(),orderId=randomUUID();
  await SupportTicket.create({_id:id,buyerId:buyer.id,orderId,suborderId:id,shopId,shopName:"TEST [literal] SHOP",kind:"quality",description:"TEST original report",status:"resolved",version:0,note:"TEST legacy resolution",createdAt:new Date(),updatedAt:new Date()});
  try{
   expect((await api.get(`/support/${id}/messages`).set("Authorization",auth(seller))).status).toBe(403);
   const foreign=await createUser({name:"TEST FOREIGN BUYER",phone:"+919887001112",password});const session=await login({phone:foreign.phone,password},config,"test-support-foreign");
   expect((await api.get(`/support/${id}/messages`).set("Authorization",`Bearer ${session.token}`)).status).toBe(404);
   const input={version:0,key:randomUUID(),body:"TEST still missing an item"};
   expect((await api.post(`/support/${id}/messages`).set("Authorization",auth(buyer)).send(input)).body.code).toBe("TICKET_STATE");
   expect((await api.post(`/support/${id}/reopen`).set("Authorization",auth(buyer)).send(input)).status).toBe(200);
   expect((await api.post(`/support/${id}/reopen`).set("Authorization",auth(buyer)).send(input)).status).toBe(200);
   const reply={version:1,key:randomUUID(),body:"TEST reply <script>plain text</script>"};
   expect((await api.post(`/support/${id}/messages`).set("Authorization",auth(admin)).send(reply)).status).toBe(200);
   expect((await api.post(`/support/${id}/messages`).set("Authorization",auth(admin)).send(reply)).status).toBe(200);
   expect((await api.post(`/support/${id}/messages`).set("Authorization",auth(admin)).send({...reply,body:"TEST changed body"})).status).toBe(409);
   const messages=await api.get(`/support/${id}/messages`).set("Authorization",auth(buyer));expect(messages.body.items).toHaveLength(3);expect(messages.body.items.some((m:{body:string})=>m.body==="TEST legacy resolution")).toBe(true);expect(JSON.stringify(messages.body)).not.toContain("actorId");
   const search=await api.get("/support?q=%5Bliteral%5D").set("Authorization",auth(admin));expect(search.status).toBe(200);expect(search.body.items.some((t:{id:string})=>t.id===id)).toBe(true);
   const threadSearch=await api.get("/support?q=plain%20text").set("Authorization",auth(admin));expect(threadSearch.body.items.some((t:{id:string})=>t.id===id)).toBe(true);
   const audit=await api.get(`/admin/audit?targetId=${id}`).set("Authorization",auth(admin));expect(audit.body.items.some((a:{action:string})=>a.action==="support.reopen")).toBe(true);expect(JSON.stringify(audit.body)).not.toContain("plain text");
   const recon=await api.get(`/admin/reconciliation?shopId=${shopId}`).set("Authorization",auth(admin));expect(recon.status).toBe(200);expect(JSON.stringify(recon.body)).not.toContain("buyerId");expect(recon.body.items.every((r:{settlementStatus:string})=>r.settlementStatus==="not_integrated")).toBe(true);
  }finally{await SupportTicket.deleteOne({_id:id});await SupportMessage.deleteMany({ticketId:id});}
 });
});


describe("delivery failure resolution",()=>{
 const enabled=request(createApp({...config,PLATFORM_DELIVERY_ENABLED:true}));
 async function fixture(state:"claimed"|"picked_up"|"out_for_delivery",run:(f:{id:string;orderId:string;product:string;variant:string})=>Promise<void>,prepaid=false){
  const orderId=randomUUID(),id=randomUUID(),product=randomUUID(),variant=randomUUID(),hold=randomUUID(),prior=await Partner.findById(delivery.id).lean();
  await Product.create({_id:product,shopId,categoryId,name:"TEST RETURN STOCK",sortName:"test return stock",unit:"bag",priceCents:500,stock:0,totalStock:3,sortPriceCents:500,active:true,variants:[{_id:variant,label:"500g",priceCents:500,stock:3,active:true}]});
  await Partner.deleteOne({_id:delivery.id});await Partner.create({_id:delivery.id,approved:true,areaIds:[areaId],online:true,seenAt:new Date(),version:0,activeTask:id});
  await Order.create({_id:orderId,buyerId:buyer.id,reservationId:hold,fingerprint:"TEST EXCEPTION",createdAt:new Date(),addressId:randomUUID(),address:{label:"TEST",line1:"PRIVATE TEST DROP",locality:"TEST",city:"TEST",pincode:"999999"},paymentMethod:prepaid?"razorpay":"cod",paymentStatus:prepaid?"paid":"unpaid",totalCents:1200,subOrders:[{_id:id,shopId,shopName:"TEST RETURN SHOP",status:state==="out_for_delivery"?"out_for_delivery":"ready",fulfilment:"platform_delivery",version:0,itemsSubtotalCents:1000,deliveryFeeCents:200,lines:[{productId:product,variantId:variant,variantLabel:"500g",name:"TEST RETURN STOCK",unit:"bag",qty:2,priceCents:500}],delivery:{partnerId:delivery.id,state,claimedAt:new Date(),...(state!=="claimed"?{pickedUpAt:new Date()}:{}),issue:{reason:"TEST unable to complete delivery",at:new Date()}}}]});
  await InventoryReservation.create({_id:hold,buyerId:buyer.id,orderId,state:"committed",fingerprint:"TEST RETURN",createdAt:new Date(),expiresAt:new Date(Date.now()+100000),lines:[{productId:product,variantId:variant,shopId,qty:2,priceCents:500}]});
  if(prepaid)await OnlinePayment.create({_id:orderId,buyerId:buyer.id,keyId:"rzp_test_Isolated",state:"paid",providerPaymentId:`pay_Test${orderId.replaceAll("-","")}`,amountCents:1200,createdAt:new Date(),paidAt:new Date()});
  try{await run({id,orderId,product,variant});}finally{await Order.deleteOne({_id:orderId});await InventoryReservation.deleteOne({_id:hold});await Product.deleteOne({_id:product});await Refund.deleteOne({_id:id});await OnlinePayment.deleteOne({_id:orderId});await Partner.deleteOne({_id:delivery.id});if(prior)await Partner.create(prior);}
 }
 const resolve=(id:string,body:object,who=admin)=>enabled.post(`/admin/delivery/tasks/${id}/resolve`).set("Authorization",auth(who)).send(body);
 it("releases no-show task only before pickup, revokes old capabilities and preserves stock",async()=>fixture("claimed",async f=>{
  const body={version:0,action:"release",reason:"TEST partner no-show verified with shop",confirmGoodsAtShop:true};
  expect((await resolve(f.id,body,buyer)).status).toBe(403);expect((await resolve(f.id,{...body,confirmGoodsAtShop:false})).status).toBe(400);
  expect((await resolve(f.id,body)).status).toBe(200);expect((await resolve(f.id,body)).status).toBe(200);
  expect((await Order.findById(f.orderId))!.subOrders[0].delivery).toBeUndefined();expect((await Partner.findById(delivery.id))!.activeTask).toBeUndefined();expect((await Product.findById(f.product))!.variants[0].stock).toBe(3);
  expect((await enabled.get(`/delivery/tasks/${f.id}/contact`).set("Authorization",auth(delivery))).status).toBe(404);
  expect((await enabled.post(`/delivery/tasks/${f.id}/claim`).set("Authorization",auth(delivery)).send({version:1})).body.code).toBe("TASK_RELEASED");
  expect((await enabled.post(`/seller/orders/${f.orderId}/suborders/${f.id}/pickup`).set("Authorization",auth(seller)).send({version:0,partnerId:delivery.id,confirmHandoff:true})).status).toBe(404);
 }));
 it("serializes pickup vs release so one action wins",async()=>fixture("claimed",async f=>{
  const results=await Promise.all([resolve(f.id,{version:0,action:"release",reason:"TEST verified no pickup yet",confirmGoodsAtShop:true}),enabled.post(`/seller/orders/${f.orderId}/suborders/${f.id}/pickup`).set("Authorization",auth(seller)).send({version:0,partnerId:delivery.id,confirmHandoff:true})]);
  expect(results.filter(r=>r.status===200)).toHaveLength(1);expect([404,409]).toContain(results.find(r=>r.status!==200)!.status);
 }));
 it("requires seller return receipt, restores exact variant stock once and clears COD due",async()=>fixture("out_for_delivery",async f=>{
  expect((await resolve(f.id,{version:0,action:"release",reason:"TEST unsafe after pickup",confirmGoodsAtShop:true})).status).toBe(409);
  expect((await resolve(f.id,{version:0,action:"request_return",reason:"TEST buyer unavailable return to shop"})).status).toBe(200);
  expect((await Partner.findById(delivery.id))!.activeTask).toBe(f.id);await expect(issueReceiptCode(buyer,f.orderId,f.id,{version:1,confirmReceived:true,confirmCashPaid:true},config)).rejects.toMatchObject({code:"RECEIPT_UNAVAILABLE"});
  const body={version:1,partnerId:delivery.id,confirmGoodsReceived:true,restock:true,reason:"TEST all returned goods inspected sellable"};
  expect((await enabled.post(`/seller/orders/${f.orderId}/suborders/${f.id}/returned`).set("Authorization",auth(otherSeller)).send(body)).status).toBe(404);
  expect((await enabled.post(`/seller/orders/${f.orderId}/suborders/${f.id}/returned`).set("Authorization",auth(seller)).send({...body,stock:100})).status).toBe(400);
  const results=await Promise.all([1,2].map(()=>enabled.post(`/seller/orders/${f.orderId}/suborders/${f.id}/returned`).set("Authorization",auth(seller)).send(body)));expect(results.map(r=>r.status)).toEqual([200,200]);
  expect((await Product.findById(f.product))!.variants[0].stock).toBe(5);expect((await Product.findById(f.product))!.stock).toBe(0);expect((await Partner.findById(delivery.id))!.activeTask).toBeUndefined();
  const order=await enabled.get(`/orders/${f.orderId}`).set("Authorization",auth(buyer));expect(order.body.total).toBe(12);expect(order.body.amountDue).toBe(0);expect(order.body.cancelledAmount).toBe(12);expect(order.body.subOrders[0].deliveryState).toBe("returned");
 }));
 it("does not restock unsellable goods and requests, never fabricates, a prepaid refund",async()=>fixture("picked_up",async f=>{
  await Order.updateOne({_id:f.orderId},{$unset:{"subOrders.0.delivery.issue":1}});const lookup=await enabled.get(`/admin/delivery/exceptions?taskId=${f.id}`).set("Authorization",auth(admin));expect(lookup.status).toBe(200);expect(lookup.body.items[0].id).toBe(f.id);
  expect((await resolve(f.id,{version:0,action:"request_return",reason:"TEST returned food must not be restocked"})).status).toBe(200);
  const body={version:1,partnerId:delivery.id,confirmGoodsReceived:true,restock:false,reason:"TEST goods returned but not sellable"};expect((await enabled.post(`/seller/orders/${f.orderId}/suborders/${f.id}/returned`).set("Authorization",auth(seller)).send(body)).status).toBe(200);
  expect((await Product.findById(f.product))!.variants[0].stock).toBe(3);const refund=await Refund.findById(f.id);expect(refund!.state).toBe("requested");expect(refund!.amountCents).toBe(1200);expect(refund!.providerRefundId).toBeUndefined();
 },true));
 it("blocks automated financial reversal after buyer receipt confirmation",async()=>fixture("out_for_delivery",async f=>{
  await issueReceiptCode(buyer,f.orderId,f.id,{version:0,confirmReceived:true,confirmCashPaid:true},config);
  expect((await resolve(f.id,{version:0,action:"request_return",reason:"TEST must investigate cash already acknowledged"})).body.code).toBe("FINANCIAL_REVIEW_REQUIRED");
  expect((await resolve(f.id,{version:0,action:"resume",reason:"TEST do not erase buyer proof"})).body.code).toBe("FINANCIAL_REVIEW_REQUIRED");expect((await Order.findById(f.orderId))!.subOrders[0].receipt).toBeTruthy();
 }));
 it("requires valid committed inventory proof before confirming returned goods",async()=>fixture("out_for_delivery",async f=>{
  expect((await resolve(f.id,{version:0,action:"request_return",reason:"TEST return requires stock proof"})).status).toBe(200);
  const order=await Order.findById(f.orderId);await InventoryReservation.updateOne({_id:order!.reservationId},{$set:{"lines.0.qty":99}});
  const body={version:1,partnerId:delivery.id,confirmGoodsReceived:true,restock:true,reason:"TEST returned goods inspected at counter"};const response=await enabled.post(`/seller/orders/${f.orderId}/suborders/${f.id}/returned`).set("Authorization",auth(seller)).send(body);expect(response.body.code).toBe("INVENTORY_INVARIANT");expect((await Product.findById(f.product))!.variants[0].stock).toBe(3);expect((await Partner.findById(delivery.id))!.activeTask).toBe(f.id);expect((await Order.findById(f.orderId))!.subOrders[0].delivery!.state).toBe("returning");
 }));
 it("cancelling one delivery leaves another shop charge and order lines unchanged",async()=>fixture("claimed",async f=>{
  const otherId=randomUUID(),other={_id:otherId,shopId:otherShopId,shopName:"TEST OTHER SHOP",status:"accepted",fulfilment:"pickup",version:0,itemsSubtotalCents:300,deliveryFeeCents:0,lines:[{productId:otherProductId,name:"TEST OTHER ITEM",unit:"piece",qty:1,priceCents:300}]};await Order.updateOne({_id:f.orderId},{$push:{subOrders:other},$set:{totalCents:1500}});
  expect((await resolve(f.id,{version:0,action:"cancel_before_pickup",reason:"TEST first shop only cannot deliver",confirmGoodsAtShop:true,restock:true})).status).toBe(200);
  const order=await enabled.get(`/orders/${f.orderId}`).set("Authorization",auth(buyer));expect(order.body.total).toBe(15);expect(order.body.amountDue).toBe(3);expect(order.body.cancelledAmount).toBe(12);expect(order.body.subOrders.find((s:{id:string})=>s.id===otherId)).toMatchObject({status:"accepted",version:0,amountDue:3,lines:[{productId:otherProductId,qty:1,price:3}]});
 }));
 it("cancels before pickup with explicit no-restock decision and accepts an immediate retry",async()=>fixture("claimed",async f=>{
  const body={version:0,action:"cancel_before_pickup",reason:"TEST shop cannot fulfil packed goods",confirmGoodsAtShop:true,restock:false};expect((await resolve(f.id,body)).status).toBe(200);expect((await resolve(f.id,body)).status).toBe(200);expect((await Product.findById(f.product))!.variants[0].stock).toBe(3);expect((await Order.findById(f.orderId))!.subOrders[0].status).toBe("cancelled");
 }));
});


describe("cash custody and manual seller settlement",()=>{
 async function fixture(method:"cod"|"razorpay",fulfilment:"pickup"|"seller_delivery"|"platform_delivery",run:(f:{id:string;orderId:string})=>Promise<void>){
  await Promise.all([Settlement.init(),Journal.init(),Remittance.init(),Payout.init()]);
  const orderId=randomUUID(),id=randomUUID(),hold=randomUUID(),at=new Date(),fee=fulfilment==="pickup"?0:200,gross=1000+fee;
  await Order.create({_id:orderId,buyerId:buyer.id,fingerprint:"TEST SETTLEMENT",reservationId:hold,createdAt:at,addressId:randomUUID(),address:{label:"TEST",line1:"PRIVATE SETTLEMENT ADDRESS",locality:"TEST",city:"TEST",pincode:"999999"},paymentMethod:method,paymentStatus:method==="cod"?"cash_recorded":"paid",totalCents:gross,subOrders:[{_id:id,shopId,shopName:"TEST LEDGER SHOP",status:"delivered",version:4,fulfilment,itemsSubtotalCents:1000,deliveryFeeCents:fee,lines:[{productId,name:"TEST LEDGER ITEM",unit:"bag",qty:1,priceCents:1000}],...(fulfilment==="platform_delivery"?{delivery:{partnerId:delivery.id,state:"delivered",claimedAt:at,completedAt:at}}:{}),...(method==="cod"?{cashCollection:{id:randomUUID(),method:"cash",amountCents:gross,reportedBy:fulfilment==="platform_delivery"?delivery.id:seller.id,recordedAt:at,buyerConfirmedAt:at},receipt:{hash:"a".repeat(64),nonce:randomUUID(),version:3,issuedAt:at,expiresAt:new Date(at.getTime()+300000),buyerConfirmedAt:at,attempts:0,consumedAt:at}}:{receipt:{hash:"a".repeat(64),nonce:randomUUID(),version:3,issuedAt:at,expiresAt:new Date(at.getTime()+300000),buyerConfirmedAt:at,attempts:0,consumedAt:at}})}]});
  await InventoryReservation.create({_id:hold,buyerId:buyer.id,orderId,state:"committed",fingerprint:"TEST SETTLEMENT",createdAt:at,expiresAt:new Date(at.getTime()+100000),lines:[{productId,shopId,qty:1,priceCents:1000}]});
  if(method==="razorpay")await OnlinePayment.create({_id:orderId,buyerId:buyer.id,keyId:"rzp_live_IsolatedTestFixtureNotReal",state:"paid",providerPaymentId:`pay_Isolated${orderId.replaceAll("-","")}`,amountCents:gross,createdAt:at,paidAt:at});
  try{await run({id,orderId});}finally{await Journal.deleteMany({sourceId:id});await Settlement.deleteOne({_id:id});await Remittance.deleteOne({_id:id});await Payout.deleteOne({_id:id});await SupportTicket.deleteOne({_id:id});await Refund.deleteOne({_id:id});await Order.deleteOne({_id:orderId});await InventoryReservation.deleteOne({_id:hold});await OnlinePayment.deleteOne({_id:orderId});}
 }
 const post=(id:string)=>api.post(`/settlements/${id}/post`).set("Authorization",auth(admin)).send({version:4});
 const list=(id:string,who=admin)=>api.get(`/settlements?suborderId=${id}`).set("Authorization",auth(who));
 it("posts balanced collections once and separates full COD custody from seller/platform entitlement",async()=>fixture("cod","platform_delivery",async f=>{
  expect((await api.get("/settlements")).status).toBe(401);expect((await api.get("/settlements").set("Authorization",auth(buyer))).status).toBe(403);
  const result=await Promise.all([post(f.id),post(f.id)]);expect(result.map(r=>r.status)).toEqual([200,200]);expect(await Journal.countDocuments({sourceId:f.id})).toBe(1);
  const source=await Settlement.findById(f.id);expect(source).toMatchObject({grossCents:1200,sellerCents:1000,platformCents:200,retainedCents:0,partnerId:delivery.id,policy:"zero_commission_v1"});
  const row=(await list(f.id)).body.items[0];expect(row).toMatchObject({posted:true,grossAmount:12,sellerEntitlement:10,platformDeliveryFee:2,partnerCollection:12,payoutAmount:10});expect(row.holdReason).toContain("cash handover");
  const journal=await Journal.findOne({sourceId:f.id});expect(journal!.entries.reduce((s,e)=>s+e.deltaCents,0)).toBe(0);expect(JSON.stringify((await list(f.id,delivery)).body)).not.toContain("PRIVATE SETTLEMENT ADDRESS");
  expect((await api.get(`/settlements?shopId=${otherShopId}`).set("Authorization",auth(seller))).status).toBe(403);
 }));
 it("requires two-role full handover before payout and records one external payout intent/reference",async()=>fixture("cod","platform_delivery",async f=>{
  await post(f.id);const prepare=()=>api.post(`/settlements/${f.id}/payout/prepare`).set("Authorization",auth(admin)).send({confirmSellerVerified:true});expect((await prepare()).body.code).toBe("PAYOUT_HELD");
  expect((await api.post(`/settlements/${f.id}/remittance/receive`).set("Authorization",auth(admin)).send({version:0,confirmReceived:true,reference:"TEST-CASH-RECEIPT-001"})).body.code).toBe("HANDOVER_NOT_SUBMITTED");
  expect((await api.post(`/settlements/${f.id}/remittance`).set("Authorization",auth(admin)).send({confirmHandedOver:true})).status).toBe(403);
  const submit=()=>api.post(`/settlements/${f.id}/remittance`).set("Authorization",auth(delivery)).send({confirmHandedOver:true});expect((await submit()).status).toBe(200);expect((await submit()).status).toBe(200);expect((await prepare()).body.code).toBe("PAYOUT_HELD");
  const receive=()=>api.post(`/settlements/${f.id}/remittance/receive`).set("Authorization",auth(admin)).send({version:0,confirmReceived:true,reference:`TEST-CASH-${f.id}`});expect((await receive()).status).toBe(200);expect((await receive()).status).toBe(200);
  expect((await prepare()).status).toBe(200);expect((await prepare()).body.state).toBe("prepared");
  const record=()=>api.post(`/settlements/${f.id}/payout/record`).set("Authorization",auth(admin)).send({version:0,confirmTransferred:true,reference:`TEST-UTR-${f.id}`});const replies=await Promise.all([record(),record()]);expect(replies.map(r=>r.status)).toEqual([200,200]);
  expect(await Journal.countDocuments({sourceId:f.id})).toBe(3);for(const j of await Journal.find({sourceId:f.id}).lean())expect(j.entries.reduce((sum,e)=>sum+e.deltaCents,0)).toBe(0);
  expect((await list(f.id,seller)).body.items[0].payout.state).toBe("recorded");expect((await list(f.id,delivery)).body.items[0].payout.reference).toBeUndefined();expect((await api.post(`/settlements/${f.id}/payout/record`).set("Authorization",auth(admin)).send({version:1,confirmTransferred:true,reference:"DIFFERENT-TRANSFER"})).body.code).toBe("ALREADY_RECORDED");
 }));
 it("seller-retained COD produces no duplicate payable or payout",async()=>fixture("cod","seller_delivery",async f=>{
  expect((await post(f.id)).status).toBe(200);const row=(await list(f.id,seller)).body.items[0];expect(row).toMatchObject({sellerEntitlement:12,sellerRetained:12,payoutAmount:0,platformDeliveryFee:0});expect((await api.post(`/settlements/${f.id}/payout/prepare`).set("Authorization",auth(admin)).send({confirmSellerVerified:true})).body.code).toBe("PAYOUT_HELD");const j=await Journal.findOne({sourceId:f.id});expect(j!.entries.every(e=>e.account.startsWith("memo:"))).toBe(true);
 }));
 it("requires intent before manual transfer record and holds unresolved support/refunds",async()=>fixture("razorpay","pickup",async f=>{
  await post(f.id);const record=await api.post(`/settlements/${f.id}/payout/record`).set("Authorization",auth(admin)).send({version:0,confirmTransferred:true,reference:"TEST-INTENT-MISSING"});expect(record.body.code).toBe("INTENT_REQUIRED");
  await SupportTicket.create({_id:f.id,buyerId:buyer.id,orderId:f.orderId,suborderId:f.id,shopId,shopName:"TEST",kind:"payment",description:"TEST payment dispute",status:"open",version:0,note:"",createdAt:new Date(),updatedAt:new Date()});
  expect((await api.post(`/settlements/${f.id}/payout/prepare`).set("Authorization",auth(admin)).send({confirmSellerVerified:true})).body.code).toBe("PAYOUT_HELD");await SupportTicket.deleteOne({_id:f.id});
  await Refund.create({_id:f.id,orderId:f.orderId,shopId,shopName:"TEST",paymentId:"pay_IsolatedOnly",keyId:"rzp_live_IsolatedOnly",amountCents:1000,testMode:false,reason:"TEST refund pending",state:"requested",createdAt:new Date(),updatedAt:new Date()});expect((await api.post(`/settlements/${f.id}/payout/prepare`).set("Authorization",auth(admin)).send({confirmSellerVerified:true})).body.code).toBe("PAYOUT_HELD");expect(await Payout.findById(f.id)).toBeNull();
 }));
 it("rejects test captures/source mismatches and hides foreign seller collections",async()=>fixture("razorpay","pickup",async f=>{
  expect((await list(f.id,otherSeller)).body.items).toEqual([]);expect((await api.get(`/settlements/${f.id}/journals`).set("Authorization",auth(seller))).status).toBe(403);
  await OnlinePayment.updateOne({_id:f.orderId},{$set:{keyId:"rzp_test_NotReal"}});expect((await post(f.id)).body.code).toBe("SETTLEMENT_PROOF_MISSING");expect(await Settlement.findById(f.id)).toBeNull();
  await OnlinePayment.updateOne({_id:f.orderId},{$set:{keyId:"rzp_live_IsolatedOnly"}});await post(f.id);await Order.updateOne({_id:f.orderId},{$set:{"subOrders.0.deliveryFeeCents":100,totalCents:1100}});expect((await api.post(`/settlements/${f.id}/payout/prepare`).set("Authorization",auth(admin)).send({confirmSellerVerified:true})).status).toBe(409);expect(await Payout.findById(f.id)).toBeNull();
 }));
 it("private collector ownership and cursor scope cannot be overridden",async()=>fixture("cod","platform_delivery",async f=>{
  await post(f.id);const foreign=await createUser({name:"TEST FOREIGN CASH PARTNER",phone:"+919887001113",password},"delivery"),session=await login({phone:foreign.phone,password},config,"foreign-cash-test");
  expect((await api.post(`/settlements/${f.id}/remittance`).set("Authorization",`Bearer ${session.token}`).send({confirmHandedOver:true})).status).toBe(404);expect((await api.get(`/settlements?suborderId=${f.id}`).set("Authorization",`Bearer ${session.token}`)).body.items).toEqual([]);
  const {encodeCursor}=await import("../src/common/cursor.js");const cursor=encodeCursor({scope:JSON.stringify(["settlement",admin.id,admin.role,undefined,undefined]),sort:"id",key:f.id,id:f.id},config.CURSOR_SECRET);
  expect((await api.get(`/settlements?cursor=${encodeURIComponent(cursor)}`).set("Authorization",auth(seller))).status).toBe(400);
  expect((await api.post(`/settlements/${f.id}/remittance`).set("Authorization",auth(delivery)).send({confirmHandedOver:true,amount:0})).status).toBe(400);
 }));
 it("global transfer-reference uniqueness rolls back a second source payout",async()=>fixture("razorpay","pickup",async first=>fixture("razorpay","pickup",async second=>{
  for(const f of [first,second]){await post(f.id);expect((await api.post(`/settlements/${f.id}/payout/prepare`).set("Authorization",auth(admin)).send({confirmSellerVerified:true})).status).toBe(200);}
  const record=(id:string,reference:string)=>api.post(`/settlements/${id}/payout/record`).set("Authorization",auth(admin)).send({version:0,confirmTransferred:true,reference});expect((await record(first.id,"TEST-SHARED-UTR-001")).status).toBe(200);expect((await record(second.id,"test shared utr 001")).status).toBe(409);expect((await Payout.findById(second.id))!.state).toBe("prepared");expect(await Journal.countDocuments({sourceId:second.id,kind:"manual_seller_payout"})).toBe(0);
 })));
});
