import { request } from "./api";

type Queue = {count:number};
export type AdminOverview = {
  asOf:string;
  totals:{shops:number;products:number};
  pendingShops:Queue;
  support:Queue;
  staleSuborders:Queue;
  payments:Queue;
  refunds:Queue;
};
export type AdminShop = {
  id:string;
  name:string;
  status:"pending" | "approved" | "rejected" | "suspended";
  version:number;
  address?:string;
  locality?:string;
  description?:string;
  coverImage?:string;
  categories:string[];
  serviceAreaIds:string[];
  fulfilment:string[];
  since?:number;
  location?:{coordinates:[number,number]};
};

export const adminApi={
  overview:(token:string)=>request<AdminOverview>("/admin/operations",token),
  pendingShops:async(token:string,cursor?:string)=>{
    let next:string|undefined;
    const query=new URLSearchParams({status:"pending",limit:"20",...(cursor ? {cursor} : {})});
    const items=await request<AdminShop[]>(`/admin/shops?${query}`,token,{},headers=>{next=headers.get("x-next-cursor") ?? undefined;});
    return {items,next};
  },
  review:(token:string,shop:AdminShop,status:"approved"|"rejected",reason?:string)=>request<AdminShop>(
    `/admin/shops/${encodeURIComponent(shop.id)}/approval`,token,{method:"PATCH",body:JSON.stringify({version:shop.version,status,...(reason ? {reason} : {})})},
  ),
};
