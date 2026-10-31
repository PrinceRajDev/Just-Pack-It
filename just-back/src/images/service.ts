import sharp from "sharp";
import {randomBytes} from "node:crypto";
import type {Config} from "../config/env.js";
import {fail} from "../common/errors.js";
import {putR2,deleteR2} from "./r2.js";
export const MAX_IMAGE_BYTES=5*1024*1024;
export const IMAGE_TYPES=["image/jpeg","image/png","image/webp"];
export const uploadsEnabled=(config:Config)=>config.IMAGE_STORAGE_PROVIDER==="r2" ? !!(config.CLOUDFLARE_ACCOUNT_ID && config.CLOUDFLARE_R2_ACCESS_KEY_ID && config.CLOUDFLARE_R2_SECRET_ACCESS_KEY && config.CLOUDFLARE_R2_BUCKET && config.CLOUDFLARE_R2_PUBLIC_BASE_URL) : !!(config.CLOUDFLARE_ACCOUNT_ID && config.CLOUDFLARE_IMAGES_API_TOKEN && config.CLOUDFLARE_IMAGES_ACCOUNT_HASH);
export async function prepareImage(data:Buffer, type:string) {
  if(!Buffer.isBuffer(data) || !data.length) fail(400,"EMPTY_IMAGE","Choose a photo to upload");
  if(data.length>MAX_IMAGE_BYTES) fail(413,"IMAGE_TOO_LARGE","Photos must be at most 5 MiB");
  try {
    const image=sharp(data,{limitInputPixels:25000000,failOn:"warning"});
    const metadata=await image.metadata();
    const actualType=metadata.format==="jpeg" ? "image/jpeg" : metadata.format==="png" ? "image/png" : metadata.format==="webp" ? "image/webp" : undefined;
    if(actualType!==type || (metadata.pages ?? 1)>1) fail(415,"INVALID_IMAGE","Use a non-animated JPEG, PNG or WebP photo matching its declared type");
    return await image.rotate().resize({width:1600,height:1600,fit:"inside",withoutEnlargement:true}).webp({quality:85}).toBuffer();
  } catch(error) {
    if(error && typeof error==="object" && "code" in error && error.code==="INVALID_IMAGE") throw error;
    return fail(415,"INVALID_IMAGE","Photo could not be decoded safely. Use a JPEG, PNG or WebP under 25 megapixels");
  }
}
const endpoint=(config:Config)=>`https://api.cloudflare.com/client/v4/accounts/${config.CLOUDFLARE_ACCOUNT_ID}/images/v1`;
export async function cleanupImage(config:Config,id:string) {
  try {
    if(config.IMAGE_STORAGE_PROVIDER==="r2"){await deleteR2(config,id);return;}
    const response=await fetch(`${endpoint(config)}/${id}`,{method:"DELETE",headers:{Authorization:`Bearer ${config.CLOUDFLARE_IMAGES_API_TOKEN}`},signal:AbortSignal.timeout(10000),redirect:"error"});
    if(!response.ok && response.status!==404) throw Error();
  } catch {console.warn("New unattached image cleanup needs operator reconciliation",id);}
}
export async function storeImage(config:Config,data:Buffer,ownerId:string,productId:string,kind:"product"|"shop"="product") {
  if(!uploadsEnabled(config))return fail(503,"IMAGE_UPLOAD_UNAVAILABLE","Photo storage is not configured");
  if(config.IMAGE_STORAGE_PROVIDER==="r2"){
    const id=`${kind==="shop" ? "shops" : "products"}/${randomBytes(16).toString("hex")}.webp`;
    try{await putR2(config,id,data);return {id,url:`${config.CLOUDFLARE_R2_PUBLIC_BASE_URL!.replace(/\/$/,"")}/${id}`};}
    catch{await cleanupImage(config,id);return fail(502,"IMAGE_PROVIDER_ERROR","Photo storage could not complete. Retry shortly");}
  }
  const id=randomBytes(16).toString("hex");
  const form=new FormData();
  form.set("id",id);form.set("file",new Blob([new Uint8Array(data)],{type:"image/webp"}),"product.webp");
  form.set("metadata",JSON.stringify({ownerId,...(kind==="shop" ? {shopId:productId} : {productId})}));form.set("requireSignedURLs","false");
  try {
    const response=await fetch(endpoint(config),{method:"POST",headers:{Authorization:`Bearer ${config.CLOUDFLARE_IMAGES_API_TOKEN}`},body:form,signal:AbortSignal.timeout(20000),redirect:"error"});
    const result=await response.json();
    if(!response.ok || result?.success!==true || result?.result?.id!==id) throw Error();
    return {id,url:`https://imagedelivery.net/${config.CLOUDFLARE_IMAGES_ACCOUNT_HASH}/${id}/${config.CLOUDFLARE_IMAGES_VARIANT}`};
  } catch {
    // Only the ID generated for this attempt may be cleaned up; never delete a previous image.
    await cleanupImage(config,id);
    return fail(502,"IMAGE_PROVIDER_ERROR","Photo storage could not complete. Retry shortly");
  }
}
