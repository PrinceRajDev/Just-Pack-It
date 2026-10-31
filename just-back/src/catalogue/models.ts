import { Schema, model } from "mongoose";
import { randomUUID } from "node:crypto";
const options = {
  timestamps: true,
  versionKey: "version",
  optimisticConcurrency: true,
} as const;
export interface Base {
  _id: string;
  version: number;
}
export interface Subcategory {
  _id: string;
  slug: string;
  name: string;
  active: boolean;
}
export interface CategoryRecord extends Base {
  slug: string;
  name: string;
  blurb: string;
  image: string;
  active: boolean;
  revision: number;
  subcategories: Subcategory[];
}
const subSchema = new Schema<Subcategory>(
  {
    _id: { type: String, default: () => randomUUID() },
    slug: { type: String, required: true },
    name: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { versionKey: false },
);
export const Category = model<CategoryRecord>(
  "Category",
  new Schema<CategoryRecord>(
    {
      _id: { type: String, default: () => randomUUID() },
      slug: { type: String, required: true, unique: true, immutable: true },
      name: { type: String, required: true },
      blurb: { type: String, default: "" },
      image: { type: String, default: "" },
      active: { type: Boolean, default: true },
      revision: { type: Number, default: 0 },
      subcategories: { type: [subSchema], default: [] },
    },
    options,
  ),
);
export interface AreaRecord extends Base {
  name: string;
  city: string;
  pincodes: string[];
  active: boolean;
  revision: number;
}
export const Area = model<AreaRecord>(
  "Area",
  new Schema<AreaRecord>(
    {
      _id: { type: String, default: () => randomUUID() },
      name: { type: String, required: true },
      city: { type: String, required: true },
      pincodes: { type: [String], required: true },
      active: { type: Boolean, default: true },
      revision: { type: Number, default: 0 },
    },
    options,
  ),
);
export interface Opening {
  day: number;
  opens: string;
  closes: string;
}
export type Fulfilment = "pickup" | "seller_delivery" | "platform_delivery";
export interface ShopRecord extends Base {
  ownerId: string;
  slug: string;
  name: string;
  sortName: string;
  tagline: string;
  description: string;
  locality: string;
  address?: string;
  location?:{type:"Point";coordinates:number[]};
  categoryIds: string[];
  subcategoryIds: string[];
  areaIds: string[];
  status: "pending" | "approved" | "rejected" | "suspended";
  review?: {status: "pending" | "approved" | "rejected" | "suspended"; reason?: string; reviewedAt: Date; reviewedBy?: string};
  active: boolean;
  hours: string;
  timezone: string;
  openingHours: Opening[];
  temporarilyClosed: boolean;
  fulfilment: Fulfilment[];
  since: number;
  initials: string;
  coverImage?: string;
  deliveryFeeCents?: number;
  minimumOrderCents?: number;
  pickupNote?: string;
  revision: number;
}
export const Shop = model<ShopRecord>(
  "Shop",
  new Schema<ShopRecord>(
    {
      _id: { type: String, default: () => randomUUID() },
      ownerId: { type: String, required: true, unique: true, immutable: true },
      slug: { type: String, required: true, unique: true, immutable: true },
      name: { type: String, required: true },
      sortName: { type: String, required: true, index: true },
      tagline: { type: String, default: "" },
      description: { type: String, default: "" },
      locality: { type: String, required: true },
      address: { type: String },
      location:{type:{type:String,enum:["Point"]},coordinates:{type:[Number],default:undefined}},
      categoryIds: { type: [String], default: [], index: true },
      subcategoryIds: { type: [String], default: [] },
      areaIds: { type: [String], default: [], index: true },
      status: {
        type: String,
        enum: ["pending", "approved", "rejected", "suspended"],
        default: "pending",
        index: true,
      },
      review: {type: new Schema({status:{type:String,enum:["pending","approved","rejected","suspended"],required:true},reason:String,reviewedAt:{type:Date,required:true},reviewedBy:String},{_id:false}),default:undefined},
      active: { type: Boolean, default: true },
      hours: { type: String, default: "" },
      timezone: { type: String, default: "Asia/Kolkata" },
      openingHours: [
        new Schema<Opening>(
          { day: Number, opens: String, closes: String },
          { _id: false },
        ),
      ],
      temporarilyClosed: { type: Boolean, default: false },
      fulfilment: {
        type: [String],
        enum: ["pickup", "seller_delivery", "platform_delivery"],
        default: [],
      },
      since: { type: Number, required: true },
      initials: { type: String, required: true },
      coverImage: String,
      deliveryFeeCents: Number,
      minimumOrderCents: Number,
      pickupNote: String,
      revision: { type: Number, default: 0 },
    },
    options,
  ),
);
Shop.schema.index({location:"2dsphere"});
export interface Attribute {
  label: string;
  value: string;
}
export interface Variant {
  _id: string;
  label: string;
  priceCents: number;
  stock: number;
  attributes: Attribute[];
  active: boolean;
}
export interface ProductRecord extends Base {
  moderation?:{blocked:boolean;reason:string;updatedAt:Date};
  shopId: string;
  categoryId: string;
  subcategoryId?: string;
  name: string;
  sortName: string;
  unit: string;
  description: string;
  priceCents: number;
  mrpCents?: number;
  stock: number;
  sortPriceCents: number;
  totalStock: number;
  image?: string;
  attributes: Attribute[];
  tags: string[];
  variants: Variant[];
  active: boolean;
}
const attributeSchema = new Schema<Attribute>(
  { label: String, value: String },
  { _id: false },
);
const variantSchema = new Schema<Variant>(
  {
    _id: { type: String, default: () => randomUUID() },
    label: { type: String, required: true },
    priceCents: { type: Number, required: true, min: 1 },
    stock: { type: Number, required: true, min: 0 },
    attributes: { type: [attributeSchema], default: [] },
    active: { type: Boolean, default: true },
  },
  { versionKey: false },
);
const productSchema = new Schema<ProductRecord>(
  {
    moderation:{type:new Schema({blocked:Boolean,reason:String,updatedAt:Date},{_id:false}),default:undefined},
    _id: { type: String, default: () => randomUUID() },
    shopId: { type: String, required: true, immutable: true, index: true },
    categoryId: { type: String, required: true, index: true },
    subcategoryId: String,
    name: { type: String, required: true },
    sortName: { type: String, required: true },
    unit: { type: String, required: true },
    description: { type: String, default: "" },
    priceCents: { type: Number, required: true, min: 1 },
    mrpCents: Number,
    stock: { type: Number, min: 0, required: true },
    sortPriceCents: { type: Number, required: true },
    totalStock: { type: Number, required: true },
    image: String,
    attributes: { type: [attributeSchema], default: [] },
    tags: { type: [String], default: [] },
    variants: { type: [variantSchema], default: [] },
    active: { type: Boolean, default: true, index: true },
  },
  options,
);
productSchema.index({ shopId: 1, sortName: 1, _id: 1 });
productSchema.index({ categoryId: 1, sortPriceCents: 1, _id: 1 });
export const Product = model<ProductRecord>("Product", productSchema);
