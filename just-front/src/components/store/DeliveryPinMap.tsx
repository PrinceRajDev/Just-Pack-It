import { config } from "@/lib/config";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
export default function DeliveryPinMap({
  point,
  onChange,
}: {
  point: [number, number];
  onChange: (point: [number, number]) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<LeafletMap | null>(null),
    marker = useRef<Marker | null>(null),
    callback = useRef(onChange);
  callback.current = onChange;
  const [imageryReady, setImageryReady] = useState(false);
  const initial = useRef(point),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const imageryTimer = setTimeout(
      () => setError("Map imagery is taking too long. You can still set coordinates or use GPS."),
      12000,
    );
    void import("leaflet")
      .then((L) => {
        if (cancelled || !container.current) return;
        const [lng, lat] = initial.current,
          m = L.map(container.current).setView([lat, lng], 17);
        map.current = m;
        L.tileLayer(config.mapTileUrl, {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
          referrerPolicy: "strict-origin-when-cross-origin",
        })
          .on("tileload", () => {
            clearTimeout(imageryTimer);
            setImageryReady(true);
          })
          .on("tileerror", () =>
            setError("Map tiles could not load. You can still enter coordinates or use GPS."),
          )
          .addTo(m);
        const icon = L.divIcon({
          className: "",
          html: '<span style="display:block;background:#164b2d;border:3px solid white;box-shadow:0 0 0 2px #164b2d;border-radius:50%;width:24px;height:24px"></span>',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        const pin = L.marker([lat, lng], {
          draggable: true,
          icon,
          alt: "Delivery pin",
          title: "Delivery pin: drag to adjust",
        }).addTo(m);
        marker.current = pin;
        const apply = (p: { lat: number; lng: number }) =>
          callback.current([
            Math.max(-180, Math.min(180, p.lng)),
            Math.max(-90, Math.min(90, p.lat)),
          ]);
        m.on("click", (e) => apply(e.latlng));
        pin.on("dragend", () => apply(pin.getLatLng()));
      })
      .catch(() => setError("Map could not load. Use GPS or coordinate inputs instead."));
    return () => {
      cancelled = true;
      clearTimeout(imageryTimer);
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);
  useEffect(() => {
    const [lng, lat] = point;
    marker.current?.setLatLng([lat, lng]);
    map.current?.panTo([lat, lng]);
  }, [point]);
  return (
    <div className="space-y-2">
      <div
        ref={container}
        className="relative z-0 h-64 w-full rounded-lg"
        aria-label="Delivery map: click or drag pin to adjust"
        role="region"
      />
      {!imageryReady && !error && (
        <p role="status" className="text-sm">
          Loading map imagery…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Click the map or drag the pin. Coordinate fields provide a keyboard alternative.
      </p>
    </div>
  );
}
