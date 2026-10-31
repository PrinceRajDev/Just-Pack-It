import {beforeAll,afterAll,beforeEach,it,expect,vi} from "vitest";
import {MongoMemoryReplSet} from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import {createApp} from "../src/app.js";
import {loadConfig} from "../src/config/env.js";
import {User,Session,Throttle} from "../src/auth/models.js";
import {createUser,login} from "../src/auth/service.js";
import {googleClaims,googleFailureCode} from "../src/auth/google-identity.js";
import type {DecodedIdToken} from "firebase-admin/auth";
const verifier=vi.hoisted(()=>vi.fn());
vi.mock("firebase-admin/auth",()=>({getAuth:()=>({verifyIdToken:verifier})}));
vi.mock("firebase-admin/app",()=>({getApps:()=>[{name:"jpi-auth"}],initializeApp:vi.fn(),cert:vi.fn()}));
const config=loadConfig({NODE_ENV:"test",MONGODB_URI:"mongodb://127.0.0.1/unused",CORS_ORIGINS:"http://localhost:8081",SESSION_PEPPER:"google-session-test-".repeat(3),CURSOR_SECRET:"google-cursor-test-".repeat(3),GOOGLE_SIGN_IN_ENABLED:"true",FIREBASE_PROJECT_ID:"qa-google-project",GOOGLE_APPLICATION_CREDENTIALS:"unused-test-credential.json",LOG_LEVEL:"silent"});
const api=request(createApp(config)),idToken="test-token-".repeat(20),password="isolated-qa-password-2026";
const claims=()=>({uid:"google-test-uid",email:"google@qa.invalid",email_verified:true,auth_time:Math.floor(Date.now()/1000),firebase:{sign_in_provider:"google.com"}} as DecodedIdToken);
let repl:MongoMemoryReplSet;
beforeAll(async()=>{repl=await MongoMemoryReplSet.create({replSet:{count:1}});await mongoose.connect(repl.getUri());await Promise.all([User.init(),Session.init(),Throttle.init()]);});
afterAll(async()=>{await mongoose.disconnect();await repl?.stop();});
beforeEach(async()=>{await Promise.all([User.deleteMany({}),Session.deleteMany({}),Throttle.deleteMany({})]);verifier.mockReset();verifier.mockResolvedValue(claims());});
async function account(){const user=await createUser({name:"Test buyer",phone:"+919876543210",password});await User.updateOne({_id:user._id},{$set:{email:"google@qa.invalid",emailVerifiedAt:new Date()}});return user;}
it("requires recent verified Google identity",()=>{
  expect(googleClaims(claims()).email).toBe("google@qa.invalid");
  for(const patch of [{email_verified:false},{auth_time:1},{firebase:{sign_in_provider:"password"}},{email:undefined}])expect(()=>googleClaims({...claims(),...patch} as DecodedIdToken)).toThrow();
});
it("rejects invalid/revoked tokens without creating an account",async()=>{verifier.mockRejectedValue(Object.assign(new Error("private-provider-error"),{code:"auth/id-token-revoked"}));const res=await api.post("/auth/google").send({idToken});expect(res.status).toBe(401);expect(JSON.stringify(res.body)).not.toContain("private-provider-error");expect(await User.countDocuments()).toBe(0);});
it("logs only fixed Firebase failure categories and treats credential errors as service failures",async()=>{
  expect(googleFailureCode({code:"private-provider-message-token"})).toBe("verification_unavailable");
  const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});
  try{
    verifier.mockRejectedValue(Object.assign(new Error("sensitive-token-and-email"),{code:"auth/insufficient-permission"}));
    const res=await api.post("/auth/google").send({idToken});expect(res.status).toBe(503);expect(res.body.code).toBe("GOOGLE_UNAVAILABLE");
    expect(JSON.stringify(warn.mock.calls)).toContain("auth/insufficient-permission");expect(JSON.stringify(warn.mock.calls)).not.toContain("sensitive");
  }finally{warn.mockRestore();}
});
it("requests onboarding for a new identity and rejects client roles",async()=>{expect((await api.post("/auth/google").send({idToken})).body.code).toBe("GOOGLE_ONBOARDING_REQUIRED");expect((await api.post("/auth/google").send({idToken,role:"admin"})).status).toBe(400);});
it("does not auto-link by email and requires the existing password",async()=>{
  await account();expect((await api.post("/auth/google").send({idToken})).body.code).toBe("GOOGLE_LINK_REQUIRED");
  expect((await api.post("/auth/google").send({idToken,phone:"+919876543210",password:"wrong-password-long"})).status).toBe(401);
  expect((await User.findOne())?.googleUid).toBeUndefined();
});
it("links with password, rotates the old device and preserves server role",async()=>{
  const user=await account(),old=await login({phone:user.phone,password},config,"qa");
  const linked=await api.post("/auth/google").send({idToken,phone:user.phone,password});expect(linked.status).toBe(200);expect(linked.body.role).toBe("buyer");
  expect((await api.get("/auth/me").set("Authorization",`Bearer ${old.token}`)).status).toBe(401);
  const next=await api.post("/auth/google").send({idToken});expect(next.status).toBe(200);
  expect((await api.get("/auth/me").set("Authorization",`Bearer ${linked.body.token}`)).status).toBe(401);
  expect(await Session.countDocuments({userId:user._id})).toBe(1);
  expect(verifier).toHaveBeenCalledWith(idToken,true);
});
it("blocks disabled accounts",async()=>{const user=await account();await User.updateOne({_id:user._id},{$set:{active:false,googleUid:claims().uid}});expect((await api.post("/auth/google").send({idToken})).status).toBe(403);expect(await Session.countDocuments()).toBe(0);});
it("creates a buyer only after complete onboarding and rejects reused identity",async()=>{
  const data={name:"Test buyer",phone:"+919876543210",password,googleIdToken:idToken};
  const result=await api.post("/auth/register").send(data);expect(result.status).toBe(201);expect(result.body.role).toBe("buyer");
  const user=await User.findOne();expect(user?.emailVerifiedAt).toBeTruthy();expect(user?.googleUid).toBe(claims().uid);
  expect((await api.post("/auth/register").send({...data,phone:"+919876543211"})).status).toBe(409);
});
