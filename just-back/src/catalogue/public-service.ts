import { createHash } from "node:crypto";
import type { PipelineStage } from "mongoose";
import { z } from "zod";
import {
  Area,
  Category,
  Shop,
  Product,
  type ProductRecord,
  type ShopRecord,
} from "./models.js";
import { productQuery, shopQuery } from "./validators.js";
import { productDto, shopDto } from "./presenters.js";
import { fail } from "../common/errors.js";
import { encodeCursor, decodeCursor } from "../common/cursor.js";
import type { Config } from "../config/env.js";

const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function nearbyFilter(query:{lat?:number;lng?:number}):Record<string,unknown>{
  if((query.lat===undefined)!==(query.lng===undefined))fail(400,"INVALID_LOCATION","Latitude and longitude must be supplied together");
  return query.lat===undefined ? {} : {location:{$geoWithin:{$centerSphere:[[query.lng!,query.lat],6/6371.0088]}}};
}
export async function publicReferences(
  area?: string,
  categorySlug?: string,
  subcategorySlug?: string,
) {
  const areas = await Area.find({ active: true }).lean();
  if (area && !areas.some((a) => a._id === area))
    fail(400, "INVALID_AREA", "Unknown or inactive service area");
  const categories = await Category.find({ active: true }).lean();
  const category = categorySlug
    ? categories.find((c) => c.slug === categorySlug)
    : undefined;
  if (categorySlug && !category)
    fail(400, "INVALID_CATEGORY", "Unknown or inactive category");
  const subcategory = subcategorySlug
    ? categories.flatMap((c) =>
        c.subcategories
          .filter(
            (s) =>
              s.active &&
              s.slug === subcategorySlug &&
              (!category || c._id === category._id),
          )
          .map((s) => ({ id: s._id, categoryId: c._id })),
      )
    : undefined;
  if (subcategorySlug && subcategory?.length !== 1)
    fail(
      400,
      "INVALID_SUBCATEGORY",
      "Unknown or ambiguous subcategory; specify category",
    );
  return { areas, categories, category, subcategory: subcategory?.[0] };
}
export function eligibleShopFilter(
  refs: Awaited<ReturnType<typeof publicReferences>>,
  area?: string,
) {
  return {
    active: true,
    status: "approved" as const,
    areaIds: { $in: area ? [area] : refs.areas.map((a) => a._id) },
    categoryIds: { $in: refs.categories.map((c) => c._id) },
  };
}
const searchStage = (q: string | undefined, fields: string[]) =>
  q?.trim()
    ? q
        .trim()
        .split(/\s+/)
        .map((token) => ({
          $or: fields.map((field) => ({
            [field]: { $regex: escape(token), $options: "i" },
          })),
        }))
    : [];

