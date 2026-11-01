import {createHash} from "node:crypto";
import {z} from "zod";
import {InventoryReservation,type ReservationRecord,type HeldLine} from "./models.js";
import {User} from "../auth/models.js";
import {Category,Shop,Product} from "../catalogue/models.js";
import {transaction,deriveProduct,touchReferences} from "../catalogue/service.js";
import {isOpen} from "../catalogue/presenters.js";
import {fail,AppError} from "../common/errors.js";
import type {Actor} from "../auth/middleware.js";
import type {ClientSession} from "mongoose";
import {fenceSellerPurchase} from "../catalogue/owner-eligibility.js";
const lineSchema=z.object({productId:z.uuid(),variantId:z.uuid().optional(),qty:z.number().int().min(1).max(999)}).strict();
const inputSchema=z.object({key:z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),items:z.array(lineSchema).min(1).max(100)}).strict().superRefine((input,ctx)=>{
  if(new Set(input.items.map(line=>`${line.productId}:${line.variantId ?? ""}`)).size!==input.items.length)ctx.addIssue({code:"custom",path:["items"],message:"Duplicate SKU lines"});
});
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function reserveInventory(who:Actor,raw:z.infer<typeof inputSchema>,existingSession?:ClientSession):Promise<ReservationRecord>{
  if(who.role!=="buyer")fail(403,"FORBIDDEN","Only buyers may reserve inventory");
  const input=inputSchema.parse(raw);
  const items=[...input.items].sort((a,b)=>`${a.productId}:${a.variantId ?? ""}`.localeCompare(`${b.productId}:${b.variantId ?? ""}`));
  const fingerprint=hash(items.map(item=>[item.productId,item.variantId ?? null,item.qty])),id=hash([who.id,input.key]);
  const replay=(record:ReservationRecord)=>{
    if(record.fingerprint!==fingerprint)fail(409,"IDEMPOTENCY_CONFLICT","Request key was already used for a different bag");
    return record;
  };
  const create=async(session:ClientSession)=>{
      if(!await User.exists({_id:who.id,role:"buyer",active:true}).session(session))fail(403,"FORBIDDEN","Active buyer account required");
      const previous=await InventoryReservation.findById(id).session(session).lean();
      if(previous)return replay(previous);
      const now=new Date(),lines:HeldLine[]=[];
      // Sequential document operations are intentional inside a MongoDB transaction.
      for(const item of items){
        const product=await Product.findOne({_id:item.productId,active:true,"moderation.blocked":{$ne:true}}).session(session);
        if(!product)fail(409,"LISTING_UNAVAILABLE","A listing is no longer available");
        const shop=await Shop.findOne({_id:product.shopId,active:true,status:"approved"}).session(session);
        if(!shop || !isOpen(shop,now) || !shop.categoryIds.includes(product.categoryId))fail(409,"SHOP_UNAVAILABLE","A shop cannot accept inventory holds");
        await fenceSellerPurchase(shop.ownerId,session);
        const category=await Category.findOne({_id:product.categoryId,active:true}).session(session);
        if(!category || (product.subcategoryId && !category.subcategories.some(sub=>sub._id===product.subcategoryId && sub.active)))fail(409,"LISTING_UNAVAILABLE","A listing category is unavailable");
        await Shop.updateOne({_id:shop._id},{$inc:{revision:1}},{session});
        await touchReferences([product.categoryId],product.subcategoryId ? [product.subcategoryId] : [],[],session);
        const active=product.variants.filter(variant=>variant.active),variant=item.variantId ? active.find(variant=>variant._id===item.variantId) : undefined;
        if((active.length && !variant) || (item.variantId && !variant))fail(409,"VARIANT_UNAVAILABLE","Choose a variant belonging to this listing");
        const stock=variant?.stock ?? product.stock;
        if(stock<item.qty)fail(409,"INSUFFICIENT_STOCK","Requested quantity is no longer available");
        lines.push({...item,shopId:product.shopId,priceCents:variant?.priceCents ?? product.priceCents});
        if(variant)variant.stock-=item.qty;else product.stock-=item.qty;
        deriveProduct(product);await product.save({session});
      }
      const [record]=await InventoryReservation.create([{_id:id,buyerId:who.id,fingerprint,state:"held",createdAt:now,expiresAt:new Date(now.getTime()+10*60*1000),lines}],{session});
      return record!.toObject();
    };
  if(existingSession)return create(existingSession);
  try {
    return await transaction(create);
  } catch(error){
    // Concurrent requests can race on the built-in unique reservation identifier.
    if(typeof error==="object" && error && "code" in error && error.code===11000){
      const existing=await InventoryReservation.findById(id).lean();if(existing)return replay(existing);
    }
    throw error;
  }
}
async function restore(id:string,buyerId:string|undefined,expiredOnly:boolean){
  return transaction(async session=>{
    const record=await InventoryReservation.findOne({_id:id,...(buyerId ? {buyerId} : {})}).session(session);
    if(!record)fail(404,"NOT_FOUND","Inventory hold not found");
    if(record.state!=="held")return record.toObject();
    const now=new Date();
    if(expiredOnly && record.expiresAt>now)return record.toObject();
    // Lock the hold before product writes; transaction retries resolve concurrent releases.
    const state=record.expiresAt<=now ? "expired" : "released";
    await InventoryReservation.updateOne({_id:id,state:"held"},{$set:{state,releasedAt:now}},{session});
    for(const line of record.lines){
      const product=await Product.findById(line.productId).session(session);
      if(!product)fail(409,"INVENTORY_INVARIANT","Held listing is missing; reconciliation required");
      if(line.variantId){
        const variant=product.variants.find(variant=>variant._id===line.variantId);
        if(!variant)fail(409,"INVENTORY_INVARIANT","Held variant is missing; reconciliation required");
        variant.stock+=line.qty;
      } else product.stock+=line.qty;
      deriveProduct(product);await product.save({session});
    }
    record.state=state;record.releasedAt=now;return record.toObject();
  });
}
export function releaseInventory(who:Actor,id:string){
  if(who.role!=="buyer")fail(403,"FORBIDDEN","Only buyers may release their holds");
  return restore(z.string().regex(/^[a-f0-9]{64}$/).parse(id),who.id,false);
}
/** Operator worker primitive: never scheduled automatically by the HTTP application. */
export async function releaseExpiredInventory(limit=100){
  return (await sweepExpiredInventory(limit)).examined;
}
export async function sweepExpiredInventory(limit=100){
  z.number().int().min(1).max(100).parse(limit);
  const now=new Date();
  const records=await InventoryReservation.find({state:"held",expiresAt:{$lte:now},$or:[{nextAttemptAt:{$exists:false}},{nextAttemptAt:{$lte:now}}]}).sort({expiresAt:1,_id:1}).limit(limit).select("_id failureCount").lean();
  const result={examined:records.length,completed:0,failed:0};
  for(const record of records){
    try {await restore(record._id,undefined,true);result.completed++;}
    catch(error){
      const code=error instanceof AppError ? error.code : "INVENTORY_SWEEP_FAILED";
      const delay=Math.min(300_000,60_000*2**Math.min(record.failureCount ?? 0,3));
      await InventoryReservation.updateOne({_id:record._id,state:"held"},{$inc:{failureCount:1},$set:{lastFailureCode:code,nextAttemptAt:new Date(Date.now()+delay)}});
      result.failed++;
    }
  }
  return result;
}
