import { UiText } from "@/lib/i18n/Language";
import { Bike, Store, Truck } from "lucide-react";
import type { FulfilmentMethod, Shop } from "@/domain/types";
import { cn } from "@/lib/utils";
import { imageUrl } from "@/lib/image";
import { isDemoMode } from "@/lib/config";
import { ProductImage } from "./ProductImage";

const demoCoverPositions: Record<string, number> = { s1: 0, s2: 25, s3: 50, s4: 75, s5: 100 };

/** Merchant images take precedence; campaign artwork is only used for labelled demo shops. */
export function ShopCover({ shop, className }: { shop: Shop; className?: string }) {
  if (shop.coverImage)
    return (
      <ProductImage
        src={shop.coverImage}
        alt={`${shop.name} shop cover`}
        className={cn("merchant-cover", className)}
        width={1000}
      />
    );
  const position = demoCoverPositions[shop.id];
  if (isDemoMode && position !== undefined)
    return (
      <div
        className={cn("merchant-cover merchant-cover-demo", className)}
        style={{
          backgroundImage: `url(${imageUrl("/market-storefronts-v2.webp")})`,
          backgroundPosition: `${position}% center`,
        }}
      >
        <span className="merchant-cover-caption">Illustrative demo image</span>
      </div>
    );
  return (
    <div className={cn("merchant-cover merchant-cover-fallback", className)}>
      <ShopInitials shop={shop} />
    </div>
  );
}

export const fulfilmentLabel: Record<FulfilmentMethod, string> = {
  seller_delivery: "Shop delivers",
  platform_delivery: "Just Pack It rider",
  pickup: "Store pickup",
};
const icons = { seller_delivery: Store, platform_delivery: Bike, pickup: Truck };

export function ShopInitials({ shop, className }: { shop: Shop; className?: string }) {
  return (
    <div
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-sm border-2 border-primary bg-card font-display text-lg font-semibold text-primary",
        className,
      )}
      aria-hidden
    >
      {shop.initials}
    </div>
  );
}

export function FulfilmentChips({ methods }: { methods: FulfilmentMethod[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {methods.map((m) => {
        const I = m === "pickup" ? Store : icons[m];
        return (
          <li
            key={m}
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2 py-0.5 text-xs"
          >
            <I className="size-3.5" aria-hidden /> {fulfilmentLabel[m]}
          </li>
        );
      })}
    </ul>
  );
}

export function OpenState({ shop }: { shop: Shop }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        shop.isOpen ? "text-success" : "text-destructive",
      )}
    >
      <span className="size-2 rounded-full bg-current" aria-hidden />
      <UiText>
        {shop.temporarilyClosed || shop.availability === "temporarily_closed"
          ? "Temporarily closed"
          : shop.isOpen
            ? "Open now"
            : "Closed"}
      </UiText>{" "}
      · {shop.scheduleLabel ?? shop.hours}
    </span>
  );
}