// Mongo computes local day/minute and interval membership before open filtering and pagination.
export const openStages = (now: Date): PipelineStage[] => [
  {
    $addFields: {
      _local: { $dateToParts: { date: now, timezone: "$timezone" } },
      _day: {
        $subtract: [{ $dayOfWeek: { date: now, timezone: "$timezone" } }, 1],
      },
    },
  },
  {
    $addFields: {
      _minute: {
        $add: [{ $multiply: ["$_local.hour", 60] }, "$_local.minute"],
      },
    },
  },
  {
    $addFields: {
      _open: {
        $and: [
          { $eq: ["$temporarilyClosed", false] },
          {
            $anyElementTrue: {
              $map: {
                input: "$openingHours",
                as: "interval",
                in: {
                  $let: {
                    vars: {
                      start: {
                        $add: [
                          {
                            $multiply: [
                              {
                                $toInt: {
                                  $substrBytes: ["$$interval.opens", 0, 2],
                                },
                              },
                              60,
                            ],
                          },
                          {
                            $toInt: {
                              $substrBytes: ["$$interval.opens", 3, 2],
                            },
                          },
                        ],
                      },
                      end: {
                        $add: [
                          {
                            $multiply: [
                              {
                                $toInt: {
                                  $substrBytes: ["$$interval.closes", 0, 2],
                                },
                              },
                              60,
                            ],
                          },
                          {
                            $toInt: {
                              $substrBytes: ["$$interval.closes", 3, 2],
                            },
                          },
                        ],
                      },
                    },
                    in: {
                      $cond: [
                        { $lt: ["$$start", "$$end"] },
                        {
                          $and: [
                            { $eq: ["$$interval.day", "$_day"] },
                            { $gte: ["$_minute", "$$start"] },
                            { $lt: ["$_minute", "$$end"] },
                          ],
                        },
                        {
                          $or: [
                            {
                              $and: [
                                { $eq: ["$$interval.day", "$_day"] },
                                { $gte: ["$_minute", "$$start"] },
                              ],
                            },
                            {
                              $and: [
                                {
                                  $eq: [
                                    {
                                      $mod: [
                                        { $add: ["$$interval.day", 1] },
                                        7,
                                      ],
                                    },
                                    "$_day",
                                  ],
                                },
                                { $lt: ["$_minute", "$$end"] },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        ],
      },
    },
  },
];
type PageRow = { _id: string; _key: string | number };
export async function paginate<T extends PageRow>(
  kind: "shops" | "products",
  pipeline: PipelineStage[],
  query: { cursor?: string; limit: number; sort: string },
  scopeInput: object,
  config: Config,
) {
  const scope = createHash("sha256")
    .update(JSON.stringify({ kind, ...scopeInput }))
    .digest("hex");
  const after: PipelineStage.FacetPipelineStage[] = [];
  if (query.cursor) {
    const cursor = decodeCursor(
      query.cursor,
      scope,
      query.sort,
      config.CURSOR_SECRET,
    );
    after.push({
      $match: {
        $or: [
          { _key: { $gt: cursor.key } },
          { _key: cursor.key, _id: { $gt: cursor.id } },
        ],
      },
    });
  }
  const stages: PipelineStage[] = [
    ...pipeline,
    {
      $facet: {
        count: [{ $count: "total" }],
        items: [
          ...after,
          { $sort: { _key: 1, _id: 1 } },
          { $limit: query.limit + 1 },
        ],
      },
    },
  ];
  type Result = { items: T[]; count: { total: number }[] };
  const result =
    kind === "shops"
      ? await Shop.aggregate<Result>(stages).option({ maxTimeMS: 5000 })
      : await Product.aggregate<Result>(stages).option({ maxTimeMS: 5000 });
  const rows = result[0].items;
  const more = rows.length > query.limit;
  if (more) rows.pop();
  const last = rows.at(-1);
  return {
    rows,
    total: result[0].count[0]?.total ?? 0,
    next:
      more && last
        ? encodeCursor(
            { scope, sort: query.sort, key: last._key, id: last._id },
            config.CURSOR_SECRET,
          )
        : undefined,
  };
}
export async function listShops(
  query: z.infer<typeof shopQuery>,
  config: Config,
) {
  const refs = await publicReferences(
    query.area,
    query.category,
    query.subcategory,
  );
  const match: Record<string, unknown> = eligibleShopFilter(refs, query.area);
  Object.assign(match,nearbyFilter(query));
  if (refs.category) match.categoryIds = refs.category._id;
  if (refs.subcategory) match.subcategoryIds = refs.subcategory.id;
  if (query.fulfilment)
    match.fulfilment =
      query.fulfilment === "delivery"
        ? { $in: ["seller_delivery", "platform_delivery"] }
        : query.fulfilment;
  const search = searchStage(query.q, ["name", "tagline", "locality"]);
  if (search.length) match.$and = search;
  const now = new Date();
  const pipeline: PipelineStage[] = [{ $match: match }, ...openStages(now)];
  if (query.openOnly || query.sort === "open")
    pipeline.push({ $match: { _open: true } });
  let key: unknown = "$sortName";
  if (query.sort === "recommended" || query.sort === "open")
    key = { $concat: [{ $cond: ["$_open", "0|", "1|"] }, "$sortName"] };
  if (query.sort === "fee_asc" || query.sort === "fee_desc")
    key = {
      $cond: [
        {
          $and: [
            { $ne: [{ $type: "$deliveryFeeCents" }, "missing"] },
            {
              $gt: [
                {
                  $size: {
                    $setIntersection: [
                      "$fulfilment",
                      ["seller_delivery", "platform_delivery"],
                    ],
                  },
                },
                0,
              ],
            },
          ],
        },
        query.sort === "fee_desc"
          ? { $multiply: ["$deliveryFeeCents", -1] }
          : "$deliveryFeeCents",
        Number.MAX_SAFE_INTEGER,
      ],
    };
  pipeline.push({ $addFields: { _key: key } } as PipelineStage);
  const { cursor: _cursor, ...scope } = query;
  const page = await paginate<ShopRecord & PageRow>(
    "shops",
    pipeline,
    query,
    scope,
    config,
  );
  return { ...page, items: page.rows.map((s) => shopDto(s, refs.categories)) };
}
export async function listProducts(
  query: z.infer<typeof productQuery>,
  config: Config,
) {
  const refs = await publicReferences(
    query.area,
    query.category,
    query.subcategory,
  );
  const shopMatch = eligibleShopFilter(refs, query.area);
  Object.assign(shopMatch,nearbyFilter(query));
  const shopIds = await Shop.find(shopMatch).distinct("_id");
  const match: Record<string, unknown> = {
    active: true,
    "moderation.blocked":{$ne:true},
    shopId: { $in: shopIds },
    categoryId: { $in: refs.categories.map((c) => c._id) },
  };
  if (query.shop) {
    if (!shopIds.includes(query.shop)) match._id = { $in: [] };
    match.shopId = query.shop;
  }
  if (refs.category) match.categoryId = refs.category._id;
  if (refs.subcategory) match.subcategoryId = refs.subcategory.id;
  if (query.inStockOnly) match.totalStock = { $gt: 0 };
  if (query.offersOnly) match._id = { $in: [] }; // Promotions are not a Phase 1 write domain.
  const search = searchStage(query.q, ["name", "description"]);
  if (search.length) match.$and = search;
  const key =
    query.sort === "price_asc"
      ? "$sortPriceCents"
      : query.sort === "price_desc"
        ? { $multiply: ["$sortPriceCents", -1] }
        : "$sortName";
  const pipeline: PipelineStage[] = [
    { $match: match },
    { $addFields: { _key: key } },
  ];
  const { cursor: _cursor, ...scope } = query;
  const page = await paginate<ProductRecord & PageRow>(
    "products",
    pipeline,
    query,
    scope,
    config,
  );
  return {
    ...page,
    items: page.rows.map((p) => productDto(p, refs.categories)),
  };
}
export async function publicShop(slug: string) {
  const refs = await publicReferences();
  const shop = await Shop.findOne({ ...eligibleShopFilter(refs), slug }).lean();
  return shop
    ? shopDto(shop, refs.categories)
    : fail(404, "SHOP_NOT_FOUND", "Shop not found");
}
export async function publicProduct(productId: string, variantId?: string) {
  const refs = await publicReferences();
  const shops = await Shop.find(eligibleShopFilter(refs)).distinct("_id");
  const product = await Product.findOne({
    _id: productId,
    active: true,
    "moderation.blocked":{$ne:true},
    shopId: { $in: shops },
    categoryId: { $in: refs.categories.map((c) => c._id) },
  }).lean();
  if (!product) fail(404, "PRODUCT_NOT_FOUND", "Product not found");
  const dto = productDto(product, refs.categories);
  if (variantId)
    return (
      dto.variants.find((v) => v.id === variantId) ??
      fail(404, "VARIANT_NOT_FOUND", "Variant not found")
    );
  return dto;
}
