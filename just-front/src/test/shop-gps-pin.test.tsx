import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ShopGpsPin } from "@/components/portal/ShopGpsPin";
import { currentPosition } from "@/services/location";
vi.mock("@/services/location", () => ({ currentPosition: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("shows a readable address and submits GPS coordinates as hidden fields only", async () => {
  vi.mocked(currentPosition).mockResolvedValue({ lat: 26, lng: 86 });
  const changed = vi.fn();
  const view = render(
    <form>
      <ShopGpsPin locationName="Market Road, Town" onChange={changed} />
    </form>,
  );
  expect(screen.getByText("Market Road, Town")).toBeInTheDocument();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  expect(currentPosition).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
  await screen.findByText(/Shop location selected, not saved/);
  expect(currentPosition).toHaveBeenCalledWith(100);
  const data = new FormData(view.container.querySelector("form")!);
  expect(data.get("latitude")).toBe("26");
  expect(data.get("longitude")).toBe("86");
  expect(changed).toHaveBeenCalledOnce();
});
it("preserves the saved pin after GPS fails and does not pretend an address is geocoded", async () => {
  vi.mocked(currentPosition).mockRejectedValue(new Error("denied"));
  const view = render(
    <form>
      <ShopGpsPin coordinates={[86, 26]} locationName="Shop street" onChange={() => {}} />
    </form>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
  await screen.findByRole("alert");
  expect(new FormData(view.container.querySelector("form")!).get("latitude")).toBe("26");
  expect(screen.getByText(/Updating the address text does not move the pin/)).toBeInTheDocument();
});
it("ignores GPS results after the form unmounts", async () => {
  let resolve!: (point: { lat: number; lng: number }) => void;
  vi.mocked(currentPosition).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const changed = vi.fn();
  const view = render(<ShopGpsPin onChange={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
  view.unmount();
  resolve({ lat: 26, lng: 86 });
  await Promise.resolve();
  await Promise.resolve();
  expect(changed).not.toHaveBeenCalled();
});
