import mongoose, { type ClientSession } from "mongoose";
import { randomUUID } from "node:crypto";
import {
  Category,
  Area,
  Shop,
  Product,
  type ProductRecord,
  type ShopRecord,
} from "./models.js";
import { fail } from "../common/errors.js";
import type { Actor } from "../auth/middleware.js";
import { InventoryReservation } from "../inventory/models.js";
import {notify} from "../notifications/service.js";
import type {
  ProductInput,
  ProductPatch,
  ShopInput,
  ShopPatch,
} from "./validators.js";
export const transaction = <T>(fn: (session: ClientSession) => Promise<T>) =>
  mongoose.connection.transaction(fn);
export const cents = (value: number) => Math.round(value * 100);
function checkVersion(actual: number, expected: number) {
  if (actual !== expected)
    fail(409, "VERSION_CONFLICT", "Record changed; reload and retry");
}
export async function ownedShop(
  who: Actor,
  session?: ClientSession,
  shopId?: string,
) {
  const filter = shopId
    ? { _id: shopId, ...(who.role === "admin" ? {} : { ownerId: who.id }) }
    : { ownerId: who.id };
  const shop = await Shop.findOne(filter).session(session ?? null);
  return shop ?? fail(404, "SHOP_NOT_FOUND", "Shop not found");
}
async function touchReferences(
  categoryIds: string[],
  subcategoryIds: string[],
  areaIds: string[],
  session: ClientSession,
) {
  for (const categoryId of new Set(categoryIds)) {
    const category = await Category.findOneAndUpdate(
      { _id: categoryId, active: true },
      { $inc: { revision: 1 } },
      { returnDocument: "after", session },
    );
    if (!category) fail(400, "INVALID_CATEGORY", "Category is not active");
  }
  const categories = await Category.find({
    _id: { $in: categoryIds },
    active: true,
  }).session(session);
  if (
    subcategoryIds.some(
      (id) =>
        !categories.some((c) =>
          c.subcategories.some((s) => s._id === id && s.active),
        ),
    )
  )
    fail(
      400,
      "INVALID_SUBCATEGORY",
      "Subcategory must belong to an assigned active category",
    );
  for (const areaId of new Set(areaIds)) {
    const area = await Area.findOneAndUpdate(
      { _id: areaId, active: true },
      { $inc: { revision: 1 } },
      { session, returnDocument: "after" },
    );
    if (!area) fail(400, "INVALID_AREA", "Service area is not active");
  }
}
export async function createShop(who: Actor, input: ShopInput, existingSession?: ClientSession) {
  const create = async (session: ClientSession) => {
    await touchReferences(
      input.categoryIds,
      input.subcategoryIds,
      input.serviceAreaIds,
      session,
    );
    const { serviceAreaIds, deliveryFee, minimumOrderAmount, ...rest } = input;
    const [shop] = await Shop.create(
      [
        {
          ...rest,
          ownerId: who.id,
          areaIds: serviceAreaIds,
          sortName: input.name.toLocaleLowerCase(),
          deliveryFeeCents:
            deliveryFee === undefined ? undefined : cents(deliveryFee),
          minimumOrderCents:
            minimumOrderAmount === undefined
              ? undefined
              : cents(minimumOrderAmount),
          status: "pending",
        },
      ],
      { session },
    );
    await notify(`${shop._id}:submitted`,{admin:true},"Shop application submitted","A seller shop is waiting for approval. Review its details before approval.","/admin/partners",session);
    return shop;
  };
  return existingSession ? create(existingSession) : transaction(create);
}
export async function updateShop(who: Actor, input: ShopPatch) {
  return transaction(async (session) => {
    const shop = await ownedShop(who, session);
    checkVersion(shop.version, input.version);
    const categoryIds = input.categoryIds ?? shop.categoryIds,
      subcategoryIds = input.subcategoryIds ?? shop.subcategoryIds;
    await touchReferences(
      categoryIds,
      subcategoryIds,
      input.serviceAreaIds ?? shop.areaIds,
      session,
    );
    const products = await Product.find({ shopId: shop._id }).session(session);
    if (
      products.some(
        (p) =>
          !categoryIds.includes(p.categoryId) ||
          (p.subcategoryId && !subcategoryIds.includes(p.subcategoryId)),
      )
    )
      fail(
        409,
        "SHOP_ASSIGNMENT_IN_USE",
        "Products still reference removed category assignments",
      );
    const {
      version: _version,
      serviceAreaIds,
      deliveryFee,
      minimumOrderAmount,
      ...rest
    } = input;
    shop.set(rest);
    if (serviceAreaIds) shop.areaIds = serviceAreaIds;
    if (deliveryFee !== undefined) shop.deliveryFeeCents = cents(deliveryFee);
    if (minimumOrderAmount !== undefined)
      shop.minimumOrderCents = cents(minimumOrderAmount);
    shop.sortName = shop.name.toLocaleLowerCase();
    shop.status = "pending";
    const saved=await shop.save({session});
    await notify(`${shop._id}:resubmitted:${shop.version}`,{admin:true},"Shop profile needs review","A seller updated their shop profile. Review the latest details.","/admin/partners",session);
    return saved;
  });
}
export async function changeApproval(
  shopId: string,
  input: { status: ShopRecord["status"]; active?: boolean; version: number; reason?: string },
  reviewerId?: string,
) {
  return transaction(async (session) => {
    const shop = await Shop.findById(shopId).session(session);
    if (!shop) fail(404, "SHOP_NOT_FOUND", "Shop not found");
    checkVersion(shop.version, input.version);
    if (input.status === "approved")
      await touchReferences(
        shop.categoryIds,
        shop.subcategoryIds,
        shop.areaIds,
        session,
      );
    shop.status = input.status;
    if (reviewerId) shop.review = {status:input.status,reason:input.reason,reviewedAt:new Date(),reviewedBy:reviewerId};
    if (input.active !== undefined) shop.active = input.active;
    const saved=await shop.save({session});
    await notify(`${shop._id}:review:${shop.version}`,{userId:shop.ownerId},`Shop review: ${shop.status}`,"Open your shop profile to review the current approval status and feedback.","/seller/settings",session);
    return saved;
  });
}
async function validateProductShop(
  shop: ShopRecord,
  categoryId: string,
  subcategoryId: string | undefined,
  session: ClientSession,
) {
  if (
    !shop.categoryIds.includes(categoryId) ||
    (subcategoryId && !shop.subcategoryIds.includes(subcategoryId))
  )
    fail(
      400,
      "SHOP_CATEGORY_MISMATCH",
      "Product category must be assigned to its shop",
    );
  await touchReferences(
    [categoryId],
    subcategoryId ? [subcategoryId] : [],
    [],
    session,
  );
}
export function deriveProduct(p: ProductRecord) {
  const variants = p.variants.filter((v) => v.active);
  p.sortName = p.name.toLocaleLowerCase();
  p.totalStock = variants.length
    ? variants.reduce((sum, v) => sum + v.stock, 0)
    : p.stock;
  p.sortPriceCents = variants.length
    ? Math.min(...variants.map((v) => v.priceCents))
    : p.priceCents;
  if (p.mrpCents !== undefined && p.mrpCents < p.priceCents)
    fail(400, "INVALID_MRP", "MRP must not be below base price");
  const labels = variants.map((v) => v.label.toLocaleLowerCase());
  if (new Set(labels).size !== labels.length)
    fail(400, "DUPLICATE_VARIANT", "Variant labels must be distinct");
}
export async function createProduct(
  who: Actor,
  input: ProductInput,
  shopId?: string,
) {
  return transaction(async (session) => {
    const shop = await ownedShop(who, session, shopId);
    await Shop.updateOne(
      { _id: shop._id },
      { $inc: { revision: 1 } },
      { session },
    );
    await validateProductShop(
      shop,
      input.categoryId,
      input.subcategoryId ?? undefined,
      session,
    );
    const { price, mrp, variants, subcategoryId, ...rest } = input;
    const product = new Product({
      ...rest,
      shopId: shop._id,
      subcategoryId: subcategoryId ?? undefined,
      priceCents: cents(price),
      mrpCents: mrp == null ? undefined : cents(mrp),
      variants: variants.map((v) => ({
        _id: randomUUID(),
        label: v.label,
        priceCents: cents(v.price),
        stock: v.stock,
        attributes: v.attributes,
        active: true,
      })),
    });
    deriveProduct(product);
    await product.save({ session });
    return product;
  });
}
export async function mutateProduct(
  who: Actor,
  productId: string,
  expectedVersion: number,
  mutate: (p: mongoose.HydratedDocument<ProductRecord>) => void,
  shopId?: string,
) {
  return transaction(async (session) => {
    const shop = await ownedShop(who, session, shopId);
    await Shop.updateOne(
      { _id: shop._id },
      { $inc: { revision: 1 } },
      { session },
    );
    const product = await Product.findOne({
      _id: productId,
      shopId: shop._id,
    }).session(session);
    if (!product) fail(404, "PRODUCT_NOT_FOUND", "Product not found");
    checkVersion(product.version, expectedVersion);
    if(await InventoryReservation.exists({state:"held","lines.productId":productId}).session(session))
      fail(409,"INVENTORY_HELD","This listing has reserved stock. Retry after its holds are released.");
    mutate(product);
    await validateProductShop(
      shop,
      product.categoryId,
      product.subcategoryId,
      session,
    );
    deriveProduct(product);
    await product.save({ session });
    return product;
  });
}
export function patchProduct(
  who: Actor,
  productId: string,
  input: ProductPatch,
  shopId?: string,
) {
  return mutateProduct(
    who,
    productId,
    input.version,
    (p) => {
      const {
        price,
        mrp,
        version: _version,
        image,
        subcategoryId,
        ...rest
      } = input;
      p.set(rest);
      if (price !== undefined) p.priceCents = cents(price);
      if (mrp !== undefined) p.mrpCents = mrp === null ? undefined : cents(mrp);
      if (image !== undefined) p.image = image === null ? undefined : image;
      if (subcategoryId !== undefined)
        p.subcategoryId = subcategoryId ?? undefined;
    },
    shopId,
  );
}
export async function mutateCategory(
  categoryId: string,
  expectedVersion: number,
  mutate: (
    category: mongoose.HydratedDocument<import("./models.js").CategoryRecord>,
    session: ClientSession,
  ) => Promise<void> | void,
) {
  return transaction(async (session) => {
    const category = await Category.findById(categoryId).session(session);
    if (!category) fail(404, "CATEGORY_NOT_FOUND", "Category not found");
    checkVersion(category.version, expectedVersion);
    await mutate(category, session);
    category.revision++;
    await category.save({ session });
    return category;
  });
}
export async function assertCategoryUnused(
  categoryId: string,
  session: ClientSession,
  subcategoryId?: string,
) {
  const shop = await Shop.exists(
    subcategoryId
      ? { subcategoryIds: subcategoryId }
      : { categoryIds: categoryId },
  ).session(session);
  const product = await Product.exists(
    subcategoryId ? { subcategoryId } : { categoryId },
  ).session(session);
  if (shop || product)
    fail(
      409,
      "CATEGORY_IN_USE",
      "Category or subcategory is referenced by existing shops/products",
    );
}
export { checkVersion, touchReferences };
