import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import type { Address } from "@/domain/types";
import { DeliveryPinEditor } from "@/components/store/DeliveryPinEditor";
import { currentPosition } from "@/services/location";
vi.mock("@/services/location", () => ({ currentPosition: vi.fn() }));
vi.mock("@/components/store/DeliveryPinMap", () => ({
  default: ({ onChange }: { onChange: (p: [number, number]) => void }) => (
    <button type="button" onClick={() => onChange([86.02, 26.02])}>
      Move map pin
    </button>
  ),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function Form({ initial }: { initial?: Address["location"] }) {
  const [value, setValue] = useState(initial);
  return (
    <form data-testid="pin-form">
      <DeliveryPinEditor value={value} onChange={setValue} />
      <output>{JSON.stringify(value)}</output>
      <button>Save</button>
    </form>
  );
}
it("requires explicit confirmation after GPS capture and every map adjustment", async () => {
  vi.mocked(currentPosition).mockResolvedValue({ lat: 26, lng: 86 });
  render(<Form />);
  expect(currentPosition).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Use GPS for delivery pin" }));
  await screen.findByRole("checkbox");
  expect(screen.getByLabelText("Delivery latitude")).toHaveValue(26);
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("checkbox")).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Adjust on map" }));
  fireEvent.click(await screen.findByRole("button", { name: "Move map pin" }));
  expect(screen.getByLabelText("Delivery longitude")).toHaveValue(86.02);
  expect(screen.getByRole("checkbox")).not.toBeChecked();
});
it("preserves a saved pin on denied GPS and supports explicit removal", async () => {
  vi.mocked(currentPosition).mockRejectedValue(new Error("denied"));
  render(<Form initial={{ type: "Point", coordinates: [86, 26] }} />);
  fireEvent.click(screen.getByRole("button", { name: "Use GPS for delivery pin" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Delivery latitude")).toHaveValue(26);
  fireEvent.click(screen.getByRole("button", { name: "Remove pin" }));
  expect(screen.getByText("null")).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).toBeNull();
});
it("requires paired valid coordinates and resets confirmation after manual changes", () => {
  render(<Form />);
  fireEvent.change(screen.getByLabelText("Delivery latitude"), { target: { value: "26" } });
  expect(screen.getByLabelText("Delivery longitude")).toBeRequired();
  expect(screen.getByRole("checkbox")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Delivery longitude"), { target: { value: "86" } });
  expect(screen.getByRole("checkbox")).toBeEnabled();
  expect(screen.getByRole("checkbox")).toBeRequired();
});
