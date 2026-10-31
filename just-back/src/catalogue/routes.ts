import { Router, type Request, type Response } from "express";
import { availabilityInput, updateAvailability } from "./availability.js";
import type { Config } from "../config/env.js";
import { publicControllers, param, pageResponse } from "./controllers.js";
import { paginate,publicReferences,eligibleShopFilter } from "./public-service.js";
import {z} from "zod";
import { actor } from "../auth/middleware.js";
import {
  Category,
  Area,
  Shop,
  Product,
  type ProductRecord,
  type ShopRecord,
} from "./models.js";
import {
  categoryDto,
  areaDto,
  shopDto,
  productDto,
  variantDto,
} from "./presenters.js";
import { id } from "../common/validation.js";
import { fail } from "../common/errors.js";
import * as validate from "./validators.js";
import {
  createShop,
  updateShop,
  changeApproval,
  createProduct,
  patchProduct,
  mutateProduct,
  ownedShop,
  mutateCategory,
  assertCategoryUnused,
  transaction,
  checkVersion,
  cents,
} from "./service.js";
import { randomUUID } from "node:crypto";

export function publicRoutes(config: Config) {
  const router = Router(),
    c = publicControllers(config);
  router.get("/areas", c.areas);
  router.get("/location/resolve",async(req,res)=>{
    const query=z.object({lat:z.coerce.number().min(-90).max(90),lng:z.coerce.number().min(-180).max(180)}).strict().parse(req.query),refs=await publicReferences();
    const nearby=await Shop.aggregate([{$geoNear:{near:{type:"Point",coordinates:[query.lng,query.lat]},distanceField:"distanceMeters",maxDistance:6000,spherical:true,key:"location",query:eligibleShopFilter(refs)}},{$unwind:"$areaIds"},{$match:{areaIds:{$in:refs.areas.map(area=>area._id)}}},{$group:{_id:"$areaIds",distanceMeters:{$min:"$distanceMeters"}}},{$sort:{distanceMeters:1,_id:1}}]).option({maxTimeMS:5000});
    const areas=nearby.flatMap(row=>{const area=refs.areas.find(area=>area._id===row._id);return area?[areaDto(area)]:[];});
    res.setHeader("Cache-Control","private, no-store");res.json({radiusKm:6,areas,recommendedAreaId:areas[0]?.id});
  });
  router.get("/catalogue/shops/by-ids",async(req,res)=>{
    const query=z.object({ids:z.string().max(1000).transform(value=>value.split(",")).pipe(z.array(z.uuid()).min(1).max(24))}).strict().parse(req.query),refs=await publicReferences();
    const shops=await Shop.find({...eligibleShopFilter(refs),_id:{$in:query.ids}}).limit(24).maxTimeMS(5000).lean();res.json(shops.map(shop=>shopDto(shop,refs.categories)));
  });
  router.get("/categories", c.categories);
  router.get("/shops", c.shops);
  router.get("/shops/:shopId/products", c.shopProducts);
  router.get("/shops/:slug", c.shop);
  router.get("/products", c.products);
  router.get("/products/:productId/variants/:variantId", c.variant);
  router.get("/products/:productId", c.product);
  return router;
}
const categories = () => Category.find().lean();
const managedProductDto = (
  p: Parameters<typeof productDto>[0],
  c: Parameters<typeof productDto>[1],
) => ({ ...productDto(p, c), stock: p.stock, active: p.active, moderation:p.moderation?{blocked:p.moderation.blocked,reason:p.moderation.reason}:undefined });
async function shopResponse(
  res: Response,
  shop: Parameters<typeof shopDto>[0],
) {
  res.json({
    ...shopDto(shop, await categories()),
    status: shop.status,
    active: shop.active,
    temporarilyClosed: shop.temporarilyClosed,
    review: shop.review ? {status:shop.review.status,reason:shop.review.reason,reviewedAt:shop.review.reviewedAt} : undefined,
  });
}
const pathId = (req: Request, key: string) => id.parse(param(req, key));

