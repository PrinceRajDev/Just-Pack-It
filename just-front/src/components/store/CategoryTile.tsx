import { UiText } from "@/lib/i18n/Language";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { Category } from "@/domain/types";
import { CategoryArtwork } from "./CategoryArtwork";

// Presentation assets only. Taxonomy and labels always come from the catalogue service.

export function CategoryTile({ category, shopCount }: { category: Category; shopCount?: number }) {
  return (
    <Link to="/category/$slug" params={{ slug: category.slug }} className="category-directory-card">
      <CategoryArtwork category={category} className="category-directory-photo" />
      <div className="category-directory-copy">
        <h2>{category.name}</h2>
        <p>{category.blurb}</p>
        {shopCount !== undefined && (
          <span>
            <UiText>
              {shopCount
                ? `${shopCount} shop${shopCount === 1 ? "" : "s"} listed`
                : "No shops listed yet"}
            </UiText>
          </span>
        )}
        <ArrowUpRight className="size-4" aria-hidden />
      </div>
    </Link>
  );
}
