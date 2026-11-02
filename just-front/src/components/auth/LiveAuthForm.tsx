import { UiText, UiAttributes } from "@/lib/i18n/Language";
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
import { ArrowRight, Eye, EyeOff, Loader2, ShoppingBag, Store } from "lucide-react";
import { PasswordRecovery } from "./PasswordRecovery";
import { googleConfigured, googleIdentity } from "@/services/google-auth";
import { ApiError } from "@/lib/api/client";
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
  const { loginPassword, loginGoogle, registerBuyer, registerSeller } = useAuth();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleToken, setGoogleToken] = useState<string>();
  const [accountType, setAccountType] = useState<"buyer" | "seller">("buyer");
  const [sellerReady, setSellerReady] = useState(false);
  const [shopPhoto, setShopPhoto] = useState<File | null>(null);
  const formElement = useRef<HTMLFormElement>(null);
  const [registering, setRegistering] = useState(false);
  const [emailProof, setEmailProof] = useState<SignupEmailProof>();
  const options = useQuery({
    queryKey: ["registration-options"],
    queryFn: authentication.registrationOptions,
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
              : googleToken
                ? await loginGoogle(googleToken, phone, values.password)
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
        {registering && options.isPending && (
          <p role="status">
            <UiText>{"Loading verification options…"}</UiText>
          </p>
        )}
        {registering && options.isError && (
          <div role="alert">
            <p>
              <UiText>{"Could not load signup verification."}</UiText>
            </p>
            <Button type="button" variant="outline" onClick={() => options.refetch()}>
              <UiText>{"Retry verification setup"}</UiText>
            </Button>
          </div>
        )}
        {registering && (
          <fieldset
            disabled={form.formState.isSubmitting}
            className="auth-role-options grid grid-cols-2 gap-3"
          >
            <legend className="mb-2 text-sm font-medium">
              <UiText>{"Choose your place in the market"}</UiText>
            </legend>
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
                  <strong className="block">
                    <UiText>{type === "buyer" ? "Buyer" : "Seller"}</UiText>
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    <UiText>
                      {type === "buyer" ? "Discover local shops & order" : "Bring your shop online"}
                    </UiText>
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="auth-details-section">
          {registering && (
            <p className="auth-section-title">
              <span aria-hidden="true">01</span>
              <UiText>{"Your account details"}</UiText>
            </p>
          )}
          {registering && (
            <div>
              <Label htmlFor="live-name">
                <UiText>{"Your name"}</UiText>
              </Label>
              <UiAttributes>
                <Input
                  id="live-name"
                  autoComplete="name"
                  placeholder="Your full name"
                  {...form.register("name")}
                  aria-invalid={!!form.formState.errors.name}
                  aria-describedby="live-name-error"
                />
              </UiAttributes>
              <p id="live-name-error" className="text-sm text-destructive">
                {form.formState.errors.name?.message}
              </p>
            </div>
          )}
          <div>
            <Label htmlFor="live-phone">
              <UiText>{"Mobile number"}</UiText>
            </Label>
            <UiAttributes>
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
            </UiAttributes>
            <p id="live-phone-hint" className="auth-field-hint">
              <UiText>{"Indian number? Enter 10 digits, or include +91."}</UiText>
            </p>
            <p id="live-phone-error" className="text-sm text-destructive">
              {form.formState.errors.phone?.message}
            </p>
          </div>
          <div>
            <Label htmlFor="live-password">
              <UiText>{"Password"}</UiText>
            </Label>
            <div className="auth-password-field">
              <UiAttributes>
                <Input
                  id="live-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={registering ? "new-password" : "current-password"}
                  placeholder={registering ? "Create a memorable password" : "Enter your password"}
                  {...form.register("password")}
                  aria-invalid={!!form.formState.errors.password}
                  aria-describedby="live-password-error"
                />
              </UiAttributes>
              <UiAttributes>
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
              </UiAttributes>
            </div>
            {registering && (
              <p className="mt-2 text-xs text-muted-foreground">
                <UiText>{"Use at least 12 characters. A few memorable words work well."}</UiText>
              </p>
            )}
            <p id="live-password-error" className="text-sm text-destructive">
              {form.formState.errors.password?.message}
            </p>
          </div>
        </div>
        {registering && emailProof?.googleIdToken && (
          <div
            role="status"
            className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"
          >
            Email selected with Google: <strong className="break-all">{emailProof.email}</strong>.
            Finish your details below. Your phone number is not verified.
            <Button type="button" variant="ghost" onClick={() => setEmailProof(undefined)}>
              <UiText>{"Use email code instead"}</UiText>
            </Button>
          </div>
        )}
        {registering && options.data?.emailOtpRequired && !emailProof?.googleIdToken && (
          <EmailOtpField
            available={options.data.emailOtpAvailable}
            disabled={form.formState.isSubmitting}
            onProof={setEmailProof}
          />
        )}
        {registering && accountType === "seller" && (
          <>
            <p className="auth-section-title">
              <span aria-hidden="true">02</span>
              <UiText>{"Introduce your shop"}</UiText>
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
            googleBusy ||
            (registering &&
              (!options.data ||
                (options.data.emailOtpRequired &&
                  ((!options.data.emailOtpAvailable && !emailProof?.googleIdToken) ||
                    !emailProof)))) ||
            (registering && accountType === "seller" && !sellerReady)
          }
        >
          {form.formState.isSubmitting && (
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          )}
          <UiText>
            {form.formState.isSubmitting
              ? "Please wait…"
              : registering
                ? accountType === "seller"
                  ? "Create account and submit shop"
                  : "Create buyer account"
                : "Sign in"}
          </UiText>
          {!form.formState.isSubmitting && <ArrowRight size={18} aria-hidden="true" />}
        </Button>
      </form>
      {googleConfigured && options.data?.googleSignInAvailable && (
        <div className="mt-5">
          <p className="mb-3 text-center text-xs text-muted-foreground">
            <UiText>{"Or continue with"}</UiText>
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-3 bg-card"
            disabled={googleBusy || form.formState.isSubmitting}
            onClick={async () => {
              if (submitLock.current) return;
              submitLock.current = true;
              setGoogleBusy(true);
              setError(undefined);
              try {
                const identity = await googleIdentity();
                if (registering) {
                  setEmailProof({ email: identity.email, googleIdToken: identity.idToken });
                  form.setValue("name", identity.name);
                  return;
                }
                try {
                  const session = await loginGoogle(identity.idToken);
                  onSuccess(session.role);
                } catch (err) {
                  if (err instanceof ApiError && err.code === "GOOGLE_ONBOARDING_REQUIRED") {
                    setRegistering(true);
                    onModeChange?.(true);
                    form.setValue("name", identity.name);
                    setEmailProof({ email: identity.email, googleIdToken: identity.idToken });
                  } else if (err instanceof ApiError && err.code === "GOOGLE_LINK_REQUIRED") {
                    setGoogleToken(identity.idToken);
                    setError(
                      "Enter your existing phone number and password above, then select Sign in to link this Google account.",
                    );
                  } else throw err;
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : "Google sign-in failed.");
              } finally {
                setGoogleBusy(false);
                submitLock.current = false;
              }
            }}
          >
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.5Z"
              />
              <path
                fill="#34A853"
                d="M12 22c2.7 0 5-.9 6.6-2.3l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.9-1.8-5.7-4.2H3v2.6A10 10 0 0 0 12 22Z"
              />
              <path fill="#FBBC05" d="M6.3 14a6 6 0 0 1 0-4V7.4H3a10 10 0 0 0 0 9.2L6.3 14Z" />
              <path
                fill="#EA4335"
                d="M12 5.8c1.5 0 2.8.5 3.8 1.5L18.6 4A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9 5.4L6.3 10A6 6 0 0 1 12 5.8Z"
              />
            </svg>
            <UiText>{googleBusy ? "Connecting to Google…" : "Continue with Google"}</UiText>
          </Button>
        </div>
      )}

      {!registering && (
        <Button
          variant="ghost"
          className="mt-2 w-full"
          disabled={form.formState.isSubmitting || googleBusy}
          onClick={() => {
            form.reset();
            setRecovering(true);
            onRecoveryChange?.(true);
          }}
        >
          <UiText>{"Forgot password?"}</UiText>
        </Button>
      )}
      <Button
        variant="ghost"
        className="auth-mode-switch mt-3 w-full"
        disabled={form.formState.isSubmitting || googleBusy}
        onClick={() => {
          setRegistering(!registering);
          setShowPassword(false);
          setEmailProof(undefined);
          setGoogleToken(undefined);
          setShopPhoto(null);
          onModeChange?.(!registering);
          setError(undefined);
          form.clearErrors();
        }}
      >
        <UiText>
          {registering ? "Already have an account? Sign in" : "New here? Create an account"}
        </UiText>
      </Button>
    </div>
  );
}
