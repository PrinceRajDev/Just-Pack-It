import type { Request, Response } from "express";
import type { Config } from "../config/env.js";
import { productQuery, shopQuery } from "./validators.js";
import {
  listProducts,
  listShops,
  publicShop,
  publicProduct,
} from "./public-service.js";
import { Area, Category } from "./models.js";
import { areaDto, categoryDto } from "./presenters.js";
import { id, slug } from "../common/validation.js";
const param = (req: Request, key: string) => String(req.params[key]);
export function pageResponse(
  res: Response,
  page: { items: unknown[]; total: number; next?: string },
) {
  res.setHeader("X-Total-Count", String(page.total));
  res.setHeader("X-Has-More", String(!!page.next));
  if (page.next) res.setHeader("X-Next-Cursor", page.next);
  return res.json(page.items);
}
export function publicControllers(config: Config) {
  return {
    areas: async (_req: Request, res: Response) =>
      res.json((await Area.find({ active: true }).lean()).map(areaDto)),
    categories: async (_req: Request, res: Response) =>
      res.json(
        (
          await Category.find({ active: true }).sort({ name: 1, _id: 1 }).lean()
        ).map(categoryDto),
      ),
    shops: async (req: Request, res: Response) =>
      pageResponse(res, await listShops(shopQuery.parse(req.query), config)),
    products: async (req: Request, res: Response) =>
      pageResponse(
        res,
        await listProducts(productQuery.parse(req.query), config),
      ),
    shopProducts: async (req: Request, res: Response) =>
      pageResponse(
        res,
        await listProducts(
          productQuery.parse({
            ...req.query,
            shop: id.parse(param(req, "shopId")),
          }),
          config,
        ),
      ),
    shop: async (req: Request, res: Response) =>
      res.json(await publicShop(slug.parse(param(req, "slug")))),
    product: async (req: Request, res: Response) =>
      res.json(await publicProduct(id.parse(param(req, "productId")))),
    variant: async (req: Request, res: Response) =>
      res.json(
        await publicProduct(
          id.parse(param(req, "productId")),
          id.parse(param(req, "variantId")),
        ),
      ),
  };
}
export { param };
