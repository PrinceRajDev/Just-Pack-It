import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { User, Session, Throttle, type Role, type UserRecord } from "./models.js";
import { fail } from "../common/errors.js";
import type { Config } from "../config/env.js";
import mongoose from "mongoose";
let hashingJobs = 0;
async function scrypt(password: string, salt: string) {
  if (hashingJobs >= 4)
    fail(503, "AUTH_BUSY", "Authentication is busy; retry shortly");
  hashingJobs++;
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scryptCallback(
        password,
        salt,
        64,
        { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key)),
      ),
    );
  } finally {
    hashingJobs--;
  }
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt);
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  const actual = await scrypt(password, salt);
  const target = Buffer.from(expected, "hex");
  return target.length === actual.length && timingSafeEqual(target, actual);
}
export function tokenHash(token: string, config: Config) {
  return createHmac("sha256", config.SESSION_PEPPER)
    .update(token)
    .digest("hex");
}
export async function throttle(key: string, config: Config, max: number) {
  const bucket = Math.floor(Date.now() / 900000);
  const hash = tokenHash(`throttle:${key}:${bucket}`, config);
  const entry = await Throttle.findOneAndUpdate(
    { _id: hash },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date((bucket + 2) * 900000) },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (entry.count > max)
    fail(429, "RATE_LIMITED", "Too many attempts; retry later");
}
export async function createUser(
  input: { name: string; phone: string; password: string },
  role: Role = "buyer",
) {
  const { password, ...profile } = input;
  return User.create({
    ...profile,
    passwordHash: await hashPassword(password),
    role,
    active: true,
  });
}
export async function login(
  input: { phone: string; password: string },
  config: Config,
  ip: string,
) {
  await throttle(`ip:${ip}`, config, 100);
  await throttle(`account:${input.phone}`, config, 10);
  const user = await User.findOne({ phone: input.phone }).select(
    "+passwordHash",
  );
  // A real scrypt even for unknown users avoids an easy timing enumeration oracle.
  const dummy = `${"0".repeat(32)}:${"0".repeat(128)}`;
  const valid = await verifyPassword(
    input.password,
    user?.passwordHash ?? dummy,
  );
  if (!user || !valid || !user.active)
    fail(401, "INVALID_CREDENTIALS", "Invalid phone or password");
  return issueSession(user,config);
}
export async function issueSession(user:UserRecord,config:Config,googleUid?:string){
  const token = randomBytes(32).toString("base64url");
  await mongoose.connection.transaction(async session=>{
    const current=await User.findOneAndUpdate({_id:user._id,passwordHash:user.passwordHash,active:true,$or:[{authVersion:user.authVersion ?? 0},...((user.authVersion ?? 0)===0 ? [{authVersion:{$exists:false}}] : [])]},{$inc:{authVersion:1,authRevision:1},...(googleUid ? {$set:{googleUid}} : {})},{session,returnDocument:"after"});
    if(!current)fail(401,"INVALID_CREDENTIALS","Credentials changed. Sign in again.");
    await Session.deleteMany({userId:current._id}).session(session);
    await Session.create([{_id:tokenHash(token,config),userId:current._id,authVersion:current.authVersion ?? 0,expiresAt:new Date(Date.now()+config.SESSION_TTL_HOURS*3600000)}],{session});
  });
  return {
    userId: user._id,
    name: user.name,
    role: user.role,
    token,
    isDemo: false,
  };
}
export async function secureAccount(userId:string,currentPassword:string,newPassword:string|undefined,config:Config){
  await throttle(`account-security:${userId}`,config,5);
  const user=await User.findOne({_id:userId,active:true}).select("+passwordHash");
  if(!user || !await verifyPassword(currentPassword,user.passwordHash))fail(403,"CURRENT_PASSWORD_INVALID","Current password is incorrect");
  if(newPassword===currentPassword)fail(400,"PASSWORD_UNCHANGED","Choose a different new password");
  const nextHash=newPassword===undefined ? undefined : await hashPassword(newPassword);
  await mongoose.connection.transaction(async session=>{
    const changed=await User.findOneAndUpdate({_id:userId,active:true,passwordHash:user.passwordHash,$or:[{authVersion:user.authVersion ?? 0},...((user.authVersion ?? 0)===0 ? [{authVersion:{$exists:false}}] : [])]},{$inc:{authVersion:1,authRevision:1},...(nextHash ? {$set:{passwordHash:nextHash}} : {})},{session,returnDocument:"after"});
    if(!changed)fail(409,"ACCOUNT_CHANGED","Account credentials changed. Sign in again before retrying.");
    await Session.deleteMany({userId}).session(session);
  });
}
