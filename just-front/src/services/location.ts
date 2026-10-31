import { api } from "@/lib/api/client";
import { isDemoMode } from "@/lib/config";
import type { ServiceArea } from "@/domain/types";
export interface GpsPoint {
  lat: number;
  lng: number;
}
export const resolveLocation = (point: GpsPoint) => {
  if (isDemoMode)
    throw new Error("GPS discovery needs the connected marketplace. Choose a demo area manually.");
  return api<{ radiusKm: 6; areas: ServiceArea[]; recommendedAreaId?: string }>(
    `/location/resolve?${new URLSearchParams({ lat: String(point.lat), lng: String(point.lng) })}`,
    { signal: AbortSignal.timeout(15000) },
  );
};
export function currentPosition(maxAccuracyMeters = 1500): Promise<GpsPoint> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext || !navigator.geolocation) {
      reject(
        new Error(
          "GPS needs a supported browser and HTTPS (or localhost). Choose your area manually.",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (
          !Number.isFinite(position.coords.accuracy) ||
          position.coords.accuracy < 0 ||
          position.coords.accuracy > maxAccuracyMeters ||
          !Number.isFinite(position.coords.latitude) ||
          !Number.isFinite(position.coords.longitude) ||
          Math.abs(position.coords.latitude) > 90 ||
          Math.abs(position.coords.longitude) > 180
        ) {
          reject(
            new Error(
              "Your location estimate is too broad. Turn on precise location and retry, or choose your area manually.",
            ),
          );
          return;
        }
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (error) =>
        reject(
          new Error(
            error.code === 1
              ? "Location permission was denied. Allow it in browser settings or choose your area manually."
              : error.code === 3
                ? "Location request timed out. Retry outdoors or choose your area manually."
                : "Could not find your location. Turn on device location and retry, or choose your area manually.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
