import { Schema, model } from "mongoose";
import { randomUUID } from "node:crypto";
export const roles = ["buyer", "seller", "delivery", "admin"] as const;
export type Role = (typeof roles)[number];
export interface UserRecord {
  _id: string;
  name: string;
  phone: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  accessVersion?:number;
  createdAt?:Date;
  profileVersion?:number;
  authVersion?:number;
  authRevision?:number;
  email?:string;
  emailVerifiedAt?:Date;
}
const userSchema = new Schema<UserRecord>(
  {
    _id: { type: String, default: () => randomUUID() },
    name: { type: String, required: true },
    accessVersion:{type:Number,default:0},
    profileVersion:{type:Number,default:0},
    phone: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: roles, default: "buyer" },
    active: { type: Boolean, default: true },
    authVersion:{type:Number,default:0},
    authRevision:{type:Number,default:0},
    email:String,
    emailVerifiedAt:Date,
  },
  { timestamps: true },
);
userSchema.index({email:1},{unique:true,partialFilterExpression:{email:{$type:"string"}}});
export const User = model<UserRecord>("User", userSchema);
export interface SessionRecord {
  _id: string;
  userId: string;
  expiresAt: Date;
  authVersion?:number;
}
const sessionSchema = new Schema<SessionRecord>(
  {
    _id: String,
    userId: { type: String, required: true, index: true },
    authVersion:{type:Number,default:0},
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true },
);
export const Session = model<SessionRecord>("Session", sessionSchema);
export interface ThrottleRecord {
  _id: string;
  count: number;
  expiresAt: Date;
}
const throttleSchema = new Schema<ThrottleRecord>({
  _id: String,
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
});
export const Throttle = model<ThrottleRecord>("AuthThrottle", throttleSchema);
