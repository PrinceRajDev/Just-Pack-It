import { cleanup, render, screen, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LoadingState } from "@/components/common/LoadingState";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("announces loading and keeps decorative skeletons out of the accessibility tree", () => {
  render(<LoadingState label="Loading orders…" />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading orders…");
  expect(screen.getByLabelText("Loading orders…")).toHaveAttribute("aria-busy", "true");
  expect(screen.queryByText(/longer than usual/)).toBeNull();
});
it("explains a slow request and clears the timeout when loading finishes", () => {
  vi.useFakeTimers();
  const view = render(<LoadingState />);
  act(() => {
    vi.advanceTimersByTime(12000);
  });
  expect(screen.getByText(/longer than usual/)).toBeInTheDocument();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
