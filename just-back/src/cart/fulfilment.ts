import {deliveryAvailable} from "../delivery/coverage.js";
import type {Config} from "../config/env.js";
import {pinCoverage} from "../addresses/serviceability.js";
import { Router } from "express";
import { z } from "zod";
import { actor } from "../auth/middleware.js";
import { Address } from "../addresses/routes.js";
import { Area, Category, Shop } from "../catalogue/models.js";
import { isOpen } from "../catalogue/presenters.js";
import { fail } from "../common/errors.js";
import {activeSellerIds} from "../catalogue/owner-eligibility.js";
const inputSchema=z.object({addressId:z.uuid(),shopIds:z.array(z.uuid()).min(1).max(100).refine(ids=>new Set(ids).size===ids.length,"Duplicate shops")}).strict();
export function fulfilmentRoutes(config:Config){
  const router=Router();
  router.post("/fulfilment",async(req,res)=>{
    res.setHeader("Cache-Control","private, no-store");
    const input=inputSchema.parse(req.body);
    res.json(await readFulfilment(actor(req).id,input,new Date(),config));
  });
  return router;
}
export async function readFulfilment(userId:string,input:z.infer<typeof inputSchema>,now=new Date(),config?:Config) {
    const address=await Address.findOne({_id:input.addressId,userId}).lean();
    if(!address) fail(404,"NOT_FOUND","Address not found");
    const [areas,categories]=await Promise.all([Area.find({active:true,pincodes:address.pincode}).lean(),Category.find({active:true}).lean()]);
    const shops=await Shop.find({_id:{$in:input.shopIds},ownerId:{$in:await activeSellerIds()},active:true,status:"approved",categoryIds:{$in:categories.map(category=>category._id)}}).lean();
    const riders=config?.PLATFORM_DELIVERY_ENABLED?await deliveryAvailable(areas.map(a=>a._id)):false;
    return {checkedAt:now.toISOString(),addressId:address._id,addressVersion:address.version,checkoutAvailable:false,reserved:false,shops:input.shopIds.map(shopId=>{
      const shop=shops.find(shop=>shop._id===shopId);
      if(!shop) return {shopId,options:[],issues:[{code:"SHOP_UNAVAILABLE",message:"This shop is unavailable."}]};
      if(shop.ownerId===userId) return {shopId,options:[],issues:[{code:"OWN_SHOP_PURCHASE",message:"You cannot buy from your own shop."}]};
      const open=isOpen(shop,now),covered=areas.some(area=>shop.areaIds.includes(area._id));
      return {shopId,issues:open ? [] : [{code:"SHOP_CLOSED",message:"This shop is currently closed."}],options:shop.fulfilment.map(method=>{
        if(!open) return {method,status:"unavailable",listedFee:null,message:"Shop is closed."};
        if(method==="pickup") return {method,status:"eligible",listedFee:0,message:"Pickup is listed by this shop. Collect from the shop."};
        if(!covered) return {method,status:"unavailable",listedFee:null,message:"Your address pincode is outside this shop's configured delivery areas."};
        if(method==="platform_delivery"&&!config?.PLATFORM_DELIVERY_ENABLED)return {method,status:"unverified",listedFee:null,message:"Platform delivery is not enabled."};
        if(method==="platform_delivery" && !riders) return {method,status:"unavailable",listedFee:null,message:"No approved available platform partner in this area."};
        if(method==="platform_delivery" && (!address.location||!shop.location))return {method,status:"unavailable",listedFee:null,message:"Delivery and shop pins are required for platform delivery."};
        const pinIssue=pinCoverage(address.location,shop.location);if(pinIssue)return {method,status:"unavailable",listedFee:null,message:pinIssue.message};
        return {method,status:"eligible",listedFee:shop.deliveryFeeCents===undefined ? null : shop.deliveryFeeCents/100,message:address.location ? "Pincode and delivery pin pass configured coverage checks (within 6 km straight-line). Final charges are not yet quoted." : "Pincode coverage matches; no delivery pin is saved, so exact location distance has not been checked. Final charges are not yet quoted."};
      })};
    })};
}
