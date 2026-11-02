import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { SettlementLedger } from "./SettlementLedger";
import { LiveSellerDashboard } from "./LiveSellerDashboard";
import { ShopGpsPin } from "./ShopGpsPin";
import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { management } from "@/services/management";
import type { ManagedShop, ManagedCategory, ManagedArea, OpeningHour } from "@/domain/management";
import type { FulfilmentMethod } from "@/domain/types";
import { PortalHeader } from "./PortalShell";
import { ErrorState, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Field, Panel, SaveError, useSave, text, number, selected } from "./management-shared";
import { LiveProducts } from "./LiveProducts";
import { useDraftGuard } from "./useDraftGuard";
import { SellerOnboarding } from "./SellerOnboarding";
import { ShopReviewNotice } from "./ShopReviewNotice";
import { LiveSellerOrders } from "./LiveSellerOrders";
import { ShopPhotoUpload } from "./ShopPhotoUpload";
import { ShopAvailability } from "./ShopAvailability";
import { LiveInventory } from "./LiveInventory";

export function LiveSeller() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const settlementPath = path.replace(/\/+$/, "") === "/seller/settlements";
  const homePath = path === "/seller" || path === "/seller/";
  const ordersPath = path === "/seller/orders" || path === "/seller/orders/";
  const inventoryPath = path.replace(/\/+$/, "") === "/seller/inventory";
  const shop = useQuery({
    queryKey: ["seller-shop"],
    queryFn: management.shop,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: management.categories,
    enabled:
      !settlementPath &&
      !ordersPath &&
      !inventoryPath &&
      (!homePath || (shop.isSuccess && shop.data?.status !== "approved")),
  });
  const areas = useQuery({
    queryKey: ["areas"],
    queryFn: management.areas,
    enabled:
      !settlementPath &&
      !ordersPath &&
      !inventoryPath &&
      (!homePath || (shop.isSuccess && shop.data?.status !== "approved")),
  });
  if (settlementPath) return <SettlementLedger />;
  if (homePath && shop.data?.status === "approved")
    return <LiveSellerDashboard key={shop.data.id} shop={shop.data} />;
  if (ordersPath) {
    if (shop.error)
      return (
        <UiAttributes>
          <ErrorState message={shop.error.message} onRetry={() => void shop.refetch()} />
        </UiAttributes>
      );
    if (shop.isPending) return <p role="status">Loading your shop…</p>;
    return shop.data ? (
      <LiveSellerOrders shop={shop.data} />
    ) : (
      <UiAttributes>
        <EmptyState title="Create your shop first" />
      </UiAttributes>
    );
  }
  if (inventoryPath) {
    if (shop.error)
      return (
        <UiAttributes>
          <ErrorState message={shop.error.message} onRetry={() => void shop.refetch()} />
        </UiAttributes>
      );
    if (shop.isPending) return <p role="status">Loading your shop…</p>;
    return shop.data ? (
      <LiveInventory />
    ) : (
      <UiAttributes>
        <EmptyState title="Create your shop first" />
      </UiAttributes>
    );
  }
  const error = shop.error || categories.error || areas.error;
  if (error)
    return (
      <UiAttributes>
        <ErrorState
          message={error.message}
          onRetry={() => {
            void shop.refetch();
            void categories.refetch();
            void areas.refetch();
          }}
        />
      </UiAttributes>
    );
  if (shop.isPending || categories.isPending || areas.isPending)
    return <p role="status">Loading your shop…</p>;
  if ((path === "/seller" || path === "/seller/") && shop.data)
    return <SellerOnboarding shop={shop.data} categories={categories.data} areas={areas.data} />;
  if (path.includes("/products"))
    return shop.data ? (
      <LiveProducts key={path} shop={shop.data} categories={categories.data} path={path} />
    ) : (
      <UiAttributes>
        <EmptyState
          title="Create your shop first"
          action={
            <Button asChild>
              <Link to="/seller/settings">Set up shop</Link>
            </Button>
          }
        />
      </UiAttributes>
    );
  if (path !== "/seller" && path !== "/seller/" && path !== "/seller/settings")
    return (
      <UiAttributes>
        <EmptyState
          title="This workspace feature is not connected yet"
          body="Orders, offers and payouts will be available in a later backend phase."
        />
      </UiAttributes>
    );
  return (
    <>
      <UiAttributes>
        <PortalHeader
          title={shop.data ? "Your shop profile" : "Bring your shop online"}
          sub="Save your real details. New shops and profile changes require admin approval."
        />
      </UiAttributes>
      <ShopForm
        key={`${shop.data?.id ?? "new"}:${shop.data?.version ?? 0}`}
        shop={shop.data}
        categories={categories.data}
        areas={areas.data}
      />
    </>
  );
}

