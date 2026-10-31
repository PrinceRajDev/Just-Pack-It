import { Router } from "express";
import { z } from "zod";
import { actor } from "../auth/middleware.js";
import { fail } from "../common/errors.js";
import { cartReviewInput, readCartReview } from "./routes.js";
import { readFulfilment } from "./fulfilment.js";
import type {Config} from "../config/env.js";
const inputSchema=cartReviewInput.safeExtend({addressId:z.uuid(),addressVersion:z.number().int().nonnegative(),fulfilments:z.array(z.object({shopId:z.uuid(),method:z.enum(["pickup","seller_delivery","platform_delivery"])}).strict()).max(100)}).superRefine((input,context)=>{
  if(new Set(input.fulfilments.map(choice=>choice.shopId)).size!==input.fulfilments.length) context.addIssue({code:"custom",path:["fulfilments"],message:"Duplicate shop selections"});
});
export function checkoutReviewRoutes(config:Config){
  const router=Router();
  router.post("/review",async(req,res)=>{
    res.setHeader("Cache-Control","private, no-store");
    const input=inputSchema.parse(req.body),now=new Date();
    // Resolve ownership before catalogue reads, including when every listing is unavailable.
    const delivery=await readFulfilment(actor(req).id,{addressId:input.addressId,shopIds:[]},now,config);
    const cart=await readCartReview({areaId:input.areaId,items:input.items},now);
    const shopIds=cart.shops.map(group=>group.shop.id);
    if(input.fulfilments.some(choice=>!shopIds.includes(choice.shopId))) fail(400,"INVALID_SHOP_SELECTION","A fulfilment selection does not belong to this bag");
    const coverage=await readFulfilment(actor(req).id,{addressId:input.addressId,shopIds},now,config);
    const ordering=config.ORDERS_COD_ENABLED || config.RAZORPAY_ENABLED;
    const issues:{code:string;message:string}[]=ordering ? [] : [{code:"FINAL_QUOTE_PENDING",message:"Ordering is not enabled."}];
    if(input.addressVersion!==coverage.addressVersion || delivery.addressVersion!==coverage.addressVersion) issues.push({code:"ADDRESS_CHANGED",message:"Your saved address changed. Reload addresses and review again."});
    const selected=cart.shops.map(group=>{
      const choice=input.fulfilments.find(choice=>choice.shopId===group.shop.id);
      const status=coverage.shops.find(shop=>shop.shopId===group.shop.id);
      const option=status?.options.find(option=>option.method===choice?.method);
      const methodIssues=[...(status?.issues ?? [])];
      if(!choice) methodIssues.push({code:"METHOD_REQUIRED",message:"Choose delivery or pickup for this shop."});
      else if(!option || option.status!=="eligible") methodIssues.push({code:"METHOD_UNAVAILABLE",message:option?.message ?? "The selected method is unavailable for this shop."});
      else if(option.listedFee===null) methodIssues.push({code:"DELIVERY_FEE_UNKNOWN",message:"This shop has not supplied a delivery fee."});
      return {shopId:group.shop.id,method:choice?.method ?? null,listedFee:option?.status==="eligible" ? option.listedFee : null,issues:methodIssues};
    });
    const valid=issues.length===0 && cart.lines.every(line=>line.issues.length===0) && cart.shops.every(group=>group.issues.length===0) && selected.every(choice=>choice.issues.length===0 && choice.listedFee!==null) && actor(req).role==="buyer";
    const deliveryCents=selected.reduce((sum,choice)=>sum+Math.round((choice.listedFee ?? 0)*100),0);
    res.json({...cart,addressId:input.addressId,addressVersion:coverage.addressVersion,fulfilments:selected,issues,checkoutAvailable:valid,deliveryTotal:valid ? deliveryCents/100 : null,grandTotal:valid ? (Math.round(cart.itemsSubtotal*100)+deliveryCents)/100 : null,paymentMethods:valid ? [...(config.ORDERS_COD_ENABLED ? ["cod"] : []),...(config.RAZORPAY_ENABLED ? ["razorpay"] : [])] : [],pricingPolicy:ordering ? "tax_inclusive_listed_delivery_no_extras_v1" : null});
  });
  return router;
}
