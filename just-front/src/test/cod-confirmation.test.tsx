import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CodOrderAction } from "@/components/store/CodOrderAction";
import { readCodAttempt, submitCodAttempt } from "@/services/cod-orders";
import type { CodAttempt, CodOrderInput } from "@/domain/cod";
const state = vi.hoisted(() => ({ removePurchased: vi.fn(), navigate: vi.fn() }));
vi.mock("@/stores/cart", () => ({ useCart: () => ({ removePurchased: state.removePurchased }) }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/services/cod-orders", () => ({
  codAttemptEvent: "test-attempt-change",
  readCodAttempt: vi.fn(),
  submitCodAttempt: vi.fn(),
  resetCodAttempt: vi.fn(),
}));
const input: CodOrderInput = {
  areaId: "a",
  addressId: "address",
  addressVersion: 0,
  expectedTotal: 25,
  paymentMethod: "cod",
  items: [{ productId: "p", qty: 2 }],
  fulfilments: [{ shopId: "s", method: "pickup" }],
};
function mount(value: CodOrderInput | null = input) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CodOrderAction userId="buyer" input={value} />
    </QueryClientProvider>,
  );
}
it("does not mutate the current cart or navigate after the submitting screen unmounts", async () => {
  let finish!: (value: Awaited<ReturnType<typeof submitCodAttempt>>) => void;
  vi.mocked(submitCodAttempt).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = mount();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Place COD order · ₹25" }));
  view.unmount();
  finish({
    order: {
      id: "order",
      createdAt: "now",
      addressId: "address",
      total: 25,
      paymentMethod: "cod",
      paymentStatus: "unpaid",
      subOrders: [],
    },
    input,
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(state.removePurchased).not.toHaveBeenCalled();
  expect(state.navigate).not.toHaveBeenCalled();
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readCodAttempt).mockReturnValue(null);
});
afterEach(cleanup);
it("requires explicit consent and removes purchased lines only after server confirmation", async () => {
  let finish!: (value: Awaited<ReturnType<typeof submitCodAttempt>>) => void;
  vi.mocked(submitCodAttempt).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  mount();
  const button = screen.getByRole("button", { name: "Place COD order · ₹25" });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(button);
  expect(submitCodAttempt).toHaveBeenCalledWith("buyer", input);
  expect(state.removePurchased).not.toHaveBeenCalled();
  finish({
    order: {
      id: "order",
      createdAt: "now",
      addressId: "address",
      total: 25,
      paymentMethod: "cod",
      paymentStatus: "unpaid",
      subOrders: [],
    },
    input,
  });
  await waitFor(() => expect(state.removePurchased).toHaveBeenCalledWith(input.items));
  expect(state.navigate).toHaveBeenCalledWith({
    to: "/orders/$id",
    params: { id: "order" },
    search: { placed: true },
  });
});
it("keeps the bag and route unchanged after an unknown failure", async () => {
  vi.mocked(submitCodAttempt).mockRejectedValue(new Error("Outcome unknown"));
  mount();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Place COD order · ₹25" }));
  await screen.findByRole("alert");
  expect(state.removePurchased).not.toHaveBeenCalled();
  expect(state.navigate).not.toHaveBeenCalled();
});
it("recovers stored attempts explicitly without silently using the current bag", async () => {
  vi.mocked(readCodAttempt).mockReturnValue({
    state: "pending",
    key: "saved-key",
    input,
  } as CodAttempt);
  vi.mocked(submitCodAttempt).mockRejectedValue(new Error("Retry later"));
  mount(null);
  expect(submitCodAttempt).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Recover previous order attempt" }));
  await screen.findByRole("alert");
  expect(submitCodAttempt).toHaveBeenCalledWith("buyer", null);
});
