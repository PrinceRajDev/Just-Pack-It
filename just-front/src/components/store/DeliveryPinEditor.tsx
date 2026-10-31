import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Address } from "@/domain/types";
import { currentPosition } from "@/services/location";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeliveryMapBoundary } from "./DeliveryMapBoundary";
const Map = lazy(() => import("./DeliveryPinMap"));
export function DeliveryPinEditor({
  value,
  onChange,
}: {
  value: Address["location"];
  onChange: (value: Address["location"]) => void;
}) {
  const [lat, setLat] = useState(String(value?.coordinates[1] ?? "")),
    [lng, setLng] = useState(String(value?.coordinates[0] ?? "")),
    [confirmed, setConfirmed] = useState(false),
    [showMap, setShowMap] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  function change(a: string, b: string) {
    request.current++;
    setBusy(false);
    setLat(a);
    setLng(b);
    setConfirmed(false);
    setError("");
    if (
      a !== "" &&
      b !== "" &&
      Number.isFinite(+a) &&
      Number.isFinite(+b) &&
      Math.abs(+a) <= 90 &&
      Math.abs(+b) <= 180
    )
      onChange({ type: "Point", coordinates: [+b, +a] });
    else onChange(null);
  }
  async function gps() {
    const attempt = ++request.current;
    setBusy(true);
    setError("");
    try {
      const point = await currentPosition(100);
      if (attempt === request.current) change(String(point.lat), String(point.lng));
    } catch {
      if (attempt === request.current)
        setError(
          "Precise GPS unavailable. Allow location permission, retry, or enter the destination coordinates manually.",
        );
    } finally {
      if (attempt === request.current) setBusy(false);
    }
  }
  const hasDraft = lat !== "" || lng !== "",
    valid = !!value;
  return (
    <section className="space-y-3 rounded-lg border p-3" aria-label="Delivery pin editor">
      <h4 className="font-medium">Delivery pin (optional)</h4>
      <p className="text-sm text-muted-foreground">
        Place the pin at your delivery entrance. GPS and map do not verify your house number,
        pincode or address text.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void gps()}>
          {busy ? "Finding destination…" : "Use GPS for delivery pin"}
        </Button>
        {valid && (
          <Button type="button" variant="outline" onClick={() => setShowMap((v) => !v)}>
            {showMap ? "Hide map" : "Adjust on map"}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            change("", "");
            setShowMap(false);
          }}
        >
          Remove pin
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Delivery latitude
          <Input
            type="number"
            inputMode="decimal"
            min={-90}
            max={90}
            step="any"
            value={lat}
            required={hasDraft}
            onChange={(e) => change(e.target.value, lng)}
          />
        </label>
        <label className="text-sm">
          Delivery longitude
          <Input
            type="number"
            inputMode="decimal"
            min={-180}
            max={180}
            step="any"
            value={lng}
            required={hasDraft}
            onChange={(e) => change(lat, e.target.value)}
          />
        </label>
      </div>
      {showMap && value && (
        <>
          <p className="text-xs text-muted-foreground">
            Map tiles load from OpenStreetMap; opening the map shares your IP and viewed map area
            with the tile provider.
          </p>
          <DeliveryMapBoundary>
            <Suspense fallback={<p role="status">Loading map…</p>}>
              <Map point={value.coordinates} onChange={([b, a]) => change(String(a), String(b))} />
            </Suspense>
          </DeliveryMapBoundary>
        </>
      )}
      {hasDraft && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            required
            checked={confirmed && valid}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={!valid}
          />
          I confirm this pin marks my delivery entrance and I have checked the written address.
        </label>
      )}
      {!hasDraft && (
        <p className="text-xs text-muted-foreground">
          Without a pin, checkout checks configured pincode coverage only; precise distance is not
          verified.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
