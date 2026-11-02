import { UiText, UiAttributes } from "@/lib/i18n/Language";
import type { Shop } from "@/domain/types";
import { validOffer } from "@/lib/offers";
import { inr } from "@/lib/image";
export function ShopOffer({ shop }: { shop: Shop }) {
  if (!validOffer(shop.offer)) return null;
  const offer = shop.offer;
  return (
    <UiAttributes>
      <section
        aria-label={`${shop.name} offer`}
        className="mt-4 rounded-xl border border-primary/20 bg-secondary p-4 text-sm"
      >
        <p className="font-semibold">
          <UiText>{offer.label}</UiText> · {shop.name} only
        </p>
        <p className="mt-1">
          Valid until{" "}
          {new Date(offer.validUntil).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
        </p>
        <p className="mt-1">
          <UiText>
            {offer.minimumSpend !== undefined
              ? `Minimum spend: ${inr(offer.minimumSpend)}`
              : "Minimum spend not provided"}
          </UiText>
        </p>
        <p className="mt-1 text-muted-foreground">
          {offer.conditions || "Offer conditions not provided. Confirm eligibility at checkout."}
        </p>
      </section>
    </UiAttributes>
  );
}
