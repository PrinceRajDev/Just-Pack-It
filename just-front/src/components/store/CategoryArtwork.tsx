import type { Category } from "@/domain/types";
import { isDemoMode } from "@/lib/config";
import { ProductImage } from "./ProductImage";

// Presentation defaults only: taxonomy, eligibility and labels remain server-owned.
const categoryArtworkSlugs = [
  "grocery-kirana",
  "fruits-vegetables",
  "dairy-eggs",
  "fast-food-snacks",
  "restaurants-meals",
  "sweets-bakery",
  "fashion",
  "meat-seafood",
  "electronics",
  "personal-care-household",
  "stationery-books",
  "toys-gifts-decor",
  "pooja-supplies",
  "hardware-electrical-plumbing",
  "kitchen-home-goods",
  "flowers-plants",
  "pet-supplies",
] as const;

export function CategoryArtwork({
  category,
  className,
  width = 400,
}: {
  category: Category;
  className?: string;
  width?: number;
}) {
  const fallback = categoryArtworkSlugs.some((slug) => slug === category.slug)
    ? `/categories/${category.slug}-v1.webp`
    : undefined;
  // Demo bundled product photos are not category-specific artwork.
  const customImage = category.image?.trim();
  const source = isDemoMode ? fallback || customImage : customImage || fallback;
  return (
    <ProductImage
      src={source || fallback}
      fallbackSrc={fallback}
      alt=""
      className={className}
      width={width}
    />
  );
}
