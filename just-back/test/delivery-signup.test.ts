import { beforeAll, afterAll, it, expect } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { resolve } from "node:path";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";
import { connectDatabase, disconnectDatabase } from "../src/db.js";
import { User, Session } from "../src/auth/models.js";
import { Partner } from "../src/delivery/models.js";
const config=loadConfig({NODE_ENV:"test",EMAIL_OTP_REQUIRED:"false",MONGODB_URI:"mongodb://127.0.0.1:27017/unused",CORS_ORIGINS:"http://localhost:8081",SESSION_PEPPER:"delivery-signup-session-".repeat(4),CURSOR_SECRET:"delivery-signup-cursor-".repeat(4),LOG_LEVEL:"silent"});
const api=request(createApp(config));
let repl:MongoMemoryReplSet;
beforeAll(async()=>{repl=await MongoMemoryReplSet.create({binary:{downloadDir:resolve(".cache/mongodb")},replSet:{count:1,storageEngine:"wiredTiger"}});await connectDatabase(repl.getUri("qa_delivery_signup"));await Promise.all([User.init(),Session.init(),Partner.init()]);});
afterAll(async()=>{await disconnectDatabase();await repl?.stop();});
const input={name:"QA Rider",phone:"+919001234567",password:"isolated-rider-test-password"};
it("registers an unapproved offline rider and rejects going online before approval",async()=>{
 const response=await api.post("/auth/register/delivery").send(input).expect(201);
 expect(response.body.role).toBe("delivery");
 const user=await User.findOne({phone:input.phone}).lean();
 expect(user?.role).toBe("delivery");
 expect(await Partner.findById(user!._id).lean()).toMatchObject({approved:false,online:false,areaIds:[]});
 await api.put("/delivery/availability").set("Authorization",`Bearer ${response.body.token}`).send({online:true}).expect(403);
});
it("rejects injected approval, role and area assignments",async()=>{
 await api.post("/auth/register/delivery").send({...input,phone:"+919001234568",role:"admin",approved:true,areaIds:["fake"]}).expect(400);
 expect(await User.exists({phone:"+919001234568"})).toBeNull();
});
