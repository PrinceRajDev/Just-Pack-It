import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { DeliveryPinEditor } from "./DeliveryPinEditor";
import type { Address } from "@/domain/types";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/stores/auth";
import type { ServiceArea } from "@/domain/types";
import { savedAddresses } from "@/services/addresses";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
export function GpsAddressConfirmation({
  area,
  autoOpen = true,
  onPrompted,
  initialPoint,
}: {
  area: ServiceArea;
  initialPoint?: { lat: number; lng: number };
  autoOpen?: boolean;
  onPrompted?: () => void;
}) {
  const [pin, setPin] = useState<Address["location"]>(
    initialPoint ? { type: "Point", coordinates: [initialPoint.lng, initialPoint.lat] } : undefined,
  );
  const trigger = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const { session } = useAuth(),
    client = useQueryClient();
  const [open, setOpen] = useState(autoOpen),
    [saved, setSaved] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (autoOpen) onPrompted?.();
  }, [autoOpen, onPrompted]);
  const save = useMutation({
    mutationFn: savedAddresses.create,
    onSuccess: () => {
      setSaved(true);
      setOpen(false);
      void client.invalidateQueries({ queryKey: ["addresses", session?.userId] });
    },
    onSettled: () => {
      submitting.current = false;
    },
  });
  return (
    <>
      <Button ref={trigger} variant="outline" onClick={() => setOpen(true)}>
        <UiText>{saved ? "Address saved · review" : "Confirm delivery address"}</UiText>
      </Button>
      <Sheet
        open={open}
        onOpenChange={(value) => {
          if (!save.isPending) setOpen(value);
        }}
      >
        <SheetContent
          className="delivery-address-sheet w-full sm:max-w-md pb-[max(1.5rem,env(safe-area-inset-bottom))] scroll-pb-8"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <SheetTitle className="pr-10">Where should your bag arrive?</SheetTitle>
          <SheetDescription>
            GPS finds nearby shops, not your house number. Confirm the address yourself; checkout
            checks whether shops can serve it.
          </SheetDescription>
          {saved ? (
            <p className="mt-5" role="status">
              Address saved. You can edit it from your account or select it at checkout.
            </p>
          ) : !session ? (
            <div className="mt-5 space-y-3">
              <p className="text-sm">
                Sign in as a buyer to save your address. You can keep browsing nearby shops.
              </p>
              <Button asChild>
                <Link to="/login">Sign in to save address</Link>
              </Button>
            </div>
          ) : session.role !== "buyer" ? (
            <p className="mt-5">Address saving is available in a buyer account.</p>
          ) : (
            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (submitting.current) return;
                const data = new FormData(event.currentTarget);
                if (confirmed) {
                  submitting.current = true;
                  save.mutate({
                    label: String(data.get("label")).trim(),
                    line1: String(data.get("line1")).trim(),
                    locality: String(data.get("locality")).trim(),
                    city: String(data.get("city")).trim(),
                    pincode: String(data.get("pincode")).trim(),
                    ...(pin ? { location: pin } : {}),
                  });
                }
              }}
              onChange={(event) => {
                if (
                  (event.target instanceof HTMLInputElement && event.target.type !== "checkbox") ||
                  event.target instanceof HTMLTextAreaElement
                )
                  setConfirmed(false);
              }}
            >
              <fieldset disabled={save.isPending} className="space-y-4">
                <DeliveryPinEditor
                  value={pin}
                  onChange={(point) => {
                    setPin(point);
                    setConfirmed(false);
                  }}
                />
                <label className="block text-sm">
                  Address label
                  <UiAttributes>
                    <input
                      name="label"
                      required
                      maxLength={60}
                      placeholder="Home / Work"
                      className="mt-1 block h-11 w-full rounded-md border bg-background px-3"
                    />
                  </UiAttributes>
                </label>
                <label className="block text-sm">
                  House, street and landmark
                  <textarea
                    name="line1"
                    required
                    minLength={2}
                    maxLength={300}
                    autoComplete="address-line1"
                    rows={3}
                    className="mt-1 block w-full rounded-md border bg-background p-3"
                  />
                </label>
                <label className="block text-sm">
                  Locality / village
                  <input
                    name="locality"
                    required
                    defaultValue={area.name}
                    maxLength={120}
                    autoComplete="address-line2"
                    className="mt-1 block h-11 w-full rounded-md border bg-background px-3"
                  />
                </label>
                <label className="block text-sm">
                  <UiText>{"City / town"}</UiText>
                  <input
                    name="city"
                    required
                    defaultValue={area.city}
                    maxLength={120}
                    autoComplete="address-level2"
                    className="mt-1 block h-11 w-full rounded-md border bg-background px-3"
                  />
                </label>
                <label className="block text-sm">
                  <UiText>{"Pincode"}</UiText>
                  <input
                    name="pincode"
                    required
                    pattern="[1-9][0-9]{5}"
                    maxLength={6}
                    defaultValue={area.pincodes.length === 1 ? area.pincodes[0] : ""}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    className="mt-1 block h-11 w-full rounded-md border bg-background px-3"
                  />
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    className="mt-1"
                  />
                  I checked this address and pincode. GPS has not verified these details.
                </label>
                {save.isError && (
                  <p role="alert" className="text-sm">
                    {save.error.message}
                  </p>
                )}
                <Button type="submit" disabled={!confirmed || save.isPending}>
                  <UiText>{save.isPending ? "Saving…" : "Confirm and save address"}</UiText>
                </Button>
              </fieldset>
            </form>
          )}
          <Button
            variant="ghost"
            className="mt-4"
            disabled={save.isPending}
            onClick={() => setOpen(false)}
          >
            Keep browsing
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}
