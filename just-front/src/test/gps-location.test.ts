import { it, expect, vi, afterEach } from "vitest";
import { currentPosition } from "@/services/location";
afterEach(() => vi.unstubAllGlobals());
function gps(callback: (success: PositionCallback, error: PositionErrorCallback) => void) {
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: vi.fn(callback) } });
}
it("requests a fresh precise location and returns coordinates without persisting them", async () => {
  gps((success) =>
    success({ coords: { latitude: 26, longitude: 86, accuracy: 40 } } as GeolocationPosition),
  );
  expect(await currentPosition()).toEqual({ lat: 26, lng: 86 });
});
it("gives manual-area fallback when permission is denied", async () => {
  gps((_success, error) => error({ code: 1 } as GeolocationPositionError));
  await expect(currentPosition()).rejects.toThrow("permission was denied");
});
it("rejects broad location estimates instead of claiming nearby precision", async () => {
  gps((success) =>
    success({ coords: { latitude: 26, longitude: 86, accuracy: 10000 } } as GeolocationPosition),
  );
  await expect(currentPosition()).rejects.toThrow("too broad");
});

it("rejects invalid GPS coordinates and negative accuracy instead of sending them to nearby search", async () => {
  for (const coords of [
    { latitude: NaN, longitude: 86, accuracy: 10 },
    { latitude: 91, longitude: 86, accuracy: 10 },
    { latitude: 26, longitude: 181, accuracy: 10 },
    { latitude: 26, longitude: 86, accuracy: -1 },
  ]) {
    gps((success) => success({ coords } as GeolocationPosition));
    await expect(currentPosition()).rejects.toThrow();
  }
});
it("uses an uncached GPS fix and reports a timeout with a manual fallback", async () => {
  gps((_success, error) => error({ code: 3 } as GeolocationPositionError));
  await expect(currentPosition()).rejects.toThrow(/timed out/);
  expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledWith(
    expect.any(Function),
    expect.any(Function),
    expect.objectContaining({ maximumAge: 0, enableHighAccuracy: true, timeout: 15000 }),
  );
});
