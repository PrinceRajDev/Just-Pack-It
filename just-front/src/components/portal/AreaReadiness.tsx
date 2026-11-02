import { UiText, UiAttributes } from "@/lib/i18n/Language";
import type { ManagedArea, ManagedShop } from "@/domain/management";
export function AreaReadiness({ area, shops }: { area: ManagedArea; shops: ManagedShop[] }) {
  const assigned = shops.filter((shop) => shop.serviceAreaIds.includes(area.id));
  const approved = assigned.filter((shop) => shop.active && shop.status === "approved");
  const pinned = approved.filter((shop) => {
    const point = shop.location?.coordinates;
    return (
      point?.length === 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]) &&
      Math.abs(point[0]) <= 180 &&
      Math.abs(point[1]) <= 90
    );
  });
  const missing = approved.filter((shop) => !pinned.includes(shop));
  return (
    <UiAttributes>
      <aside
        className="mb-3 space-y-2 rounded-lg border border-border bg-secondary/30 p-4"
        aria-label={`GPS readiness for ${area.name}`}
      >
        <p className="font-medium">
          {area.name} · <UiText>{area.active ? "Active area" : "Inactive area"}</UiText>
        </p>
        <p className="text-sm">
          {assigned.length} assigned shops · {approved.length} active approved · {pinned.length}{" "}
          with valid map pins · {missing.length} missing pins
        </p>
        <p className="text-sm text-muted-foreground">
          <UiText>
            {!area.active
              ? "This inactive area is excluded from GPS discovery."
              : !assigned.length
                ? "No shops assigned yet. Sellers must choose this service area in their shop profile."
                : !approved.length
                  ? "No active approved shops. Review shop approvals before buyers can discover them."
                  : !pinned.length
                    ? "Approved shops need accurate saved map pins before GPS discovery can find them."
                    : "Map pins are saved. Visibility also depends on the buyer being within 6 km and the shop having an active assigned category. A saved pin does not verify its physical accuracy."}
          </UiText>
        </p>
        {!!missing.length && (
          <p className="break-words text-sm">
            Missing shop pins: {missing.map((shop) => shop.name).join(", ")}. Ask sellers to save
            their shop coordinates, then review the profile again.
          </p>
        )}
      </aside>
    </UiAttributes>
  );
}