function productWriteRoutes(
  router: Router,
  prefix: string,
  config: Config,
  admin = false,
) {
  const shopId = (req: Request) => (admin ? pathId(req, "shopId") : undefined);
  router.get(prefix, async (req, res) => {
    const shop = await ownedShop(actor(req), undefined, shopId(req));
    const input = validate.privateListQuery.parse(req.query);
    const { cursor: _cursor, ...scope } = input;
    const page = await paginate<ProductRecord & { _key: string }>(
      "products",
      [{ $match: { shopId: shop._id } }, { $addFields: { _key: "$sortName" } }],
      { ...input, sort: "name" },
      { ...scope, private: true, shopId: shop._id, actorId: actor(req).id },
      config,
    );
    const refs = await categories();
    pageResponse(res, {
      ...page,
      items: page.rows.map((p) => ({
        ...managedProductDto(p, refs),
        stock: p.stock,
        active: p.active,
      })),
    });
  });
  router.get(`${prefix}/:productId`, async (req, res) => {
    const shop = await ownedShop(actor(req), undefined, shopId(req));
    const p = await Product.findOne({
      _id: pathId(req, "productId"),
      shopId: shop._id,
    });
    if (!p) fail(404, "PRODUCT_NOT_FOUND", "Product not found");
    res.json({ ...managedProductDto(p, await categories()), active: p.active });
  });
  router.post(prefix, async (req, res) => {
    const product = await createProduct(
      actor(req),
      validate.productCreate.parse(req.body),
      shopId(req),
    );
    res.status(201).json({
      ...managedProductDto(product, await categories()),
      active: product.active,
    });
  });
  router.patch(`${prefix}/:productId`, async (req, res) => {
    const product = await patchProduct(
      actor(req),
      pathId(req, "productId"),
      validate.productPatch.parse(req.body),
      shopId(req),
    );
    res.json({
      ...managedProductDto(product, await categories()),
      active: product.active,
    });
  });
  router.delete(`${prefix}/:productId`, async (req, res) => {
    const input = validate.deleteInput.parse(req.body);
    await mutateProduct(
      actor(req),
      pathId(req, "productId"),
      input.version,
      (p) => {
        p.active = false;
      },
      shopId(req),
    );
    res.status(204).end();
  });
  router.patch(`${prefix}/:productId/inventory`, async (req, res) => {
    const input = validate.inventoryPatch.parse(req.body);
    const p = await mutateProduct(
      actor(req),
      pathId(req, "productId"),
      input.version,
      (p) => {
        if (p.variants.some((v) => v.active))
          fail(
            409,
            "VARIANT_INVENTORY_REQUIRED",
            "Update stock on a specific variant",
          );
        p.stock = input.stock;
      },
      shopId(req),
    );
    res.json(managedProductDto(p, await categories()));
  });
  router.get(`${prefix}/:productId/variants/:variantId`, async (req, res) => {
    const shop = await ownedShop(actor(req), undefined, shopId(req));
    const p = await Product.findOne({
      _id: pathId(req, "productId"),
      shopId: shop._id,
    });
    const v = p?.variants.find(
      (v) => v._id === pathId(req, "variantId") && v.active,
    );
    if (!v) fail(404, "VARIANT_NOT_FOUND", "Variant not found");
    res.json({ ...variantDto(v), version: p!.version });
  });
  router.post(`${prefix}/:productId/variants`, async (req, res) => {
    const input = validate.variantCreate
      .extend({ version: validate.deleteInput.shape.version })
      .strict()
      .parse(req.body);
    const variantId = randomUUID();
    const p = await mutateProduct(
      actor(req),
      pathId(req, "productId"),
      input.version,
      (p) => {
        if (p.variants.length >= 100)
          fail(409, "VARIANT_LIMIT", "Variant limit reached");
        p.variants.push({
          _id: variantId,
          label: input.label,
          priceCents: cents(input.price),
          stock: input.stock,
          attributes: input.attributes,
          active: true,
        });
      },
      shopId(req),
    );
    res.status(201).json({
      ...variantDto(p.variants.find((v) => v._id === variantId)!),
      version: p.version,
    });
  });
  router.patch(`${prefix}/:productId/variants/:variantId`, async (req, res) => {
    const input = validate.variantPatch.parse(req.body);
    const variantId = pathId(req, "variantId");
    const p = await mutateProduct(
      actor(req),
      pathId(req, "productId"),
      input.version,
      (p) => {
        const v = p.variants.find((v) => v._id === variantId && v.active);
        if (!v) fail(404, "VARIANT_NOT_FOUND", "Variant not found");
        if (input.label !== undefined) v.label = input.label;
        if (input.price !== undefined) v.priceCents = cents(input.price);
        if (input.stock !== undefined) v.stock = input.stock;
        if (input.attributes !== undefined) v.attributes = input.attributes;
      },
      shopId(req),
    );
    res.json({
      ...variantDto(p.variants.find((v) => v._id === variantId)!),
      version: p.version,
    });
  });
  router.delete(
    `${prefix}/:productId/variants/:variantId`,
    async (req, res) => {
      const { version } = validate.deleteInput.parse(req.body);
      await mutateProduct(
        actor(req),
        pathId(req, "productId"),
        version,
        (p) => {
          const v = p.variants.find(
            (v) => v._id === pathId(req, "variantId") && v.active,
          );
          if (!v) fail(404, "VARIANT_NOT_FOUND", "Variant not found");
          if (p.variants.filter((v) => v.active).length === 1)
            fail(
              409,
              "LAST_VARIANT",
              "Keep at least one variant, or deactivate the product",
            );
          v.active = false;
        },
        shopId(req),
      );
      res.status(204).end();
    },
  );
}
export function sellerRoutes(config: Config) {
  const router = Router();
  router.patch("/shop/availability", async (req, res) => shopResponse(res, await updateAvailability(actor(req), availabilityInput.parse(req.body))));
  router.get("/shop", async (req, res) =>
    shopResponse(res, await ownedShop(actor(req))),
  );
  router.post("/shop", async (req, res) => {
    const shop = await createShop(
      actor(req),
      validate.shopCreate.parse(req.body),
    );
    res.status(201);
    await shopResponse(res, shop);
  });
  router.patch("/shop", async (req, res) =>
    shopResponse(
      res,
      await updateShop(actor(req), validate.shopPatch.parse(req.body)),
    ),
  );
  productWriteRoutes(router, "/products", config);
  return router;
}

