import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useEffect, useRef, useState } from "react";
import { currentPosition } from "@/services/location";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function ShopGpsPin({
  coordinates,
  onChange,
}: {
  coordinates?: [number, number];
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
        "GPS coordinates filled, not saved. Check that you are at your shop, then save the shop profile for admin review.",
      );
    } catch {
      if (attempt === generation.current)
        setError(
          "Could not get a precise shop location (within 100 m). Allow precise GPS while standing at your shop, retry, or enter verified coordinates manually.",
        );
    } finally {
      if (attempt === generation.current) setBusy(false);
    }
  }
  function edit(update: () => void) {
    generation.current++;
    setBusy(false);
    setNotice("");
    setError("");
    update();
    onChange();
  }
  return (
    <UiAttributes>
      <section className="space-y-3 rounded-lg border p-3 md:col-span-2" aria-label="Shop GPS pin">
        <p className="text-sm font-medium">Your shop’s map pin</p>
        <p className="text-sm text-muted-foreground">
          Use GPS only while physically at the shop. This pin helps nearby buyers discover you;
          saving a changed profile requires admin approval.
        </p>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void detect()}>
          <UiText>{busy ? "Finding shop location…" : "Use my current location"}</UiText>
        </Button>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Shop latitude (map pin)
            <Input
              type="number"
              name="latitude"
              step="any"
              min={-90}
              max={90}
              value={lat}
              onChange={(e) => edit(() => setLat(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Shop longitude (map pin)
            <Input
              type="number"
              name="longitude"
              step="any"
              min={-180}
              max={180}
              value={lng}
              onChange={(e) => edit(() => setLng(e.target.value))}
            />
          </label>
        </div>
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm">
            {error}
          </p>
        )}
      </section>
    </UiAttributes>
  );
}
