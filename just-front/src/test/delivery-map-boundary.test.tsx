import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DeliveryMapBoundary } from "@/components/store/DeliveryMapBoundary";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("keeps coordinate editing available when optional map download crashes", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  function FailedMap(): never {
    throw new Error("Simulated chunk download failure");
  }
  render(
    <form>
      <label>
        Delivery latitude
        <input defaultValue="26" />
      </label>
      <DeliveryMapBoundary>
        <FailedMap />
      </DeliveryMapBoundary>
      <button>Save address</button>
    </form>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Map unavailable");
  fireEvent.change(screen.getByLabelText("Delivery latitude"), { target: { value: "26.01" } });
  expect(screen.getByLabelText("Delivery latitude")).toHaveValue("26.01");
  expect(screen.getByRole("button", { name: "Save address" })).toBeEnabled();
});
