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

export type AdminOrder = {
  id:string;
  createdAt:string;
  testMode:boolean;
  paymentMethod:string;
  paymentStatus:string;
  total:number;
  amountDue:number;
  cashRecordedAmount:number;
  cancelledAmount:number;
  subOrders:{id:string;shopName:string;status:string;amountDue:number;cancelReason?:string}[];
};
export type AdminCashFilter = "all" | "outstanding" | "recorded";

export const adminApi={
  orders:async(token:string, cash:AdminCashFilter, cursor?:string)=>{
    let next:string|undefined;
    const query=new URLSearchParams({cash,limit:"20",...(cursor ? {cursor} : {})});
    const items=await request<AdminOrder[]>(`/admin/orders?${query}`,token,{},headers=>{next=headers.get("x-next-cursor") ?? undefined;});
    return {items,next};
  },
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
