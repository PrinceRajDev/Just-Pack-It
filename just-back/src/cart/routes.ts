import {Router} from "express";
import {z} from "zod";
import {id} from "../common/validation.js";
import {publicReferences,eligibleShopFilter} from "../catalogue/public-service.js";
import {Shop,Product} from "../catalogue/models.js";
import {productDto,shopDto,isOpen} from "../catalogue/presenters.js";
const line=z.object({productId:id,variantId:id.optional(),qty:z.number().int().min(1).max(999)}).strict();
export const cartReviewInput=z.object({areaId:id,items:z.array(line).min(1).max(100)}).strict().superRefine((input,context)=>{
  const keys=input.items.map(item=>`${item.productId}:${item.variantId ?? ""}`);
  if(new Set(keys).size!==keys.length)context.addIssue({code:"custom",path:["items"],message:"Duplicate cart lines are not allowed"});
});
type Issue={code:string;message:string};
export function cartRoutes() {
  const router=Router();
  router.post("/quote",async(req,res)=>{
    const input=cartReviewInput.parse(req.body);
    res.json(await readCartReview(input));
  });
  return router;
}
export async function readCartReview(input:z.infer<typeof cartReviewInput>,now=new Date()) {
    const refs=await publicReferences(input.areaId);
    const candidates=await Product.find({_id:{$in:input.items.map(item=>item.productId)},active:true,"moderation.blocked":{$ne:true},categoryId:{$in:refs.categories.map(category=>category._id)}}).lean();
    const eligible=await Shop.find({...eligibleShopFilter(refs,input.areaId),_id:{$in:candidates.map(product=>product.shopId)}}).lean();
    const groups=new Map<string,{shop:ReturnType<typeof shopDto>;subtotalCents:number;issues:Issue[]}>();
    const lines=input.items.map(item=>{
      const product=candidates.find(product=>product._id===item.productId);
      const shop=product ? eligible.find(shop=>shop._id===product.shopId && shop.categoryIds.includes(product.categoryId)) : undefined;
      if(!product || !shop || (product.subcategoryId && !refs.categories.find(category=>category._id===product.categoryId)?.subcategories.some(sub=>sub._id===product.subcategoryId && sub.active))) return {...item,issues:[{code:"PRODUCT_UNAVAILABLE",message:"This listing is unavailable in your selected area. Remove it from your bag."}]};
      const dto={...shopDto(shop,refs.categories),isOpen:isOpen(shop,now)};
      let group=groups.get(shop._id);
      if(!group){group={shop:dto,subtotalCents:0,issues:dto.isOpen ? [] : [{code:"SHOP_CLOSED",message:"This shop is currently closed."}]};groups.set(shop._id,group);}
      const variants=product.variants.filter(variant=>variant.active);
      const variant=item.variantId ? variants.find(variant=>variant._id===item.variantId) : undefined;
      const publicProduct=productDto(product,refs.categories);
      if((variants.length && !variant) || (item.variantId && !variant)) return {...item,shopId:shop._id,product:publicProduct,issues:[{code:item.variantId ? "VARIANT_UNAVAILABLE" : "VARIANT_REQUIRED",message:"Choose an available option for this product."}]};
      const priceCents=variant?.priceCents ?? product.priceCents,stock=variant?.stock ?? product.stock;
      const totalCents=priceCents*item.qty;group.subtotalCents+=totalCents;
      const issues:Issue[]=stock<=0 ? [{code:"OUT_OF_STOCK",message:"This item is out of stock."}] : item.qty>stock ? [{code:"INSUFFICIENT_STOCK",message:`Only ${stock} available; reduce the quantity.`}] : [];
      return {...item,shopId:shop._id,product:publicProduct,unitPrice:priceCents/100,lineTotal:totalCents/100,availableStock:stock,issues};
    });
    for(const group of groups.values()) {
      const minimum=group.shop.minimumOrderAmount;
      if(minimum!==undefined && group.subtotalCents<Math.round(minimum*100)) group.issues.push({code:"MINIMUM_NOT_MET",message:`Shop item minimum is ₹${minimum}; add ₹${(Math.round(minimum*100)-group.subtotalCents)/100} more in items.`});
    }
    return {checkedAt:now.toISOString(),areaId:input.areaId,currency:"INR",reserved:false,checkoutAvailable:false,lines,shops:[...groups.values()].map(group=>({shop:group.shop,itemsSubtotal:group.subtotalCents/100,issues:group.issues})),itemsSubtotal:[...groups.values()].reduce((sum,group)=>sum+group.subtotalCents,0)/100,deliveryTotal:null,grandTotal:null};
}
