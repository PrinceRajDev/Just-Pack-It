import { Partner } from "./models.js";
import { User } from "../auth/models.js";
export async function deliveryAvailable(areaIds:string[]) {
 const active=await User.find({role:"delivery",active:true}).distinct("_id");
 return !!await Partner.exists({_id:{$in:active},approved:true,online:true,seenAt:{$gt:new Date(Date.now()-90000)},areaIds:{$in:areaIds},activeTask:{$exists:false}});
}
