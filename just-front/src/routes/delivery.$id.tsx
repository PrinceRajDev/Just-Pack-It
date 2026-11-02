import { UiAttributes } from "@/lib/i18n/Language";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Navigation, Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDelivery } from "@/stores/delivery";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { inr } from "@/lib/image";
import { isDemoMode } from "@/lib/config";

export const Route = createFileRoute("/delivery/$id")({ component: TaskDetail });

const mapLink = (addr: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
const reasons = [
  "Customer not reachable",
  "Wrong / incomplete address",
  "Customer refused",
  "Item damaged",
  "Other safety issue",
];

function TaskDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { tasks, setStatus } = useDelivery();
  const t = tasks.find((x) => x.id === id);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string>();
  const [reason, setReason] = useState("");

  if (!t)
    return (
      <div className="py-16 text-center">
        <p>Task not found.</p>
        <Link to="/delivery" className="text-primary underline">
          Back to tasks
        </Link>
      </div>
    );

  const verify = async () => {
    setVerifying(true);
    setOtpError(undefined);
    // Never trust the OTP client-side: the backend verifies it. In demo we cannot verify.
    await new Promise((r) => setTimeout(r, 600));
    setVerifying(false);
    if (isDemoMode) {
      if (otp === "123456") {
        setStatus(t.id, "delivered");
        toast.success("Delivery confirmed (demo code)");
        navigate({ to: "/delivery" });
      } else
        setOtpError(
          "Code didn't match. Ask the customer to check their order page. (Demo code: 123456)",
        );
    }
  };

  const step = t.status;
  return (
    <div className="delivery-task-detail">
      <Link to="/delivery" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> Tasks
      </Link>
      <div className="mt-3 flex items-center justify-between">
        <h1 className="font-mono text-sm">{t.subOrderId}</h1>
        <StatusBadge status={t.status} />
      </div>
      <ol className="delivery-route-stops mt-4 space-y-0 border border-border bg-card">
        {[
          {
            k: "Pickup",
            name: t.shopName,
            addr: t.pickup,
            done: ["picked_up", "out_for_delivery", "delivered"].includes(step),
          },
          { k: "Drop", name: t.customerName, addr: t.drop, done: step === "delivered" },
        ].map((s, i) => (
          <li key={s.k} className={i ? "border-t border-dashed border-border p-4" : "p-4"}>
            <p className="label-stamp text-muted-foreground">
              {s.k}
              {s.done && " · done"}
            </p>
            <p className="mt-1 text-lg font-semibold">{s.name}</p>
            <p className="text-sm">{s.addr}</p>
            <div className="mt-3 flex gap-2">
              <Button asChild variant="outline" size="lg" className="flex-1">
                <a href={mapLink(s.addr)} target="_blank" rel="noreferrer">
                  <Navigation /> Navigate
                </a>
              </Button>
              <UiAttributes>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => toast.info("Masked calling is connected via the backend.")}
                  aria-label={`Call ${s.name}`}
                >
                  <Phone />
                </Button>
              </UiAttributes>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex justify-between text-sm">
        <span>
          {t.items} items · {t.distanceKm} km
        </span>
        <span>
          Payout <b>{inr(t.payout)}</b>
        </span>
      </div>
      {t.codAmount && step !== "delivered" && (
        <p className="mt-3 border border-promo/40 bg-promo/10 p-3 text-center font-semibold">
          Collect {inr(t.codAmount)} cash / UPI
        </p>
      )}

      <div className="mt-8 space-y-3">
        {step === "available" && (
          <Button size="xl" className="w-full" onClick={() => setStatus(t.id, "assigned")}>
            Accept delivery
          </Button>
        )}
        {step === "assigned" && (
          <Button
            size="xl"
            variant="citrus"
            className="w-full"
            onClick={() => {
              setStatus(t.id, "picked_up");
              toast.success("Pickup confirmed");
            }}
          >
            I've picked up the order
          </Button>
        )}
        {step === "picked_up" && (
          <Button
            size="xl"
            variant="citrus"
            className="w-full"
            onClick={() => setStatus(t.id, "out_for_delivery")}
          >
            Start delivery
          </Button>
        )}
        {step === "out_for_delivery" && (
          <div className="delivery-otp-panel border border-border bg-card p-4">
            <p className="font-semibold">Ask the customer for their 6-digit code</p>
            <div className="mt-3 flex justify-center">
              <UiAttributes>
                <InputOTP maxLength={6} value={otp} onChange={setOtp} aria-label="Delivery code">
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="delivery-otp-slot size-11 text-lg"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </UiAttributes>
            </div>
            {otpError && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {otpError}
              </p>
            )}
            <Button
              size="xl"
              className="mt-4 w-full"
              disabled={otp.length !== 6 || verifying}
              onClick={verify}
            >
              {verifying ? (
                <>
                  <Loader2 className="animate-spin" /> Checking…
                </>
              ) : (
                "Confirm delivery"
              )}
            </Button>
          </div>
        )}
        {["assigned", "picked_up", "out_for_delivery"].includes(step) && (
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="lg"
                className="w-full border-destructive/40 text-destructive"
              >
                Report a problem
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom">
              <SheetHeader>
                <SheetTitle>What went wrong?</SheetTitle>
              </SheetHeader>
              <RadioGroup value={reason} onValueChange={setReason} className="mt-4 space-y-2 px-4">
                {reasons.map((r) => (
                  <Label
                    key={r}
                    htmlFor={r}
                    className="flex h-12 items-center gap-3 border border-border px-3 font-normal"
                  >
                    <RadioGroupItem value={r} id={r} />
                    {r}
                  </Label>
                ))}
              </RadioGroup>
              <div className="p-4">
                <Button
                  size="xl"
                  variant="destructive"
                  className="w-full"
                  disabled={!reason}
                  onClick={() => {
                    setStatus(t.id, "failed");
                    toast("Reported to operations (demo)");
                    navigate({ to: "/delivery" });
                  }}
                >
                  Submit report
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  );
}
