import type { Address } from "@/domain/types";
export function DeliveryPinLink({ location }: { location: Address["location"] }) {
  if (!location) return null;
  const [lng, lat] = location.coordinates;
  return (
    <p className="text-sm">
      <a
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4"
      >
        View confirmed delivery pin on OpenStreetMap (new tab)
      </a>
    </p>
  );
}
