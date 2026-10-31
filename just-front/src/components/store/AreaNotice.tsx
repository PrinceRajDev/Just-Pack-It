import { useLocationArea } from "@/stores/location";
import { LocationPicker } from "./StoreHeader";
import { isDemoMode } from "@/lib/config";
import { GpsAddressConfirmation } from "./GpsAddressConfirmation";

export function AreaNotice() {
  const {
    area,
    ready,
    isError,
    gps,
    requestGps,
    locating,
    locationError,
    gpsAddressPrompted,
    acknowledgeGpsAddress,
  } = useLocationArea();
  return (
    <section
      className="mx-4 my-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 md:mx-8 xl:mx-12"
      aria-label="Shopping area"
    >
      <div aria-live="polite">
        <p className="text-sm font-semibold">
          {!ready && !isError
            ? "Loading your area…"
            : area
              ? `Shopping in ${area.name}`
              : "Choose your area to discover local shops"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {area
            ? gps
              ? "Showing eligible shops within 6 km of your GPS location. Distance is straight-line; delivery is checked at checkout."
              : `${isDemoMode ? "Demo availability. " : ""}Shop and product results follow your selected area.`
            : "Select an available neighbourhood below. Shops appear after you choose an area."}
        </p>
      </div>
      {!gps && (
        <button
          type="button"
          disabled={locating}
          onClick={() => void requestGps()}
          className="min-h-11 rounded-lg bg-primary px-4 text-sm text-primary-foreground"
        >
          {locating ? "Finding your location…" : "Use my location · within 6 km"}
        </button>
      )}
      {locationError && (
        <p role="alert" className="w-full text-sm">
          {locationError}
        </p>
      )}
      <LocationPicker />
      {gps && area && (
        <GpsAddressConfirmation
          key={`${gps.lat}:${gps.lng}:${area.id}`}
          area={area}
          initialPoint={gps}
          autoOpen={!gpsAddressPrompted}
          onPrompted={acknowledgeGpsAddress}
        />
      )}
    </section>
  );
}