export function adminRoutes(config: Config) {
  const router = Router();
  router.get("/categories", async (_req, res) =>
    res.json(
      (await categories()).map((c) => ({
        ...categoryDto(c),
        active: c.active,
        subcategories: c.subcategories.map((s) => ({
          id: s._id,
          slug: s.slug,
          name: s.name,
          active: s.active,
        })),
      })),
    ),
  );
  router.post("/categories", async (req, res) => {
    const category = await Category.create(
      validate.categoryCreate.parse(req.body),
    );
    res.status(201).json(categoryDto(category));
  });
  router.patch("/categories/:categoryId", async (req, res) => {
    const input = validate.categoryPatch.parse(req.body);
    const category = await mutateCategory(
      pathId(req, "categoryId"),
      input.version,
      async (c, session) => {
        if (input.active === false) await assertCategoryUnused(c._id, session);
        const { version: _version, ...rest } = input;
        c.set(rest);
      },
    );
    res.json({ ...categoryDto(category), active: category.active });
  });
  router.delete("/categories/:categoryId", async (req, res) => {
    const input = validate.deleteInput.parse(req.body);
    await mutateCategory(
      pathId(req, "categoryId"),
      input.version,
      async (c, session) => {
        await assertCategoryUnused(c._id, session);
        c.active = false;
      },
    );
    res.status(204).end();
  });
  router.post("/categories/:categoryId/subcategories", async (req, res) => {
    const input = validate.subCreate.parse(req.body);
    const category = await mutateCategory(
      pathId(req, "categoryId"),
      input.version,
      (c) => {
        if (!c.active) fail(409, "INACTIVE_CATEGORY", "Category is inactive");
        if (c.subcategories.length >= 100)
          fail(409, "SUBCATEGORY_LIMIT", "Subcategory limit reached");
        if (c.subcategories.some((s) => s.slug === input.slug))
          fail(409, "DUPLICATE_SUBCATEGORY", "Subcategory slug exists");
        c.subcategories.push({
          _id: randomUUID(),
          slug: input.slug,
          name: input.name,
          active: true,
        });
      },
    );
    res.status(201).json(categoryDto(category));
  });
  router.patch(
    "/categories/:categoryId/subcategories/:subcategoryId",
    async (req, res) => {
      const input = validate.subPatch.parse(req.body);
      const category = await mutateCategory(
        pathId(req, "categoryId"),
        input.version,
        async (c, session) => {
          const sub = c.subcategories.find(
            (s) => s._id === pathId(req, "subcategoryId"),
          );
          if (!sub) fail(404, "SUBCATEGORY_NOT_FOUND", "Subcategory not found");
          if (input.active === false)
            await assertCategoryUnused(c._id, session, sub._id);
          if (input.name !== undefined) sub.name = input.name;
          if (input.active !== undefined) sub.active = input.active;
        },
      );
      res.json(categoryDto(category));
    },
  );
  router.delete(
    "/categories/:categoryId/subcategories/:subcategoryId",
    async (req, res) => {
      const { version } = validate.deleteInput.parse(req.body);
      await mutateCategory(
        pathId(req, "categoryId"),
        version,
        async (c, session) => {
          const sub = c.subcategories.find(
            (s) => s._id === pathId(req, "subcategoryId"),
          );
          if (!sub) fail(404, "SUBCATEGORY_NOT_FOUND", "Subcategory not found");
          await assertCategoryUnused(c._id, session, sub._id);
          sub.active = false;
        },
      );
      res.status(204).end();
    },
  );
  router.get("/areas", async (_req, res) =>
    res.json((await Area.find().lean()).map(areaDto)),
  );
  router.post("/areas", async (req, res) =>
    res
      .status(201)
      .json(areaDto(await Area.create(validate.areaCreate.parse(req.body)))),
  );
  router.patch("/areas/:areaId", async (req, res) => {
    const input = validate.areaPatch.parse(req.body);
    const area = await transaction(async (session) => {
      const area = await Area.findById(pathId(req, "areaId")).session(session);
      if (!area) fail(404, "AREA_NOT_FOUND", "Area not found");
      checkVersion(area.version, input.version);
      if (
        input.active === false &&
        (await Shop.exists({ areaIds: area._id }).session(session))
      )
        fail(409, "AREA_IN_USE", "Area is assigned to a shop");
      const { version: _version, ...rest } = input;
      area.set(rest);
      area.revision++;
      return area.save({ session });
    });
    res.json(areaDto(area));
  });
  router.get("/shops", async (req, res) => {
    const input = validate.privateListQuery.parse(req.query);
    const { cursor: _cursor, ...scope } = input;
    const page = await paginate<ShopRecord & { _key: string }>(
      "shops",
      [{ $addFields: { _key: "$sortName" } }],
      { ...input, sort: "name" },
      { ...scope, private: true, actorId: actor(req).id },
      config,
    );
    const refs = await categories();
    pageResponse(res, {
      ...page,
      items: page.rows.map((s) => ({
        ...shopDto(s, refs),
        ownerId: s.ownerId,
        status: s.status,
        active: s.active,
        review: s.review,
      })),
    });
  });
  router.patch("/shops/:shopId/approval", async (req, res) =>
    shopResponse(
      res,
      await changeApproval(
        pathId(req, "shopId"),
        validate.approvalInput.parse(req.body),
        actor(req).id,
      ),
    ),
  );
  productWriteRoutes(router, "/shops/:shopId/products", config, true);
  return router;
}