function ShopForm({
  shop,
  categories,
  areas,
}: {
  shop: ManagedShop | null;
  categories: ManagedCategory[];
  areas: ManagedArea[];
}) {
  const save = useSave();
  const draft = useDraftGuard();
  const [profileEditing, setProfileEditing] = useState(false);
  const [photoEditing, setPhotoEditing] = useState(false);
  const [categoryIds, setCategoryIds] = useState(shop?.categoryIds ?? []);
  const [hours, setHours] = useState<OpeningHour[]>(shop?.openingHours ?? []);
  if (!categories.length || !areas.length)
    return (
      <UiAttributes>
        <EmptyState
          title="Platform setup is incomplete"
          body="An admin must configure categories and service areas before you can submit a shop."
        />
      </UiAttributes>
    );
  return (
    <Panel>
      {draft.dialog}
      {shop && <ShopAvailability shop={shop} disabled={profileEditing || photoEditing} />}
      {shop && (
        <ShopPhotoUpload
          shop={shop}
          disabled={save.isPending || profileEditing}
          onEditing={setPhotoEditing}
        />
      )}
      {shop && <ShopReviewNotice shop={shop} />}
      {shop && (
        <p className="rounded-lg bg-secondary p-3 text-sm">
          Approval:{" "}
          <strong>
            <UiText>{shop.status}</UiText>
          </strong>{" "}
          · <UiText>{shop.isOpen ? "Open" : "Closed"}</UiText>. Profile updates return the shop to
          pending review.
        </p>
      )}
      <form
        onChange={() => {
          draft.mark();
          setProfileEditing(true);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          save.mutate(async () => {
            if (Boolean(text(data, "latitude")) !== Boolean(text(data, "longitude")))
              throw new Error("Enter both shop latitude and longitude, or leave both unchanged.");
            const input = {
              name: text(data, "name"),
              ...(text(data, "latitude") && text(data, "longitude")
                ? {
                    location: {
                      type: "Point" as const,
                      coordinates: [number(data, "longitude"), number(data, "latitude")] as [
                        number,
                        number,
                      ],
                    },
                  }
                : {}),
              locality: text(data, "locality"),
              ...(text(data, "address") ? { address: text(data, "address") } : {}),
              tagline: text(data, "tagline"),
              description: text(data, "description"),
              categoryIds,
              subcategoryIds: selected(data, "subcategoryIds"),
              serviceAreaIds: selected(data, "serviceAreaIds"),
              fulfilment: selected(data, "fulfilment") as FulfilmentMethod[],
              since: number(data, "since"),
              initials: text(data, "initials"),
              timezone: text(data, "timezone"),
              openingHours: hours,
              temporarilyClosed: data.has("temporarilyClosed"),
              hours: text(data, "hours"),
              pickupNote: text(data, "pickupNote"),
              ...(text(data, "coverImage") ? { coverImage: text(data, "coverImage") } : {}),
              ...(text(data, "deliveryFee") ? { deliveryFee: number(data, "deliveryFee") } : {}),
              ...(text(data, "minimumOrderAmount")
                ? { minimumOrderAmount: number(data, "minimumOrderAmount") }
                : {}),
              ...(!shop ? { slug: text(data, "slug") } : {}),
            };
            if (
              !input.categoryIds.length ||
              !input.serviceAreaIds.length ||
              !input.fulfilment.length
            )
              throw new Error("Choose at least one category, service area and fulfilment method.");
            await management.saveShop(input, shop?.version);
            draft.reset();
          });
        }}
      >
        <fieldset disabled={save.isPending || photoEditing} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <UiAttributes>
              <Field label="Shop name" name="name" value={shop?.name} required />
            </UiAttributes>
            <ShopGpsPin
              coordinates={shop?.location?.coordinates}
              onChange={() => {
                draft.mark();
                setProfileEditing(true);
              }}
            />
            {!shop && (
              <UiAttributes>
                <Field label="Shop URL slug (lowercase-with-hyphens)" name="slug" required />
              </UiAttributes>
            )}
            <UiAttributes>
              <Field label="Locality / address" name="locality" value={shop?.locality} required />
            </UiAttributes>
            <UiAttributes>
              <Field
                label="Full shop address (blank keeps existing)"
                name="address"
                value={shop?.address}
              />
            </UiAttributes>
            <UiAttributes>
              <Field label="Short initials" name="initials" value={shop?.initials} required />
            </UiAttributes>
            <UiAttributes>
              <Field
                label="Trading since (year)"
                name="since"
                type="number"
                min={1900}
                max={new Date().getFullYear()}
                value={shop?.since}
                required
              />
            </UiAttributes>
            <UiAttributes>
              <Field label="Tagline" name="tagline" value={shop?.tagline} />
            </UiAttributes>
            <UiAttributes>
              <Field label="Description" name="description" value={shop?.description} />
            </UiAttributes>
            <UiAttributes>
              <Field
                label="Cover image HTTPS URL or durable key (optional)"
                name="coverImage"
                value={shop?.coverImage}
              />
            </UiAttributes>
            <UiAttributes>
              <Field
                label="Listed delivery fee ₹ (blank keeps existing)"
                name="deliveryFee"
                type="number"
                min={0}
                step="0.01"
                value={shop?.deliveryFee}
              />
            </UiAttributes>
            <UiAttributes>
              <Field
                label="Minimum order ₹ (blank keeps existing)"
                name="minimumOrderAmount"
                type="number"
                min={0}
                step="0.01"
                value={shop?.minimumOrderAmount}
              />
            </UiAttributes>
            <UiAttributes>
              <Field label="Pickup instructions" name="pickupNote" value={shop?.pickupNote} />
            </UiAttributes>
          </div>
          <fieldset>
            <legend className="font-medium">Shop categories</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={categoryIds.includes(c.id)}
                    onChange={(e) =>
                      setCategoryIds(
                        e.target.checked
                          ? [...categoryIds, c.id]
                          : categoryIds.filter((id) => id !== c.id),
                      )
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="font-medium">Subcategories (optional)</legend>
            {categories
              .filter((c) => categoryIds.includes(c.id))
              .flatMap((c) =>
                c.subcategories.map((sub) => (
                  <label key={sub.id} className="mr-4 inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="subcategoryIds"
                      value={sub.id}
                      defaultChecked={shop?.subcategoryIds.includes(sub.id)}
                    />
                    {c.name}: {sub.name}
                  </label>
                )),
              )}
          </fieldset>
          <fieldset>
            <legend className="font-medium">
              <UiText>{"Service areas"}</UiText>
            </legend>
            {areas.map((a) => (
              <label key={a.id} className="mr-4 inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="serviceAreaIds"
                  value={a.id}
                  defaultChecked={shop?.serviceAreaIds.includes(a.id)}
                />
                {a.name} · {a.pincodes.join(", ")}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend className="font-medium">Fulfilment options</legend>
            {(["pickup", "seller_delivery", "platform_delivery"] as const).map((method) => (
              <label key={method} className="mr-4 inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="fulfilment"
                  value={method}
                  defaultChecked={shop?.fulfilment.includes(method)}
                />
                {method.replaceAll("_", " ")}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">
              Delivery requires a configured fee and eligible address. Platform delivery also
              depends on platform coverage and partner availability.
            </p>
          </fieldset>
          <UiAttributes>
            <Field
              label="Timezone (IANA)"
              name="timezone"
              value={shop?.timezone ?? "Asia/Kolkata"}
              required
            />
          </UiAttributes>
          <UiAttributes>
            <Field label="Hours description (optional)" name="hours" value={shop?.hours} />
          </UiAttributes>
          <fieldset className="space-y-3">
            <legend className="font-medium">
              <UiText>{"Operating hours"}</UiText>
            </legend>
            <p className="text-xs text-muted-foreground">
              Add each open day. No intervals means closed; overnight closing times are supported.
            </p>
            {hours.map((hour, index) => (
              <div className="flex flex-wrap items-end gap-2" key={index}>
                <label className="text-sm">
                  Day
                  <UiAttributes>
                    <select
                      aria-label={`Day for interval ${index + 1}`}
                      className="ml-2 rounded border bg-background p-2"
                      value={hour.day}
                      onChange={(e) =>
                        setHours(
                          hours.map((h, i) =>
                            i === index ? { ...h, day: Number(e.target.value) } : h,
                          ),
                        )
                      }
                    >
                      {[
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ].map((day, i) => (
                        <option key={day} value={i}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </UiAttributes>
                </label>
                {(["opens", "closes"] as const).map((key) => (
                  <label key={key} className="text-sm">
                    {key}
                    <UiAttributes>
                      <input
                        aria-label={`${key} for interval ${index + 1}`}
                        className="ml-2 rounded border bg-background p-2"
                        type="time"
                        required
                        value={hour[key]}
                        onChange={(e) =>
                          setHours(
                            hours.map((h, i) =>
                              i === index ? { ...h, [key]: e.target.value } : h,
                            ),
                          )
                        }
                      />
                    </UiAttributes>
                  </label>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setHours(hours.filter((_, i) => i !== index))}
                >
                  Remove interval {index + 1}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => setHours([...hours, { day: 1, opens: "09:00", closes: "18:00" }])}
            >
              Add operating interval
            </Button>
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input
              name="temporarilyClosed"
              type="checkbox"
              defaultChecked={shop?.temporarilyClosed}
            />
            Temporarily closed
          </label>
          <SaveError error={save.error} />
          <Button type="submit">
            <UiText>{save.isPending ? "Saving…" : "Save and submit for approval"}</UiText>
          </Button>
        </fieldset>
      </form>
    </Panel>
  );
}
