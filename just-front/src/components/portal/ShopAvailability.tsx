import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ManagedShop, OpeningHour } from "@/domain/management";
import type { FulfilmentMethod } from "@/domain/types";
import { management } from "@/services/management";
import { Button } from "@/components/ui/button";
import { fulfilmentLabel, OpenState } from "@/components/store/ShopMark";
import { ApiError } from "@/lib/api/client";
import { toast } from "sonner";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function ShopAvailability({
  shop,
  disabled = false,
}: {
  shop: ManagedShop;
  disabled?: boolean;
}) {
  const client = useQueryClient();
  const [version, setVersion] = useState(shop.version);
  const [closed, setClosed] = useState(!!shop.temporarilyClosed);
  const [hours, setHours] = useState<OpeningHour[]>(shop.openingHours);
  const [methods, setMethods] = useState(shop.fulfilment);
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState(false);
  const lock = useRef(false);
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof management.availability>[1]) =>
      management.availability({ ...shop, version }, input),
    onSuccess: (data) => {
      setVersion(data.version);
      setSaved(true);
      setConflict(false);
      toast.success("Shop availability saved. Approval status unchanged.");
      client.setQueryData(["seller-shop"], data);
      for (const key of [
        "shops",
        "shop",
        "cart-review",
        "checkout-review",
        "fulfilment-review",
        "seller-dashboard",
      ])
        void client.invalidateQueries({ queryKey: [key] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setConflict(true);
        void client.invalidateQueries({ queryKey: ["seller-shop"] });
      }
    },
  });
  const stale = conflict || version !== shop.version;
  return (
    <section className="surface-panel mb-5" aria-label="Shop availability">
      <div className="surface-panel-heading">
        <div>
          <h2>Today’s shop controls</h2>
          <p>
            Pause new orders or update hours and pickup/delivery. Approval stays unchanged. Existing
            orders still need attention.
          </p>
        </div>
        <OpenState shop={shop} />
      </div>
      {disabled && (
        <p className="mb-3 text-sm">
          Save or discard your profile/photo edits before changing availability.
        </p>
      )}
      {shop.status !== "approved" && (
        <p className="mb-3 text-sm">Your shop still needs approval before buyers can order.</p>
      )}
      <form
        onChange={() => setSaved(false)}
        onSubmit={async (event) => {
          event.preventDefault();
          if (lock.current || stale) return;
          lock.current = true;
          const data = new FormData(event.currentTarget);
          try {
            await mutation.mutateAsync({
              temporarilyClosed: closed,
              openingHours: hours,
              timezone: shop.timezone,
              fulfilment: methods,
              pickupNote: String(data.get("pickupNote") ?? ""),
              ...(data.get("deliveryFee") !== ""
                ? { deliveryFee: Number(data.get("deliveryFee")) }
                : {}),
              ...(data.get("minimumOrderAmount") !== ""
                ? { minimumOrderAmount: Number(data.get("minimumOrderAmount")) }
                : {}),
            });
          } catch {
            /* Visible mutation error; keep the draft. */
          } finally {
            lock.current = false;
          }
        }}
      >
        <fieldset disabled={disabled || mutation.isPending || stale} className="space-y-4">
          <label className="flex min-h-11 items-center gap-3 rounded-lg bg-secondary p-3 text-sm">
            <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
            Temporarily close for new orders
          </label>
          <p className="text-sm text-muted-foreground">
            Unchecking follows saved hours; it does not force the shop open outside its schedule.
            Times use {shop.timezone}.
          </p>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">
              Available ways to receive an order
            </legend>
            <div className="flex flex-wrap gap-4">
              {(["pickup", "seller_delivery", "platform_delivery"] as FulfilmentMethod[]).map(
                (method) => (
                  <label className="flex min-h-11 items-center gap-2 text-sm" key={method}>
                    <input
                      type="checkbox"
                      checked={methods.includes(method)}
                      onChange={(e) =>
                        setMethods(
                          e.target.checked
                            ? [...methods, method]
                            : methods.filter((m) => m !== method),
                        )
                      }
                    />
                    {fulfilmentLabel[method]}
                  </label>
                ),
              )}
            </div>
          </fieldset>
          <p className="text-sm text-muted-foreground">
            Delivery needs a listed fee and an eligible address. Platform delivery also depends on
            platform coverage; selecting it does not guarantee a rider.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["deliveryFee", "Listed delivery fee (₹)", shop.deliveryFee],
              ["minimumOrderAmount", "Minimum items total (₹)", shop.minimumOrderAmount],
            ].map(([name, label, value]) => (
              <label key={String(name)} className="block text-sm">
                {label}
                <input
                  name={String(name)}
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={value}
                  className="mt-1 block w-full rounded-lg border bg-background p-3"
                />
              </label>
            ))}
          </div>
          <label className="block text-sm">
            Pickup instructions
            <textarea
              name="pickupNote"
              maxLength={400}
              defaultValue={shop.pickupNote}
              rows={2}
              className="mt-1 block w-full rounded-lg border bg-background p-3"
            />
          </label>
          <details>
            <summary className="cursor-pointer py-3 text-sm font-semibold">
              Operating hours · {hours.length} intervals
            </summary>
            <p className="mb-3 text-sm">
              End time before start means overnight. Days with no interval are closed; equal
              start/end is invalid.
            </p>
            <div className="space-y-3">
              {hours.map((hour, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                  <select
                    aria-label={`Day ${i + 1}`}
                    value={hour.day}
                    className="max-w-full rounded border p-2"
                    onChange={(e) =>
                      setHours(
                        hours.map((h, j) => (j === i ? { ...h, day: Number(e.target.value) } : h)),
                      )
                    }
                  >
                    {days.map((day, n) => (
                      <option value={n} key={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                  {(["opens", "closes"] as const).map((key) => (
                    <label key={key} className="text-sm">
                      {key === "opens" ? "Opens" : "Closes"}
                      <input
                        aria-label={`${key} ${i + 1}`}
                        type="time"
                        required
                        value={hour[key]}
                        className="ml-2 rounded border p-2"
                        onChange={(e) =>
                          setHours(
                            hours.map((h, j) => (j === i ? { ...h, [key]: e.target.value } : h)),
                          )
                        }
                      />
                    </label>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setHours(hours.filter((_, j) => j !== i))}
                  >
                    Remove interval {i + 1}
                  </Button>
                </div>
              ))}
            </div>
            <Button
              className="mt-3"
              type="button"
              variant="outline"
              disabled={hours.length >= 28}
              onClick={() => setHours([...hours, { day: 1, opens: "09:00", closes: "18:00" }])}
            >
              Add opening interval
            </Button>
          </details>
          <Button type="submit" disabled={!methods.length}>
            {mutation.isPending ? "Saving availability…" : "Save availability"}
          </Button>
        </fieldset>
        {mutation.isError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {mutation.error.message}
          </p>
        )}
        {saved && (
          <p role="status" className="mt-3 text-sm">
            Availability saved. Buyer pages refresh within about 30 seconds; checkout rechecks
            availability.
          </p>
        )}
        {stale && (
          <div role="alert" className="mt-3 text-sm">
            <p>Shop changed elsewhere. Draft kept; reload the latest settings before saving.</p>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Reload latest settings
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}
