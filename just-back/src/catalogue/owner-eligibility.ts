import type {ClientSession} from "mongoose";
import {User} from "../auth/models.js";
import {fail} from "../common/errors.js";

export async function activeSellerIds():Promise<string[]> {
  return User.find({role:"seller",active:true}).distinct("_id");
}

/** Write the same account document as admin access changes to fence checkout races. */
export async function fenceSellerPurchase(ownerId:string,session:ClientSession) {
  const result=await User.updateOne({_id:ownerId,role:"seller",active:true},{$inc:{authRevision:1}},{session});
  if(result.matchedCount!==1)fail(409,"SHOP_UNAVAILABLE","A shop cannot accept new purchases");
}
