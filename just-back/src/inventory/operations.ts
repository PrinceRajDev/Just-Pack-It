import {Router} from "express";
import {InventoryReservation} from "./models.js";
import type {Config} from "../config/env.js";

export async function verifyInventoryIndexes(){
  const indexes=await InventoryReservation.collection.indexes();
  if(indexes.some(index=>index.expireAfterSeconds!==undefined))throw new Error("Inventory ledger must not have TTL indexes");
  if(!indexes.some(index=>index.key.state===1 && index.key.expiresAt===1 && index.key._id===1))throw new Error("Inventory recovery index missing");
}
export function inventoryAdminRoutes(config:Config){
  const router=Router();
  router.get("/inventory",async(_req,res)=>{
    res.setHeader("Cache-Control","private, no-store");
    const now=new Date(),overdue={state:"held" as const,expiresAt:{$lte:now}};
    const [heldCount,overdueCount,retryingCount,oldest]=await Promise.all([
      InventoryReservation.countDocuments({state:"held"}),InventoryReservation.countDocuments(overdue),
      InventoryReservation.countDocuments({...overdue,failureCount:{$gt:0}}),
      InventoryReservation.findOne(overdue).sort({expiresAt:1,_id:1}).select("expiresAt").lean(),
    ]);
    res.json({checkedAt:now.toISOString(),workerConfigured:config.INVENTORY_EXPIRY_WORKER_ENABLED,heldCount,overdueCount,retryingCount,oldestOverdueSeconds:oldest ? Math.max(0,Math.floor((now.getTime()-oldest.expiresAt.getTime())/1000)) : null});
  });
  return router;
}
