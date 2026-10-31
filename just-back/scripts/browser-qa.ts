import {OnlinePayment,PaymentEvent,PaymentAudit} from "../src/payments/razorpay.js";
import {Refund} from "../src/payments/refund-model.js";
import {Settlement,Journal,Remittance,Payout} from "../src/settlements/models.js";
import {Partner} from "../src/delivery/models.js";
import {Session} from "../src/auth/models.js";
import {tokenHash} from "../src/auth/service.js";
// Isolated database fixtures. Optional live R2 verification copies only a storage allowlist.
import express from "express";
import {randomBytes,randomUUID} from "node:crypto";
import {resolve} from "node:path";
import {readFileSync} from "node:fs";
import {parse} from "dotenv";
import {deleteR2} from "../src/images/r2.js";
import {MongoMemoryReplSet} from "mongodb-memory-server";
import {loadConfig} from "../src/config/env.js";
import {connectDatabase,disconnectDatabase} from "../src/db.js";
import {createApp} from "../src/app.js";
import {createUser,login} from "../src/auth/service.js";
import {Area,Category,Product,Shop} from "../src/catalogue/models.js";
import {createShop,createProduct,changeApproval} from "../src/catalogue/service.js";
import {shopCreate,productCreate} from "../src/catalogue/validators.js";
import {Address} from "../src/addresses/routes.js";
import {Order} from "../src/orders/models.js";
import {InventoryReservation} from "../src/inventory/models.js";
import type {Actor} from "../src/auth/middleware.js";
import {Notification,NotificationRead} from "../src/notifications/service.js";
async function main(){
  if(process.env.ALLOW_ISOLATED_BROWSER_QA!=="true")throw new Error("Explicit isolated QA opt-in required");
  const repl=await MongoMemoryReplSet.create({binary:{downloadDir:resolve(".cache/mongodb")},replSet:{count:1,storageEngine:"wiredTiger"}});
  const storage:Record<string,string>={};
  const payment:Record<string,string>={};
  if(process.env.ALLOW_RAZORPAY_TEST_QA==="true"){
    const env=parse(readFileSync(".env"));
    if(!env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") || !env.RAZORPAY_KEY_SECRET)throw new Error("Test-only Razorpay credentials required");
    payment.RAZORPAY_KEY_ID=env.RAZORPAY_KEY_ID;payment.RAZORPAY_KEY_SECRET=env.RAZORPAY_KEY_SECRET;
    payment.RAZORPAY_WEBHOOK_SECRET=randomBytes(48).toString("hex");
    payment.RAZORPAY_ENABLED="true";payment.RAZORPAY_REFUNDS_ENABLED="true";
  }
  if(process.env.ALLOW_LIVE_R2_QA==="true"){
    const env=parse(readFileSync(".env"));
    for(const field of ["CLOUDFLARE_ACCOUNT_ID","CLOUDFLARE_R2_ACCESS_KEY_ID","CLOUDFLARE_R2_SECRET_ACCESS_KEY","CLOUDFLARE_R2_BUCKET","CLOUDFLARE_R2_PUBLIC_BASE_URL"])if(env[field])storage[field]=env[field];
    storage.IMAGE_STORAGE_PROVIDER="r2";
  }
  const config=loadConfig({...storage,...payment,NODE_ENV:"test",EMAIL_OTP_REQUIRED:"false",MONGODB_URI:repl.getUri("jpi_isolated_browser_qa"),CORS_ORIGINS:"http://localhost:8083",SESSION_PEPPER:randomBytes(48).toString("hex"),CURSOR_SECRET:randomBytes(48).toString("hex"),LOG_LEVEL:"silent",ORDERS_COD_ENABLED:"true",PLATFORM_DELIVERY_ENABLED:process.env.QA_DELIVERY_REGRESSION==="true"?"true":"false"});
  await connectDatabase(config.MONGODB_URI);
  await Promise.all([OnlinePayment.init(),PaymentEvent.init(),PaymentAudit.init(),Refund.init(),Settlement.init(),Journal.init(),Remittance.init(),Payout.init(),Order.init(),InventoryReservation.init(),Shop.init(),Product.init(),Category.init(),Notification.init(),NotificationRead.init()]);
  const credentials:Record<string,{phone:string;password:string}>={};
  const roles=["buyer","seller","seller","admin"] as const,sessions:Record<string,Awaited<ReturnType<typeof login>>>={},actors:Actor[]=[];
  for(const [index,role] of roles.entries()){
    const password=randomBytes(24).toString("base64url"),user=await createUser({name:`QA DEMO ${role} ${index}`,phone:`+91900000000${index}`,password},role);
    credentials[["buyer","seller","other-seller","admin"][index]!]={phone:user.phone,password};
    actors.push({id:user._id,role});sessions[["buyer","seller","other-seller","admin"][index]]=await login({phone:user.phone,password},config,`qa-${index}`);
  }
  if(process.env.QA_ACCOUNT_REGRESSION==="true"){
    const password=randomBytes(24).toString("base64url"),user=await createUser({name:"QA DEMO second buyer",phone:"+919000000004",password},"buyer");credentials["other-buyer"]={phone:user.phone,password};sessions["other-buyer"]=await login({phone:user.phone,password},config,"qa-second-buyer");
  }
  const area=await Area.create({name:"QA DEMO AREA",city:"QA DEMO CITY",pincodes:["999999"],active:true});
  const category=await Category.create({slug:"qa-demo-grocery",name:"QA DEMO Grocery",blurb:"Isolated browser fixtures — no real market shops",active:true,image:""});
  const shops:Awaited<ReturnType<typeof createShop>>[]=[];
  for(const index of [1,2]){
    const shop=await createShop(actors[index],shopCreate.parse({slug:`qa-demo-counter-${index}`,name:`QA DEMO Counter ${index}`,tagline:"Temporary local QA only",description:"Not a real shop. No real purchase, delivery or cash collection.",address:`QA DEMO shop lane ${index}`,locality:"QA DEMO Locality",categoryIds:[category._id],serviceAreaIds:[area._id],since:2026,initials:`Q${index}`,fulfilment:["pickup","seller_delivery"],openingHours:Array.from({length:7},(_,day)=>({day,opens:"00:00",closes:"23:59"})),deliveryFee:10,minimumOrderAmount:0}));
    await changeApproval(shop._id,{version:shop.version,status:"approved"},actors[3].id);shops.push(shop);
  }
  const riceA=await createProduct(actors[1],productCreate.parse({name:"QA DEMO Rice",unit:"bag",description:"QA DEMO variant selection fixture",categoryId:category._id,price:40,stock:99,variants:[{label:"500 g",price:25,stock:5},{label:"1 kg",price:40,stock:3}]}));
  // Invented coordinates belong only to isolated, explicitly labelled QA shops.
  await Shop.updateOne({_id:shops[0]._id},{$set:{location:{type:"Point",coordinates:[86,26]}}});
  await Shop.updateOne({_id:shops[1]._id},{$set:{location:{type:"Point",coordinates:[86,26.06]}}});
  const riceB=await createProduct(actors[2],productCreate.parse({name:"QA DEMO Rice",unit:"bag",description:"QA DEMO independent price/stock fixture",categoryId:category._id,price:60,stock:4,variants:[]}));
  await Address.create({userId:actors[0].id,label:"QA DEMO Home",line1:"QA DEMO test lane",locality:"QA DEMO Locality",city:"QA DEMO CITY",pincode:"999999"});
  const root=express();
  if(process.env.ALLOW_RAZORPAY_TEST_QA==="true")root.get("/__qa/payment",async(_req,res)=>{
    const home=await Address.findOne({userId:actors[0].id}).lean();
    res.setHeader("Cache-Control","no-store");res.json({isolated:true,testOnly:true,input:{areaId:area._id,addressId:home!._id,addressVersion:0,paymentMethod:"razorpay",expectedTotal:25,items:[{productId:riceA._id,variantId:riceA.variants[0]._id,qty:1}],fulfilments:[{shopId:shops[0]._id,method:"pickup"}]}});
  });
  const uploadedKeys=new Set<string>();
  root.use((_req,res,next)=>{const json=res.json.bind(res);res.json=(body)=>{if(storage.IMAGE_STORAGE_PROVIDER && typeof body?.image==="string"){const base=`${config.CLOUDFLARE_R2_PUBLIC_BASE_URL!.replace(/\/$/,"")}/`;if(body.image.startsWith(base)){const key=body.image.slice(base.length);if(/^products\/[a-f0-9]{32}\.webp$/.test(key))uploadedKeys.add(key);}}return json(body);};next();});
  root.get("/__qa/bootstrap/:role",async(req,res)=>{
    const role=req.params.role;let session=sessions[role];if(!session){res.sendStatus(404);return;}
    if(!await Session.exists({_id:tokenHash(session.token,config),expiresAt:{$gt:new Date()}})){session=await login(credentials[role]!,config,`qa-bootstrap-${role}`);sessions[role]=session;}
    const target=session.role==="delivery"?"/delivery":session.role==="buyer" ? "/" : role==="admin" ? "/admin/partners" : "/seller/orders";
    const payload=JSON.stringify(session).replaceAll("<","\\u003c");
    res.setHeader("Cache-Control","no-store");res.type("html").send(`<!doctype html><title>QA DEMO account bootstrap</title><p>Isolated QA DEMO session. No production credentials.</p><script>if(location.port==='8083'){localStorage.setItem('jpi.session.api:http://localhost:4001',${JSON.stringify(payload)});location.replace(${JSON.stringify(target)});}else{document.body.textContent='Open this helper through the isolated frontend on port 8083.';}</script>`);
  });
  root.get("/__qa/report",async(_req,res)=>{
    const orders=await Order.find().lean(),products=await Product.find({_id:{$in:[riceA._id,riceB._id]}}).lean();
    products.sort((a,b)=>a._id===riceA._id?-1:b._id===riceA._id?1:0);
    res.setHeader("Cache-Control","no-store");res.json({isolated:true,orders:orders.map(order=>({id:order._id,paymentStatus:order.paymentStatus,totalCents:order.totalCents,subOrders:order.subOrders.map(sub=>({shopId:sub.shopId,status:sub.status,version:sub.version,cashRecordedCents:sub.cashCollection?.amountCents ?? 0}))})),products:products.map(product=>({name:product.name,shopId:product.shopId,stock:product.stock,variants:product.variants.map(variant=>({label:variant.label,stock:variant.stock,priceCents:variant.priceCents}))}))});
  });
  root.get("/__qa/storage",(_req,res)=>res.json({isolated:true,liveR2:storage.IMAGE_STORAGE_PROVIDER==="r2",publicBase:storage.IMAGE_STORAGE_PROVIDER ? config.CLOUDFLARE_R2_PUBLIC_BASE_URL : null}));
  root.post("/__qa/cleanup-photos",async(_req,res)=>{let removed=0;for(const key of [...uploadedKeys]){await deleteR2(config,key);uploadedKeys.delete(key);removed++;}res.json({isolated:true,removed,remaining:uploadedKeys.size});});
  if(process.env.QA_CHECKOUT_REGRESSION==="true"){
    const extraArea=await Area.create({name:"QA DEMO OTHER AREA",city:"QA DEMO CITY",pincodes:["999998"],active:true});
    const alternate=await Address.create({userId:actors[0]!.id,label:"QA DEMO Outside",line1:"QA DEMO outside coverage",locality:"QA DEMO",city:"QA DEMO CITY",pincode:"999998"});
    const home=await Address.findOne({userId:actors[0]!.id,label:"QA DEMO Home"}).lean();
    const originalProducts=await Product.find({_id:{$in:[riceA._id,riceB._id]}}).lean();originalProducts.sort((a,b)=>a._id===riceA._id?-1:b._id===riceA._id?1:0);
    root.use("/__qa/checkout",express.json());
    root.get("/__qa/checkout",async(_req,res)=>res.json({isolated:true,areaId:area._id,extraAreaId:extraArea._id,buyerId:actors[0]!.id,addressId:home!._id,outsideAddressId:alternate._id,shopIds:shops.map(s=>s._id),products:originalProducts.map(p=>({id:p._id,shopId:p.shopId,price:p.priceCents/100,variants:p.variants.map(v=>({id:v._id,price:v.priceCents/100}))}))}));
    root.post("/__qa/checkout",async(req,res)=>{
      const mode=req.body.mode;
      if(mode==="restore"){for(const product of originalProducts)await Product.updateOne({_id:product._id},{$set:{stock:product.stock,priceCents:product.priceCents,variants:product.variants,active:true}});for(const shop of shops)await Shop.updateOne({_id:shop._id},{$set:{temporarilyClosed:false,active:true,status:"approved"}});await Address.updateOne({_id:home!._id},{$set:{pincode:"999999",version:0}});}
      else if(mode==="closed")await Shop.updateOne({_id:shops[0]!._id},{$set:{temporarilyClosed:true}});
      else if(mode==="stock")await Product.updateOne({_id:riceA._id,"variants._id":riceA.variants[0]!._id},{$set:{"variants.$.stock":0}});
      else if(mode==="price")await Product.updateOne({_id:riceA._id,"variants._id":riceA.variants[0]!._id},{$set:{"variants.$.priceCents":3500}});
      else if(mode==="address")await Address.updateOne({_id:home!._id},{$set:{pincode:"999998"},$inc:{version:1}});
      else return res.sendStatus(400);
      res.json({isolated:true,mode});
    });
  }
  if(process.env.QA_DELIVERY_REGRESSION==="true"){
    const password=randomBytes(24).toString("base64url"),user=await createUser({name:"QA DEMO DELIVERY",phone:"+919000000099",password},"delivery");
    credentials.delivery={phone:user.phone,password};sessions.delivery=await login(credentials.delivery,config,"qa-delivery");
    await Partner.create({_id:user._id,approved:true,areaIds:[area._id],online:true,seenAt:new Date(),version:1});
    const orderId=randomUUID(),id=randomUUID(),hold=randomUUID();
    await Order.create({_id:orderId,buyerId:actors[0].id,fingerprint:"QA DEMO DELIVERY ONLY",reservationId:hold,createdAt:new Date(),addressId:randomUUID(),address:{label:"QA DEMO",line1:"QA DEMO DROP",locality:"QA DEMO",city:"QA DEMO CITY",pincode:"999999",location:{type:"Point",coordinates:[86,26]}},paymentMethod:"cod",paymentStatus:"unpaid",totalCents:2500,subOrders:[{_id:id,shopId:shops[0]._id,shopName:"QA DEMO Counter 1",shopAddress:"QA DEMO PICKUP",status:"ready",version:0,fulfilment:"platform_delivery",itemsSubtotalCents:2500,deliveryFeeCents:0,lines:[{productId:riceA._id,variantId:riceA.variants[0]._id,variantLabel:riceA.variants[0].label,name:"QA DEMO Rice",unit:"bag",qty:1,priceCents:2500}]}]});
    await InventoryReservation.create({_id:hold,buyerId:actors[0].id,orderId,fingerprint:"QA DEMO",state:"committed",createdAt:new Date(),expiresAt:new Date(Date.now()+3600000),lines:[{productId:riceA._id,variantId:riceA.variants[0]._id,shopId:shops[0]._id,qty:1,priceCents:2500}]});
    if(process.env.QA_DELIVERY_FAILURE_REGRESSION==="true"){
      const secondPassword=randomBytes(24).toString("base64url"),second=await createUser({name:"QA DEMO SECOND DELIVERY",phone:"+919000000098",password:secondPassword},"delivery");credentials.delivery2={phone:second.phone,password:secondPassword};sessions.delivery2=await login(credentials.delivery2,config,"qa-second-delivery");await Partner.create({_id:second._id,approved:true,areaIds:[area._id],online:true,seenAt:new Date(),version:1});
    }
    root.get("/__qa/delivery",(_req,res)=>res.json({isolated:true,orderId,id}));
  }
  // Explicit disposable finance fixtures only. Provider stays disabled; no real money or proof is asserted.
  if(process.env.QA_FINANCE_REGRESSION === "true"){
    if(config.RAZORPAY_ENABLED || process.env.ALLOW_LIVE_R2_QA === "true")throw new Error("Finance UI fixtures require disabled external providers");
    const codId=randomUUID(),partId=randomUUID(),onlineId=randomUUID(),refundId=randomUUID(),createdAt=new Date();
    await Order.create({_id:codId,buyerId:actors[0]!.id,fingerprint:"QA DEMO finance fixture; not a real order",reservationId:randomUUID(),createdAt,addressId:randomUUID(),address:{label:"QA DEMO",line1:"QA DEMO",locality:"QA DEMO",city:"QA DEMO",pincode:"999999"},paymentMethod:"cod",paymentStatus:"unpaid",totalCents:12345,subOrders:[{_id:partId,shopId:shops[0]!._id,shopName:"QA DEMO finance counter",status:"delivered",version:0,fulfilment:"pickup",lines:[{productId:riceA._id,name:"QA DEMO ONLY",unit:"pack",qty:1,priceCents:12345}],itemsSubtotalCents:12345,deliveryFeeCents:0}]});
    await OnlinePayment.create({_id:onlineId,buyerId:actors[0]!.id,keyId:"rzp_test_QADEMO",state:"uncertain",amountCents:12345,createdAt});
    await Refund.create({_id:refundId,orderId:onlineId,shopId:shops[0]!._id,shopName:"QA DEMO refund counter",paymentId:"pay_QADEMO",keyId:"rzp_test_QADEMO",amountCents:1234,testMode:true,reason:"QA DEMO requested refund only; no provider transaction",state:"requested",createdAt,updatedAt:createdAt});
    root.get("/__qa/finance",(_req,res)=>res.json({isolated:true,providerDisabled:true,codId,partId,onlineId,refundId,shopId:shops[0]!._id}));
  }
  root.use(createApp(config));
  if(process.env.QA_SUPPORT_FIXTURE==="true")await Order.create({_id:randomUUID(),buyerId:actors[0]!.id,fingerprint:"QA DEMO support-only fixture",reservationId:randomUUID(),createdAt:new Date(),addressId:randomUUID(),address:{label:"QA DEMO",line1:"QA DEMO",locality:"QA DEMO",city:"QA DEMO",pincode:"999999"},paymentMethod:"cod",paymentStatus:"unpaid",totalCents:0,subOrders:[{_id:randomUUID(),shopId:shops[0]!._id,shopName:"QA DEMO Counter 1",status:"cancelled",fulfilment:"pickup",lines:[],deliveryFeeCents:0,itemsSubtotalCents:0}]});
  const server=root.listen(4001,"127.0.0.1",()=>console.info("Isolated QA DEMO API ready on port 4001. Bootstrap via frontend port 8083. No Atlas connection."));
  let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;server.close();for(const key of uploadedKeys){try{await deleteR2(config,key);}catch{console.warn("QA photo cleanup needs attention",key);}}await disconnectDatabase();await repl.stop();};
  process.once("SIGINT",()=>void stop());process.once("SIGTERM",()=>void stop());server.on("error",()=>void stop().finally(()=>{process.exitCode=1;}));
}
main().catch(async()=>{console.error("Isolated browser QA setup failed. No production database was used.");process.exitCode=1;await disconnectDatabase();});
