import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useEffect, useRef, useState } from "react";
import { currentPosition } from "@/services/location";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
export function ShopGpsPin({
  coordinates,
  locationName,
  onChange,
}: {
  coordinates?: [number, number];
  locationName?: string;
  onChange: () => void;
}) {
  const [lat, setLat] = useState(String(coordinates?.[1] ?? "")),
    [lng, setLng] = useState(String(coordinates?.[0] ?? "")),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function detect() {
    const attempt = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const point = await currentPosition(100);
      if (attempt !== generation.current) return;
      setLat(String(point.lat));
      setLng(String(point.lng));
      onChange();
      setNotice(
        "Shop location selected, not saved. Check your shop address, then save the profile for admin review.",
      );
    } catch {
      if (attempt === generation.current)
        setError(
          "Could not get a precise shop location. Allow precise GPS while standing at your shop and try again. Your saved location is unchanged.",
        );
    } finally {
      if (attempt === generation.current) setBusy(false);
    }
  }
  return (
    <UiAttributes>
      <section className="space-y-3 rounded-lg border p-3 md:col-span-2" aria-label="Shop GPS pin">
        <p className="text-sm font-medium">
          <UiText>Shop location</UiText>
        </p>
        <p className="text-sm text-muted-foreground">
          Use GPS only while physically at the shop. This pin helps nearby buyers discover you;
          saving a changed profile requires admin approval.
        </p>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void detect()}>
          <UiText>{busy ? "Finding shop location…" : "Use my current location"}</UiText>
        </Button>
        <div className="flex items-start gap-3 rounded-lg bg-secondary/50 p-3">
          <MapPin size={20} className="mt-1 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">
              <UiText>Shop address</UiText>
            </p>
            <p className="mt-1 break-words">
              {locationName?.trim() || <UiText>Add your shop address above</UiText>}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              <UiText>
                {lat && lng
                  ? "Map pin available. Updating the address text does not move the pin; use GPS at your shop to update it."
                  : "Use GPS at your shop to add its map pin."}
              </UiText>
            </p>
          </div>
        </div>
        <input type="hidden" name="latitude" value={lat} />
        <input type="hidden" name="longitude" value={lng} />
        {notice && (
          <p role="status" className="text-sm">
            <UiText>{notice}</UiText>
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm">
            <UiText>{error}</UiText>
          </p>
        )}
      </section>
    </UiAttributes>
  );
}
