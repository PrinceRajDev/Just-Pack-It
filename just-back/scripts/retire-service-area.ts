import "dotenv/config";
import mongoose from "mongoose";
import {Area,Shop} from "../src/catalogue/models.js";
async function main(){
 const name=process.argv[2]?.trim();if(!name||name.length>100)throw new Error("Provide exact area name");
 if(!process.env.MONGODB_URI)throw new Error("Database is not configured");
 await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:10000});
 const matches=await Area.find({name:{$regex:`^${name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}$`,$options:"i"}}).lean();
 if(matches.length!==1){console.log(JSON.stringify({status:"not_changed",matches:matches.map(a=>({id:a._id,name:a.name,active:a.active}))}));return;}
 const area=matches[0]!;const shops=await Shop.countDocuments({areaIds:area._id});
 if(!process.argv.includes("--apply")){console.log(JSON.stringify({status:"inspection",id:area._id,name:area.name,active:area.active,assignedShops:shops}));return;}
 if(shops)throw new Error("Area has shop assignments; no changes made");
 if(process.argv.includes("--delete-inactive")){
  if(area.active)throw new Error("Only inactive unassigned records can be removed");
  await mongoose.connection.transaction(async session=>{
   if(await Shop.exists({areaIds:area._id}).session(session))throw new Error("Area is assigned; no changes made");
   const result=await Area.deleteOne({_id:area._id,version:area.version,active:false},{session});
   if(result.deletedCount!==1)throw new Error("Record changed; inspect again");
  });
  console.log(JSON.stringify({status:"removed",id:area._id,name:area.name,remaining:await Area.countDocuments({_id:area._id})}));return;
 }
 if(!area.active){console.log(JSON.stringify({status:"already_inactive",id:area._id,name:area.name}));return;}
 await mongoose.connection.transaction(async session=>{if(await Shop.exists({areaIds:area._id}).session(session))throw new Error("Area has shop assignments; no changes made");const result=await Area.updateOne({_id:area._id,version:area.version,active:true},{$set:{active:false},$inc:{version:1,revision:1}},{session});if(result.modifiedCount!==1)throw new Error("Record changed; inspect again");});
 console.log(JSON.stringify({status:"retired",id:area._id,name:area.name,active:(await Area.findById(area._id).lean())?.active}));
}
main().catch(()=>{console.error("Area inspection/update failed. No credentials logged; verify connectivity or assigned shops before retrying.");process.exitCode=1;}).finally(()=>mongoose.disconnect());
