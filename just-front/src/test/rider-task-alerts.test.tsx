import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { RiderTaskAlerts } from "@/components/portal/RiderTaskAlerts";
import type { LiveDeliveryTask } from "@/domain/live-delivery";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props} onClickCapture={(event) => event.preventDefault()}>
      {children}
    </a>
  ),
}));
const task = (id: string) =>
  ({ id, orderId: `order-${id}`, status: "available" }) as LiveDeliveryTask;
const props = { tasks: [] as LiveDeliveryTask[], watching: true, ready: true, error: false };
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("baselines existing tasks and only announces new available IDs once", async () => {
  const view = render(<RiderTaskAlerts {...props} tasks={[task("a")]} />);
  expect(screen.getByRole("status")).toHaveTextContent("Watching");
  view.rerender(<RiderTaskAlerts {...props} tasks={[task("a"), task("b")]} />);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 newly available"));
  view.rerender(<RiderTaskAlerts {...props} tasks={[task("a"), task("b")]} />);
  expect(screen.getByRole("status")).toHaveTextContent("1 newly available");
  fireEvent.click(screen.getByRole("link", { name: "Review delivery tasks" }));
  expect(screen.getByRole("status")).toHaveTextContent("Watching");
  view.rerender(<RiderTaskAlerts {...props} tasks={[task("a"), task("b")]} />);
  expect(screen.getByRole("status")).toHaveTextContent("Watching");
});
it("does not announce offline, failed or first reconnect results", async () => {
  const view = render(<RiderTaskAlerts {...props} />);
  view.rerender(<RiderTaskAlerts {...props} error tasks={[task("a")]} />);
  expect(screen.getByRole("status")).toHaveTextContent("failed");
  view.rerender(<RiderTaskAlerts {...props} watching={false} tasks={[task("a")]} />);
  expect(screen.getByRole("status")).toHaveTextContent("paused");
  view.rerender(<RiderTaskAlerts {...props} tasks={[task("a")]} />);
  expect(screen.getByRole("status")).toHaveTextContent("Watching");
});
it("keeps sound opt-in, chimes once per new task batch and closes audio", async () => {
  const start = vi.fn(),
    close = vi.fn().mockResolvedValue(undefined),
    ctx = {
      state: "running",
      currentTime: 0,
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      close,
      createOscillator: () => ({ frequency: { value: 0 }, connect: vi.fn(), start, stop: vi.fn() }),
      createGain: () => ({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      }),
    };
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return ctx;
      }
    },
  );
  const view = render(<RiderTaskAlerts {...props} />);
  expect(start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Enable task sound" }));
  await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  view.rerender(<RiderTaskAlerts {...props} tasks={[task("a")]} />);
  await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
  view.rerender(<RiderTaskAlerts {...props} tasks={[task("a")]} />);
  expect(start).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Turn task sound off" }));
  view.rerender(<RiderTaskAlerts {...props} tasks={[task("a"), task("b")]} />);
  expect(start).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(close).toHaveBeenCalledTimes(1);
});
it("shows a useful fallback when browser audio is unavailable", async () => {
  vi.stubGlobal("AudioContext", undefined);
  render(<RiderTaskAlerts {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Enable task sound" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Visual task alerts remain active");
});
