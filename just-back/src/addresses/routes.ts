import { Router } from "express";
import { Schema, model } from "mongoose";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { actor } from "../auth/middleware.js";
import { fail } from "../common/errors.js";

export const addressPoint=z.object({type:z.literal("Point"),coordinates:z.tuple([z.number().min(-180).max(180),z.number().min(-90).max(90)])}).strict();
const fields = {
  location:addressPoint.nullable().optional(),
  label: z.string().trim().min(1).max(60),
  line1: z.string().trim().min(3).max(300),
  locality: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/),
};
const createInput = z.object(fields).strict();
const patchInput = createInput.partial().extend({version:z.number().int().nonnegative()}).strict()
  .refine(value => Object.keys(value).some(key => key !== "version"), "No changes supplied");
const versionInput = z.object({version:z.number().int().nonnegative()}).strict();
interface AddressRecord extends z.infer<typeof createInput> {_id:string;userId:string;version:number;revision:number}
const schema = new Schema<AddressRecord>({
  _id:{type:String,default:()=>randomUUID()},
  userId:{type:String,required:true,index:true},
  label:{type:String,required:true},line1:{type:String,required:true},
  locality:{type:String,required:true},city:{type:String,required:true},
  location:{type:new Schema({type:{type:String,enum:["Point"],required:true},coordinates:{type:[Number],required:true}},{_id:false}),default:undefined},
  pincode:{type:String,required:true},version:{type:Number,default:0},revision:{type:Number,default:0},
},{timestamps:true});
export const Address = model<AddressRecord>("Address",schema);
const present = (value:AddressRecord) => ({id:value._id,label:value.label,line1:value.line1,locality:value.locality,city:value.city,pincode:value.pincode,...(value.location ? {location:value.location} : {}),version:value.version});
export function addressRoutes() {
  const router=Router();
  router.use((_req,res,next)=>{res.setHeader("Cache-Control","private, no-store");next();});
  router.get("/",async(req,res)=>{
    const records=await Address.find({userId:actor(req).id}).sort({_id:1}).lean();
    res.json(records.map(present));
  });
  router.post("/",async(req,res)=>{
    const input=createInput.parse(req.body);
    const record=await Address.create({...input,userId:actor(req).id});
    res.status(201).json(present(record));
  });
  router.patch("/:id",async(req,res)=>{
    const id=z.uuid().parse(req.params.id),{version,...changes}=patchInput.parse(req.body);
    const owner={_id:id,userId:actor(req).id};
    const updated=await Address.findOneAndUpdate({...owner,version},{$set:changes,$inc:{version:1}},{returnDocument:"after",runValidators:true});
    if(!updated) {
      if(await Address.exists(owner)) fail(409,"VERSION_CONFLICT","Address changed; reload and retry");
      fail(404,"NOT_FOUND","Address not found");
    }
    res.json(present(updated));
  });
  router.delete("/:id",async(req,res)=>{
    const id=z.uuid().parse(req.params.id),{version}=versionInput.parse(req.body);
    const owner={_id:id,userId:actor(req).id};
    const result=await Address.deleteOne({...owner,version});
    if(!result.deletedCount) {
      if(await Address.exists(owner)) fail(409,"VERSION_CONFLICT","Address changed; reload and retry");
      fail(404,"NOT_FOUND","Address not found");
    }
    res.status(204).end();
  });
  return router;
}
