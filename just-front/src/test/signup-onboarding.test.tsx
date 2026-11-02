import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LiveAuthForm } from "@/components/auth/LiveAuthForm";
import { management } from "@/services/management";
import { authentication } from "@/services/auth";
import { googleIdentity } from "@/services/google-auth";
import { ApiError } from "@/lib/api/client";
vi.mock("@/services/google-auth", () => ({ googleConfigured: true, googleIdentity: vi.fn() }));
vi.mock("@/services/auth", () => ({
  authentication: { registrationOptions: vi.fn(), sendEmailOtp: vi.fn() },
}));
const auth = vi.hoisted(() => ({
  registerBuyer: vi.fn(),
  registerSeller: vi.fn(),
  registerDelivery: vi.fn(),
  loginPassword: vi.fn(),
  loginGoogle: vi.fn(),
}));
vi.mock("@/stores/auth", () => ({ useAuth: () => auth }));
vi.mock("@/services/management", () => ({ management: { categories: vi.fn(), areas: vi.fn() } }));
const categoryId = "11111111-1111-4111-8111-111111111111";
const areaId = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.mocked(authentication.registrationOptions).mockResolvedValue({
    emailOtpRequired: false,
    emailOtpAvailable: false,
  });
  vi.mocked(management.categories).mockResolvedValue([
    {
      id: categoryId,
      slug: "grocery",
      name: "Grocery",
      blurb: "",
      image: "",
      subcategories: [],
      version: 0,
    },
  ]);
  vi.mocked(management.areas).mockResolvedValue([
    {
      id: areaId,
      name: "Test locality",
      city: "Test town",
      pincodes: ["000000"],
      active: true,
      version: 0,
    },
  ]);
  auth.registerBuyer.mockResolvedValue({ role: "buyer" });
  auth.registerSeller.mockResolvedValue({ role: "seller" });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function mount() {
  const success = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LiveAuthForm onSuccess={success} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "New here? Create an account" }));
  return success;
}
function identity() {
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Test owner" } });
  fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "9876543210" } });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "Test-only-password-2026" },
  });
}
describe("Google onboarding", () => {
  it("uses verified Google proof while still requiring buyer details", async () => {
    vi.mocked(authentication.registrationOptions).mockResolvedValue({
      emailOtpRequired: true,
      emailOtpAvailable: false,
      googleSignInAvailable: true,
    });
    vi.mocked(googleIdentity).mockResolvedValue({
      idToken: "qa-google-proof",
      email: "qa@example.invalid",
      name: "Google buyer",
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));
    await screen.findByText(/Email selected with Google/);
    identity();
    fireEvent.click(screen.getByRole("button", { name: "Create buyer account" }));
    await waitFor(() =>
      expect(auth.registerBuyer).toHaveBeenCalledWith(
        "Test owner",
        "+919876543210",
        "Test-only-password-2026",
        { email: "qa@example.invalid", googleIdToken: "qa-google-proof" },
      ),
    );
  });
  it("routes a new Google identity into onboarding instead of creating an account immediately", async () => {
    vi.mocked(authentication.registrationOptions).mockResolvedValue({
      emailOtpRequired: true,
      emailOtpAvailable: false,
      googleSignInAvailable: true,
    });
    vi.mocked(googleIdentity).mockResolvedValue({
      idToken: "qa-google-proof",
      email: "qa@example.invalid",
      name: "Google buyer",
    });
    auth.loginGoogle.mockRejectedValue(
      new ApiError("Complete registration", 409, "GOOGLE_ONBOARDING_REQUIRED"),
    );
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));
    await screen.findByText(/Email selected with Google/);
    expect(screen.getByRole("button", { name: "Create buyer account" })).toBeInTheDocument();
    expect(auth.registerBuyer).not.toHaveBeenCalled();
  });
  it("keeps phone/password login available after popup cancellation", async () => {
    vi.mocked(authentication.registrationOptions).mockResolvedValue({
      emailOtpRequired: false,
      emailOtpAvailable: false,
      googleSignInAvailable: true,
    });
    vi.mocked(googleIdentity).mockRejectedValue(new Error("Google sign-in cancelled."));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Google sign-in cancelled");
    expect(screen.getByRole("button", { name: /^Sign in$/ })).toBeEnabled();
  });
});
describe("Buyer/seller signup", () => {
  it("ignores duplicate submits while authentication is pending", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));
    let finish!: (value: { role: string }) => void;
    auth.loginPassword.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "QA-only-password-2026" },
    });
    const form = screen.getByRole("button", { name: /^Sign in$/ }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(auth.loginPassword).toHaveBeenCalledOnce());
    finish({ role: "buyer" });
    await waitFor(() => expect(screen.getByRole("button", { name: /^Sign in$/ })).toBeEnabled());
    expect(auth.loginPassword).toHaveBeenCalledOnce();
  });
  it.each(["buyer", "seller", "delivery", "admin"])(
    "uses the server-issued %s role after login",
    async (role) => {
      const success = mount();
      fireEvent.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));
      auth.loginPassword.mockResolvedValue({ role });
      fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "9876543210" } });
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "QA-only-password-2026" },
      });
      fireEvent.submit(screen.getByRole("button", { name: /^Sign in$/ }).closest("form")!);
      await waitFor(() => expect(success).toHaveBeenCalledWith(role, false));
      expect(auth.loginPassword).toHaveBeenCalledWith("+919876543210", "QA-only-password-2026");
    },
  );
  it("offers buyer, seller and delivery registration and keeps buyer signup simple", async () => {
    const success = mount();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByLabelText("Shop name")).not.toBeInTheDocument();
    identity();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create buyer account" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create buyer account" }));
    await waitFor(() =>
      expect(auth.registerBuyer).toHaveBeenCalledWith(
        "Test owner",
        "+919876543210",
        "Test-only-password-2026",
      ),
    );
    expect(auth.registerSeller).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledWith("buyer", true);
  });
  it("collects real shop details, configured category/area IDs and submits seller onboarding", async () => {
    const success = mount();
    fireEvent.click(screen.getByRole("radio", { name: /Seller/ }));
    identity();
    fireEvent.change(await screen.findByLabelText("Shop name"), {
      target: { value: "Test real shop" },
    });
    fireEvent.change(screen.getByLabelText("Full shop address"), {
      target: { value: "Test lane, Test locality" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Grocery" }));
    fireEvent.change(screen.getByLabelText("Service area"), { target: { value: areaId } });
    fireEvent.change(screen.getByLabelText("Year your shop opened"), { target: { value: "2020" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Pickup from shop" }));
    fireEvent.click(screen.getByRole("button", { name: "Create account and submit shop" }));
    await waitFor(() =>
      expect(auth.registerSeller).toHaveBeenCalledWith({
        name: "Test owner",
        phone: "+919876543210",
        password: "Test-only-password-2026",
        shop: {
          name: "Test real shop",
          address: "Test lane, Test locality",
          categoryIds: [categoryId],
          serviceAreaIds: [areaId],
          since: 2020,
          fulfilment: ["pickup"],
        },
      }),
    );
    expect(auth.registerBuyer).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledWith("seller", true);
  });
  it("blocks seller signup when configuration cannot be loaded", async () => {
    vi.mocked(management.categories).mockRejectedValue(new Error("Offline"));
    mount();
    fireEvent.click(screen.getByRole("radio", { name: /Seller/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
    expect(screen.getByRole("button", { name: "Create account and submit shop" })).toBeDisabled();
    expect(auth.registerSeller).not.toHaveBeenCalled();
  });
  it("returns to buyer onboarding without requiring hidden shop fields", async () => {
    mount();
    fireEvent.click(screen.getByRole("radio", { name: /Seller/ }));
    await screen.findByLabelText("Shop name");
    fireEvent.click(screen.getByRole("radio", { name: /Buyer/ }));
    expect(screen.queryByLabelText("Shop name")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create buyer account" })).toBeEnabled(),
    );
  });
  it("focuses the sign-in error without clearing credentials", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));
    auth.loginPassword.mockRejectedValue(new Error("Could not sign in. Check your details."));
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "QA-only-password-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Sign in$/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText("Mobile number")).toHaveValue("9876543210");
    expect(screen.getByLabelText("Password")).toHaveValue("QA-only-password-2026");
  });
  it("disables recovery and mode switches while sign-in is pending", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));
    auth.loginPassword.mockImplementation(() => new Promise(() => {}));
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "QA-only-password-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Sign in$/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Forgot password?" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "New here? Create an account" })).toBeDisabled();
  });
});

it("creates a rider without requiring seller fields and redirects to the delivery role", async () => {
  auth.registerDelivery.mockResolvedValue({ role: "delivery" });
  const success = mount();
  fireEvent.click(screen.getByRole("radio", { name: /Delivery partner/ }));
  expect(screen.queryByLabelText("Shop name")).toBeNull();
  expect(screen.getByText(/An admin must approve you/)).toBeInTheDocument();
  identity();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Create rider account" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Create rider account" }));
  await waitFor(() =>
    expect(auth.registerDelivery).toHaveBeenCalledWith(
      "Test owner",
      "+919876543210",
      "Test-only-password-2026",
      undefined,
    ),
  );
  expect(success).toHaveBeenCalledWith("delivery", true);
});
