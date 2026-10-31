import type { Offer } from "@/domain/types";
export function validOffer(offer?: Offer, now = Date.now()): offer is Offer {
  if (!offer || !offer.label.trim()) return false;
  if (
    offer.minimumSpend !== undefined &&
    (!Number.isFinite(offer.minimumSpend) || offer.minimumSpend < 0)
  )
    return false;
  const end = Date.parse(offer.validUntil);
  const start = offer.validFrom ? Date.parse(offer.validFrom) : -Infinity;
  return Number.isFinite(end) && start <= now && now < end;
}
