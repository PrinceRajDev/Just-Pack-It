import express,{Router} from "express";
import {z} from "zod";
import type {Config} from "../config/env.js";
import {actor} from "../auth/middleware.js";
import {throttle} from "../auth/service.js";
import {ownedShop,mutateProduct,transaction,checkVersion} from "../catalogue/service.js";
import {Product,Category,Shop} from "../catalogue/models.js";
import {productDto,shopDto} from "../catalogue/presenters.js";
import {notify} from "../notifications/service.js";
import {id as uuid} from "../common/validation.js";
import {fail} from "../common/errors.js";
import {MAX_IMAGE_BYTES,IMAGE_TYPES,uploadsEnabled,prepareImage,storeImage,cleanupImage} from "./service.js";
let jobs=0;
export function imageRoutes(config:Config) {
  const router=Router();
  router.get("/image-upload",(_req,res)=>res.json({enabled:uploadsEnabled(config),maxBytes:MAX_IMAGE_BYTES,types:IMAGE_TYPES}));
  router.post("/shop/image",async(req,res,next)=>{
    const who=actor(req),shop=await ownedShop(who);
    const version=z.string().regex(/^\d{1,12}$/).transform(Number).parse(req.get("X-Shop-Version"));checkVersion(shop.version,version);
    const type=req.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    if(!type || !IMAGE_TYPES.includes(type))fail(415,"INVALID_IMAGE_TYPE","Use JPEG, PNG or WebP photos");
    if(!uploadsEnabled(config))fail(503,"IMAGE_UPLOAD_UNAVAILABLE","Photo storage is not configured");
    await throttle(`image-upload:${who.id}`,config,20);
    if(jobs>=2)fail(503,"IMAGE_UPLOAD_BUSY","Photo processing is busy. Retry shortly");
    jobs++;let released=false;const release=()=>{if(!released){released=true;jobs--;}};
    res.locals.imageRelease=release;res.locals.imageProcessing=false;res.locals.imageVersion=version;
    res.once("finish",release);res.once("close",()=>{if(!res.locals.imageProcessing)release();});next();
  },express.raw({type:IMAGE_TYPES,limit:MAX_IMAGE_BYTES}),async(req,res)=>{
    res.locals.imageProcessing=true;
    try{
      if(res.destroyed)return;
      const who=actor(req),shop=await ownedShop(who);
      const data=await prepareImage(req.body,req.get("Content-Type")!.split(";")[0].trim().toLowerCase());
      const uploaded=await storeImage(config,data,who.id,shop._id,"shop");
      let saved;
      try{saved=await transaction(async session=>{
        const current=await ownedShop(who,session);checkVersion(current.version,res.locals.imageVersion);
        current.coverImage=uploaded.url;current.status="pending";await current.save({session});
        await notify(`${current._id}:photo:${current.version}`,{admin:true},"Shop photo needs review","A seller updated their shop photo. Review the shop profile.","/admin/partners",session);return current.toObject();
      });}catch(error){
        try{if(!await Shop.exists({coverImage:uploaded.url}))await cleanupImage(config,uploaded.id);}catch{console.warn("Shop image attachment needs reconciliation",uploaded.id);}throw error;
      }
      res.json({...shopDto(saved,await Category.find().lean()),status:saved.status,active:saved.active});
    }finally{res.locals.imageRelease();}
  });
  router.post("/products/:productId/image",async(req,res,next)=>{
    const who=actor(req);const productId=uuid.parse(req.params.productId);
    const version=z.string().regex(/^\d{1,12}$/).transform(Number).parse(req.get("X-Product-Version"));
    const type=req.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    if(!type || !IMAGE_TYPES.includes(type)) fail(415,"INVALID_IMAGE_TYPE","Use JPEG, PNG or WebP photos");
    const shop=await ownedShop(who);const product=await Product.findOne({_id:productId,shopId:shop._id});
    if(!product) fail(404,"PRODUCT_NOT_FOUND","Product not found");
    if(product.version!==version) fail(409,"VERSION_CONFLICT","Listing changed; reload before uploading");
    if(!uploadsEnabled(config)) fail(503,"IMAGE_UPLOAD_UNAVAILABLE","Photo uploads are not configured yet");
    await throttle(`image-upload:${who.id}`,config,20);
    if(jobs>=2) fail(503,"IMAGE_UPLOAD_BUSY","Photo processing is busy. Retry shortly");
    jobs++;
    let released=false;const release=()=>{if(!released){released=true;jobs--;}};
    res.locals.imageRelease=release;res.locals.imageProcessing=false;res.locals.imageVersion=version;
    res.once("finish",release);res.once("close",()=>{if(!res.locals.imageProcessing) release();});
    next();
  },express.raw({type:IMAGE_TYPES,limit:MAX_IMAGE_BYTES}),async(req,res)=>{
    res.locals.imageProcessing=true;
    try {
      if(res.destroyed) return;
      const who=actor(req),productId=uuid.parse(req.params.productId);
      const data=await prepareImage(req.body,req.get("Content-Type")!.split(";")[0].trim().toLowerCase());
      const uploaded=await storeImage(config,data,who.id,productId);
      let product;
      try {product=await mutateProduct(who,productId,res.locals.imageVersion,record=>{record.image=uploaded.url;});}
      catch(error){
        // An uncertain commit must never cause deletion of an image now referenced by a listing.
        try {if(!await Product.exists({image:uploaded.url})) await cleanupImage(config,uploaded.id);}
        catch {console.warn("Image attachment needs operator reconciliation",uploaded.id);}
        throw error;
      }
      const refs=await Category.find().lean();
      res.json({...productDto(product,refs),stock:product.stock,active:product.active});
    } finally {res.locals.imageRelease();}
  });
  return router;
}
