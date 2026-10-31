import { randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import { registerInput } from "./validators.js";
import { User, Session } from "./models.js";
import { hashPassword, tokenHash } from "./service.js";
import { shopCreate } from "../catalogue/validators.js";
import { createShop, transaction } from "../catalogue/service.js";
import { Area } from "../catalogue/models.js";
import type { Config } from "../config/env.js";
import { fail } from "../common/errors.js";
import {verifySignupEmail,consumeEmailProof} from "./email-otp.js";
const shop = shopCreate.pick({name:true,address:true,categoryIds:true,serviceAreaIds:true,since:true,fulfilment:true}).extend({address:z.string().trim().min(2).max(500)}).strict();
export const sellerRegistrationInput = registerInput.extend({shop}).strict();
export async function registerSeller(input:z.infer<typeof sellerRegistrationInput>, config:Config) {
  const proof=await verifySignupEmail(input,config);
  const passwordHash=await hashPassword(input.password);
  const userId=randomUUID();
  const token=randomBytes(32).toString("base64url");
  const base=input.shop.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,55).replace(/-$/g,"") || "shop";
  await transaction(async session=>{
    const verifiedEmail=await consumeEmailProof(proof,session);
    const area=await Area.findOne({_id:input.shop.serviceAreaIds[0],active:true}).session(session);
    if(!area) fail(400,"INVALID_AREA","Service area is not active");
    await User.create([{_id:userId,name:input.name,phone:input.phone,passwordHash,role:"seller",active:true,...verifiedEmail}],{session});
    await createShop({id:userId,role:"seller"},shopCreate.parse({...input.shop,slug:`${base}-${userId}`,locality:area.name,initials:input.shop.name.split(/\s+/).map(word=>word[0]).join("").slice(0,4).toUpperCase()}),session);
    await Session.create([{_id:tokenHash(token,config),userId,expiresAt:new Date(Date.now()+config.SESSION_TTL_HOURS*3600000)}],{session});
  });
  return {userId,name:input.name,role:"seller" as const,token,isDemo:false};
}
