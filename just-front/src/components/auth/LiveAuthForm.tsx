import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/stores/auth";
import type { Role } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SellerSignupFields, readSellerShop } from "./SellerSignupFields";
import { ShopPhotoPicker } from "@/components/common/ShopPhotoPicker";
import { management } from "@/services/management";
import { shopImages } from "@/services/shop-images";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { authentication } from "@/services/auth";
import type { SignupEmailProof } from "@/domain/management";
import { EmailOtpField } from "./EmailOtpField";
import { ArrowRight, Eye, EyeOff, Loader2, ShoppingBag, Store, ShieldCheck } from "lucide-react";
import { PasswordRecovery } from "./PasswordRecovery";
const schema = z.object({
  name: z.string().trim().max(100).optional(),
  phone: z
    .string()
    .regex(
      /^(?:\+[1-9]\d{9,14}|[6-9]\d{9})$/,
      "Enter a valid mobile number, including country code if needed",
    ),
  password: z.string().min(12, "Use at least 12 characters").max(128),
});
export function LiveAuthForm({
  onSuccess,
  onModeChange,
  onRecoveryChange,
}: {
  onSuccess: (role: Role, registered?: boolean) => void;
  onModeChange?: (registering: boolean) => void;
  onRecoveryChange?: (recovering: boolean) => void;
}) {
  const { loginPassword, registerBuyer, registerSeller } = useAuth();
  const [accountType, setAccountType] = useState<"buyer" | "seller">("buyer");
  const [sellerReady, setSellerReady] = useState(false);
  const [shopPhoto, setShopPhoto] = useState<File | null>(null);
  const formElement = useRef<HTMLFormElement>(null);
  const [registering, setRegistering] = useState(false);
  const [emailProof, setEmailProof] = useState<SignupEmailProof>();
  const options = useQuery({
    queryKey: ["registration-options"],
    queryFn: authentication.registrationOptions,
    enabled: registering,
    retry: false,
  });
  const [error, setError] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const errorSummary = useRef<HTMLParagraphElement>(null);
  const submitLock = useRef(false);
  useEffect(() => {
    if (error) errorSummary.current?.focus();
  }, [error]);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", password: "" },
  });
  if (recovering)
    return (
      <PasswordRecovery
        onClose={() => {
          setRecovering(false);
          onRecoveryChange?.(false);
        }}
      />
    );
  return (
    <div className="auth-live-form">
      {!registering && (
        <div className="auth-role-guide">
          <p>One sign-in. Your own workspace.</p>
          <ul>
            <li>Buyer</li>
            <li>Seller</li>
            <li>Delivery partner</li>
          </ul>
          <span>
            Your account determines where you go. New buyers and sellers can register below.
          </span>
        </div>
      )}
      <p className="mt-3 text-sm text-muted-foreground">
        {registering
          ? "Join your neighbourhood marketplace."
          : "Sign in with your phone number and password."}{" "}
        {registering
          ? "Choose how you’ll join, then add your details."
          : "Your shops, saved picks and orders are waiting."}
      </p>
      <form
        ref={formElement}
        noValidate
        className="mt-6 space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          setError(undefined);
          if (registering && (!options.data || (options.data.emailOtpRequired && !emailProof))) {
            setError("Request and enter your email verification code before creating an account.");
            return;
          }
          if (registering && (values.name?.length ?? 0) < 2) {
            form.setError(
              "name",
              { message: "Enter your name (at least 2 characters)" },
              { shouldFocus: true },
            );
            return;
          }
          const phone = values.phone.startsWith("+") ? values.phone : `+91${values.phone}`;
          if (submitLock.current) return;
          submitLock.current = true;
          try {
            const session = registering
              ? accountType === "seller"
                ? await registerSeller({
                    name: values.name!,
                    phone,
                    password: values.password,
                    ...emailProof,
                    shop: readSellerShop(new FormData(formElement.current!)),
                  })
                : emailProof
                  ? await registerBuyer(values.name!, phone, values.password, emailProof)
                  : await registerBuyer(values.name!, phone, values.password)
              : await loginPassword(phone, values.password);
            if (registering && accountType === "seller" && shopPhoto) {
              try {
                const shop = await management.shop();
                if (!shop) throw new Error("Shop not loaded");
                await shopImages.upload(shop, shopPhoto);
              } catch {
                toast.warning(
                  "Seller account created, but shop photo could not be saved. Choose it again in Shop settings; do not register again.",
                );
              }
            }
            setEmailProof(undefined);
            setShopPhoto(null);
            form.reset();
            onSuccess(session.role, registering);
          } catch (err) {
            setError(
              err instanceof z.ZodError
                ? err.issues.map((issue) => issue.message).join(". ")
                : err instanceof Error
                  ? err.message
                  : "Couldn't sign in. Try again.",
            );
          } finally {
            submitLock.current = false;
          }
        })}
      >
        {registering && options.isPending && <p role="status">Loading verification options…</p>}
        {registering && options.isError && (
          <div role="alert">
            <p>Could not load signup verification.</p>
            <Button type="button" variant="outline" onClick={() => options.refetch()}>
              Retry verification setup
            </Button>
          </div>
        )}
        {registering && (
          <fieldset
            disabled={form.formState.isSubmitting}
            className="auth-role-options grid grid-cols-2 gap-3"
          >
            <legend className="mb-2 text-sm font-medium">Choose your place in the market</legend>
            {(["buyer", "seller"] as const).map((type) => (
              <label
                key={type}
                className={`auth-role-choice flex cursor-pointer items-center gap-2 rounded-xl border p-4 text-sm ${accountType === type ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <input
                  type="radio"
                  name="accountType"
                  value={type}
                  checked={accountType === type}
                  onChange={() => {
                    setAccountType(type);
                    setShopPhoto(null);
                    setError(undefined);
                  }}
                />
                <span>
                  {type === "buyer" ? (
                    <ShoppingBag className="mb-2 size-5" aria-hidden />
                  ) : (
                    <Store className="mb-2 size-5" aria-hidden />
                  )}
                  <strong className="block">{type === "buyer" ? "Buyer" : "Seller"}</strong>
                  <span className="text-xs text-muted-foreground">
                    {type === "buyer" ? "Discover local shops & order" : "Bring your shop online"}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="auth-details-section">
          {registering && (
            <p className="auth-section-title">
              <span aria-hidden="true">01</span> Your account details
            </p>
          )}
          {registering && (
            <div>
              <Label htmlFor="live-name">Your name</Label>
              <Input
                id="live-name"
                autoComplete="name"
                placeholder="Your full name"
                {...form.register("name")}
                aria-invalid={!!form.formState.errors.name}
                aria-describedby="live-name-error"
              />
              <p id="live-name-error" className="text-sm text-destructive">
                {form.formState.errors.name?.message}
              </p>
            </div>
          )}
          <div>
            <Label htmlFor="live-phone">Mobile number</Label>
            <Input
              id="live-phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="Mobile number with country code"
              {...form.register("phone")}
              aria-invalid={!!form.formState.errors.phone}
              aria-describedby="live-phone-hint live-phone-error"
            />
            <p id="live-phone-hint" className="auth-field-hint">
              Indian number? Enter 10 digits, or include +91.
            </p>
            <p id="live-phone-error" className="text-sm text-destructive">
              {form.formState.errors.phone?.message}
            </p>
          </div>
          <div>
            <Label htmlFor="live-password">Password</Label>
            <div className="auth-password-field">
              <Input
                id="live-password"
                type={showPassword ? "text" : "password"}
                autoComplete={registering ? "new-password" : "current-password"}
                placeholder={registering ? "Create a memorable password" : "Enter your password"}
                {...form.register("password")}
                aria-invalid={!!form.formState.errors.password}
                aria-describedby="live-password-error"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="size-4" aria-hidden />
                ) : (
                  <Eye className="size-4" aria-hidden />
                )}
              </button>
            </div>
            {registering && (
              <p className="mt-2 text-xs text-muted-foreground">
                Use at least 12 characters. A few memorable words work well.
              </p>
            )}
            <p id="live-password-error" className="text-sm text-destructive">
              {form.formState.errors.password?.message}
            </p>
          </div>
        </div>
        {registering && options.data?.emailOtpRequired && (
          <EmailOtpField
            available={options.data.emailOtpAvailable}
            disabled={form.formState.isSubmitting}
            onProof={setEmailProof}
          />
        )}
        {registering && accountType === "seller" && (
          <>
            <p className="auth-section-title">
              <span aria-hidden="true">02</span> Introduce your shop
            </p>
            <SellerSignupFields onReady={setSellerReady} />
            <ShopPhotoPicker
              file={shopPhoto}
              onChange={setShopPhoto}
              disabled={form.formState.isSubmitting}
            />
          </>
        )}
        {error && (
          <p
            role="alert"
            ref={errorSummary}
            tabIndex={-1}
            className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={
            form.formState.isSubmitting ||
            (registering &&
              (!options.data ||
                (options.data.emailOtpRequired &&
                  (!options.data.emailOtpAvailable || !emailProof)))) ||
            (registering && accountType === "seller" && !sellerReady)
          }
        >
          {form.formState.isSubmitting && (
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          )}
          {form.formState.isSubmitting
            ? "Please wait…"
            : registering
              ? accountType === "seller"
                ? "Create account and submit shop"
                : "Create buyer account"
              : "Sign in"}
          {!form.formState.isSubmitting && <ArrowRight size={18} aria-hidden="true" />}
        </Button>
      </form>
      {!registering && (
        <Button
          variant="ghost"
          className="mt-2 w-full"
          disabled={form.formState.isSubmitting}
          onClick={() => {
            form.reset();
            setRecovering(true);
            onRecoveryChange?.(true);
          }}
        >
          Forgot password?
        </Button>
      )}
      <Button
        variant="ghost"
        className="auth-mode-switch mt-3 w-full"
        disabled={form.formState.isSubmitting}
        onClick={() => {
          setRegistering(!registering);
          setShowPassword(false);
          setEmailProof(undefined);
          setShopPhoto(null);
          onModeChange?.(!registering);
          setError(undefined);
          form.clearErrors();
        }}
      >
        {registering ? "Already have an account? Sign in" : "New here? Create an account"}
      </Button>
      <p className="auth-session-note mt-4 text-sm text-muted-foreground">
        <ShieldCheck size={18} aria-hidden="true" />
        <span>
          One account, one active device. Signing in here signs out your previous device/browser.
        </span>
      </p>
      <p className="auth-access-footnote mt-3 text-xs text-muted-foreground">
        Buyers and sellers can register here. Delivery and admin access is assigned by the platform.
        Password recovery requires an email previously verified on your account.
      </p>
    </div>
  );
}
