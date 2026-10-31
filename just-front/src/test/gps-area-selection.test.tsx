import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocationProvider, useLocationArea } from "@/stores/location";
import { currentPosition, resolveLocation } from "@/services/location";
vi.mock("@/services/catalog", () => ({
  areasQuery: () => ({
    queryKey: ["test-areas"],
    queryFn: async () => [
      { id: "a", name: "Area A", active: true },
      { id: "b", name: "Area B", active: true },
    ],
  }),
}));
vi.mock("@/services/location", () => ({ currentPosition: vi.fn(), resolveLocation: vi.fn() }));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.resetAllMocks();
});
function Probe() {
  const l = useLocationArea();
  return (
    <>
      <p>{l.ready ? "ready" : "loading"}</p>
      <p>{l.area?.name ?? "no area"}</p>
      <button onClick={() => void l.requestGps()}>GPS</button>
    </>
  );
}
it("auto-selects a recommended area even when multiple nearby areas exist", async () => {
  vi.mocked(currentPosition).mockResolvedValue({ lat: 26, lng: 86 });
  vi.mocked(resolveLocation).mockResolvedValue({
    radiusKm: 6,
    recommendedAreaId: "b",
    areas: [
      { id: "a", name: "Area A", active: true, city: "TEST", pincodes: [] },
      { id: "b", name: "Area B", active: true, city: "TEST", pincodes: [] },
    ],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LocationProvider>
        <Probe />
      </LocationProvider>
    </QueryClientProvider>,
  );
  await screen.findByText("ready");
  fireEvent.click(screen.getByText("GPS"));
  expect(await screen.findByText("Area B")).toBeInTheDocument();
  expect(localStorage.getItem("jpi.area")).toBeNull();
});
it("does not accept a recommendation outside the eligible response areas", async () => {
  vi.mocked(currentPosition).mockResolvedValue({ lat: 26, lng: 86 });
  vi.mocked(resolveLocation).mockResolvedValue({
    radiusKm: 6,
    recommendedAreaId: "outside",
    areas: [],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LocationProvider>
        <Probe />
      </LocationProvider>
    </QueryClientProvider>,
  );
  await screen.findByText("ready");
  fireEvent.click(screen.getByText("GPS"));
  await vi.waitFor(() => expect(resolveLocation).toHaveBeenCalled());
  expect(screen.getByText("no area")).toBeInTheDocument();
});
