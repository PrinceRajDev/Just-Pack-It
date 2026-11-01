import type {
  ShopRecord,
  ProductRecord,
  CategoryRecord,
  AreaRecord,
  Variant,
} from "./models.js";
export function isOpen(shop: ShopRecord, now = new Date()) {
  if (shop.temporarilyClosed || !shop.active || shop.status !== "approved")
    return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: shop.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    part("weekday"),
  );
  const minute = Number(part("hour")) * 60 + Number(part("minute"));
  const minutes = (time: string) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return shop.openingHours.some((interval) => {
    const start = minutes(interval.opens),
      end = minutes(interval.closes);
    return start < end
      ? interval.day === day && minute >= start && minute < end
      : (interval.day === day && minute >= start) ||
          ((interval.day + 1) % 7 === day && minute < end);
  });
}
export const areaDto = (area: AreaRecord) => ({
  id: area._id,
  name: area.name,
  city: area.city,
  pincodes: area.pincodes,
  active: area.active,
  version: area.version,
});
export function scheduleLabel(shop: ShopRecord, now = new Date()) {
  if (!shop.openingHours.length) return "Operating hours not set";
  const dayName = new Intl.DateTimeFormat("en-US", { timeZone: shop.timezone, weekday: "short" }).format(now);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dayName);
  const today = shop.openingHours.filter(h => h.day === day).sort((a,b) => a.opens.localeCompare(b.opens));
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: shop.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const overnight = shop.openingHours.filter(h => (h.day + 1) % 7 === day && h.closes < h.opens && time < h.closes).map(h => `Overnight until ${h.closes}`);
  const labels = [...overnight, ...today.map(h => `${h.opens} to ${h.closes}${h.closes < h.opens ? " (+1 day)" : ""}`)];
  return (labels.length ? labels.join(", ") : "Closed today") + ` · ${shop.timezone}`;
}
export const categoryDto = (category: CategoryRecord) => ({
  id: category._id,
  slug: category.slug,
  name: category.name,
  blurb: category.blurb,
  image: category.image,
  version: category.version,
  subcategories: category.subcategories
    .filter((s) => s.active)
    .map((s) => ({
      id: s._id,
      categoryId: category._id,
      slug: s.slug,
      name: s.name,
    })),
});
export const shopDto = (shop: ShopRecord, categories: CategoryRecord[]) => ({
  id: shop._id,
  slug: shop.slug,
  name: shop.name,
  tagline: shop.tagline,
  description: shop.description,
  locality: shop.locality,
  address: shop.address,
  location:shop.location?.type==="Point" && shop.location.coordinates?.length===2 ? {type:"Point",coordinates:shop.location.coordinates} : undefined,
  categories: categories
    .filter((c) => shop.categoryIds.includes(c._id))
    .map((c) => c.slug),
  categoryIds: shop.categoryIds,
  subcategoryIds: shop.subcategoryIds,
  serviceAreaIds: shop.areaIds,
  isOpen: isOpen(shop),
  availability: shop.temporarilyClosed ? "temporarily_closed" : isOpen(shop) ? "open" : "closed",
  scheduleLabel: scheduleLabel(shop),
  hours: scheduleLabel(shop),
  timezone: shop.timezone,
  openingHours: shop.openingHours.map((h) => ({
    day: h.day,
    opens: h.opens,
    closes: h.closes,
  })),
  fulfilment: shop.fulfilment,
  since: shop.since,
  initials: shop.initials,
  coverImage: shop.coverImage,
  deliveryFee:
    shop.deliveryFeeCents === undefined
      ? undefined
      : shop.deliveryFeeCents / 100,
  minimumOrderAmount:
    shop.minimumOrderCents === undefined
      ? undefined
      : shop.minimumOrderCents / 100,
  pickupNote: shop.pickupNote,
  version: shop.version,
});
export const variantDto = (v: Variant) => ({
  id: v._id,
  label: v.label,
  price: v.priceCents / 100,
  stock: v.stock,
  attributes: v.attributes.map((a) => ({ label: a.label, value: a.value })),
});
export const productDto = (p: ProductRecord, categories: CategoryRecord[]) => ({
  id: p._id,
  shopId: p.shopId,
  name: p.name,
  unit: p.unit,
  description: p.description,
  categoryId: p.categoryId,
  categorySlug: categories.find((c) => c._id === p.categoryId)?.slug,
  subcategoryId: p.subcategoryId,
  price: p.priceCents / 100,
  mrp: p.mrpCents === undefined ? undefined : p.mrpCents / 100,
  stock: p.totalStock,
  image: p.image,
  attributes: p.attributes.map((a) => ({ label: a.label, value: a.value })),
  tags: p.tags,
  variants: p.variants.filter((v) => v.active).map(variantDto),
  version: p.version,
});
