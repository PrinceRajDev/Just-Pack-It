import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { areasQuery } from "@/services/catalog";
import type { ServiceArea } from "@/domain/types";
import { currentPosition, resolveLocation, type GpsPoint } from "@/services/location";

const Ctx = createContext<{
  area: ServiceArea | null;
  areas: ServiceArea[];
  ready: boolean;
  isError: boolean;
  retry: () => void;
  setArea: (id: string) => void;
  gps: GpsPoint | null;
  locating: boolean;
  locationError: string | undefined;
  requestGps: () => Promise<void>;
  gpsAreaIds: string[];
  chooseGpsArea: (id: string) => void;
  gpsAddressPrompted: boolean;
  acknowledgeGpsAddress: () => void;
} | null>(null);
const KEY = "jpi.area";

/** User-selected service area. We never guess the user's location. */
export function LocationProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const request = useRef(0);
  const [restored, setRestored] = useState(false);
  const [gps, setGps] = useState<GpsPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string>();
  const [gpsAreaIds, setGpsAreaIds] = useState<string[]>([]);
  const [gpsAddressPrompted, setGpsAddressPrompted] = useState(false);
  const { data: areas = [], isPending, isError, refetch } = useQuery(areasQuery());
  useEffect(() => {
    try {
      setId(localStorage.getItem(KEY));
    } catch {
      /* Storage may be disabled. */
    }
    setRestored(true);
  }, []);
  const area = areas.find((z) => z.id === id && z.active) ?? null;
  return (
    <Ctx.Provider
      value={{
        area,
        gps,
        locating,
        locationError,
        gpsAreaIds,
        gpsAddressPrompted,
        acknowledgeGpsAddress: () => setGpsAddressPrompted(true),
        requestGps: async () => {
          if (locating) return;
          const current = ++request.current;
          setLocating(true);
          setLocationError(undefined);
          try {
            const point = await currentPosition(),
              result = await resolveLocation(point);
            if (current !== request.current) return;
            setGps(point);
            setGpsAddressPrompted(false);
            setGpsAreaIds(result.areas.map((item) => item.id));
            setId(
              result.areas.find((area) => area.id === result.recommendedAreaId)?.id ??
                (result.areas.length === 1 ? result.areas[0].id : null),
            );
            try {
              localStorage.removeItem(KEY);
            } catch {
              /* GPS coordinates are never persisted. */
            }
            if (!result.areas.length)
              setLocationError(
                "No eligible shops with saved map locations were found within 6 km. Choose an area manually or try another location.",
              );
          } catch (error) {
            if (current !== request.current) return;
            setLocationError(
              error instanceof Error
                ? error.message
                : "Could not find your location. Choose an area manually.",
            );
          } finally {
            if (current === request.current) setLocating(false);
          }
        },
        chooseGpsArea: (v) => {
          if (gpsAreaIds.includes(v)) setId(v);
        },
        areas,
        ready: restored && !isPending,
        isError,
        retry: () => {
          void refetch();
        },
        setArea: (v) => {
          if (!areas.some((z) => z.id === v && z.active)) return;
          request.current++;
          setLocating(false);
          setId(v);
          setGps(null);
          setGpsAddressPrompted(false);
          setGpsAreaIds([]);
          setLocationError(undefined);
          try {
            localStorage.setItem(KEY, v);
          } catch {
            /* Keep selection in memory. */
          }
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useLocationArea() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLocationArea outside provider");
  return c;
}
