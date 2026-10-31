import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ShopGpsPin } from "@/components/portal/ShopGpsPin";
import { currentPosition } from "@/services/location";
vi.mock("@/services/location", () => ({ currentPosition: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("requests precise GPS only on click, fills coordinates and marks draft without saving", async () => {
  vi.mocked(currentPosition).mockResolvedValue({ lat: 26, lng: 86 });
  const changed = vi.fn();
  render(<ShopGpsPin onChange={changed} />);
  expect(currentPosition).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
  await screen.findByText(/GPS coordinates filled, not saved/);
  expect(currentPosition).toHaveBeenCalledWith(100);
  expect(screen.getByLabelText("Shop latitude (map pin)")).toHaveValue(26);
  expect(screen.getByLabelText("Shop longitude (map pin)")).toHaveValue(86);
  expect(changed).toHaveBeenCalledOnce();
});
it("preserves existing pin after failed GPS and allows manual entry", async () => {
  vi.mocked(currentPosition).mockRejectedValue(new Error("denied"));
  render(<ShopGpsPin coordinates={[86, 26]} onChange={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Shop latitude (map pin)")).toHaveValue(26);
  fireEvent.change(screen.getByLabelText("Shop latitude (map pin)"), { target: { value: "27" } });
  expect(screen.getByLabelText("Shop latitude (map pin)")).toHaveValue(27);
});
it("does not overwrite a manual edit with a late GPS response", async () => {
  let resolve!: (p: { lat: number; lng: number }) => void;
  vi.mocked(currentPosition).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  render(<ShopGpsPin onChange={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
  fireEvent.change(screen.getByLabelText("Shop latitude (map pin)"), { target: { value: "27" } });
  resolve({ lat: 26, lng: 86 });
  await vi.waitFor(() => expect(screen.getByLabelText("Shop latitude (map pin)")).toHaveValue(27));
});
