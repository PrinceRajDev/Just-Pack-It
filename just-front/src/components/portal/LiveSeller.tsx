import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Store, Clock3, Camera, MapPin, Tag, Check } from "lucide-react";
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
import { NeighbourhoodIllustration } from "./NeighbourhoodIllustration";
import { ErrorState, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Field, SaveError, useSave, text, number, selected } from "./management-shared";
import { LiveProducts } from "./LiveProducts";
import { useDraftGuard } from "./useDraftGuard";
import { SellerOnboarding } from "./SellerOnboarding";
import { ShopReviewNotice } from "./ShopReviewNotice";
import { LiveSellerOrders } from "./LiveSellerOrders";
import { ShopPhotoUpload } from "./ShopPhotoUpload";
import { ShopAvailability } from "./ShopAvailability";
import { LiveInventory } from "./LiveInventory";

export function LiveSeller() {
  const [settingsTab, setSettingsTab] = useState("details");
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
      <ShopForm
        key={`${shop.data?.id ?? "new"}:${shop.data?.version ?? 0}`}
        shop={shop.data}
        categories={categories.data}
        areas={areas.data}
        tab={settingsTab}
        onTabChange={setSettingsTab}
      />
    </>
  );
}

export function ShopForm({
  shop,
  categories,
  areas,
  tab,
  onTabChange,
}: {
  tab?: string;
  onTabChange?: (value: string) => void;
  shop: ManagedShop | null;
  categories: ManagedCategory[];
  areas: ManagedArea[];
}) {
  const save = useSave();
  const draft = useDraftGuard();
  const [profileEditing, setProfileEditing] = useState(false);
  const [localTab, setLocalTab] = useState("details");
  const settingsTab = tab ?? localTab;
  const setSettingsTab = onTabChange ?? setLocalTab;
  const [photoEditing, setPhotoEditing] = useState(false);
  const [shopAddress, setShopAddress] = useState(shop?.address ?? "");
  const [shopLocality, setShopLocality] = useState(shop?.locality ?? "");
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
    <div className="seller-settings-page">
      {draft.dialog}
      <header className="seller-settings-hero">
        <div className="seller-settings-hero-copy">
          <p className="workspace-eyebrow">
            Just Pack It · <UiText>Workspace</UiText>
          </p>
          <h1>
            <UiText>{shop ? "Shop settings" : "Bring your shop online"}</UiText>
          </h1>
          <p>
            <UiText>Manage your profile, availability and photo. Choose a section below.</UiText>
          </p>
        </div>
        <div className="seller-settings-art" aria-hidden="true">
          <NeighbourhoodIllustration />
        </div>
        {shop?.review && (
          <div className="seller-settings-review">
            <ShopReviewNotice shop={shop} />
          </div>
        )}
      </header>
      <Tabs value={settingsTab} onValueChange={setSettingsTab} className="seller-shop-settings">
        <TabsList aria-label="Shop settings sections" className="seller-settings-tabs">
          <TabsTrigger value="details">
            <Store size={18} aria-hidden="true" />
            <UiText>Shop details</UiText>
          </TabsTrigger>
          {shop && (
            <TabsTrigger value="availability">
              <Clock3 size={18} aria-hidden="true" />
              <UiText>Hours & delivery</UiText>
            </TabsTrigger>
          )}
          {shop && (
            <TabsTrigger value="photo">
              <Camera size={18} aria-hidden="true" />
              <UiText>Shop photo</UiText>
            </TabsTrigger>
          )}
        </TabsList>
        {(profileEditing || photoEditing) && (
          <p role="status" className="seller-settings-draft">
            <UiText>
              {profileEditing
                ? "You have unsaved shop details. Save them before updating another section."
                : "You have a selected shop photo. Save or discard it before editing shop details."}
            </UiText>
          </p>
        )}
        <TabsContent
          value="details"
          forceMount
          hidden={settingsTab !== "details"}
          className="seller-settings-content"
        >
          <div className="seller-settings-note">
            <strong>
              <UiText>Shown to your customers</UiText>
            </strong>
            <p>
              <UiText>
                Changes to your shop profile need admin review. Hours and delivery have their own
                save button in the next tab.
              </UiText>
            </p>
          </div>
          <form
            onChange={(event) => {
              const field: EventTarget = event.target;
              if (field instanceof HTMLInputElement) {
                if (field.name === "address") setShopAddress(field.value);
                if (field.name === "locality") setShopLocality(field.value);
              }
              draft.mark();
              setProfileEditing(true);
            }}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              save.mutate(async () => {
                if (Boolean(text(data, "latitude")) !== Boolean(text(data, "longitude")))
                  throw new Error(
                    "Enter both shop latitude and longitude, or leave both unchanged.",
                  );
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
                  ...(text(data, "deliveryFee")
                    ? { deliveryFee: number(data, "deliveryFee") }
                    : {}),
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
                  throw new Error(
                    "Choose at least one category, service area and fulfilment method.",
                  );
                await management.saveShop(input, shop?.version);
                draft.reset();
              });
            }}
          >
            <fieldset disabled={save.isPending || photoEditing} className="space-y-5">
              <section className="seller-settings-group">
                <h3>
                  <Store size={22} aria-hidden="true" />
                  <UiText>Your shop identity</UiText>
                </h3>
                <p>
                  <UiText>Use the name and address customers know.</UiText>
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <UiAttributes>
                    <Field label="Shop name" name="name" value={shop?.name} required />
                  </UiAttributes>

                  {!shop && (
                    <UiAttributes>
                      <Field label="Shop URL slug (lowercase-with-hyphens)" name="slug" required />
                    </UiAttributes>
                  )}
                  <UiAttributes>
                    <Field
                      label="Locality / address"
                      name="locality"
                      value={shop?.locality}
                      required
                    />
                  </UiAttributes>
                  <UiAttributes>
                    <Field
                      label="Full shop address (blank keeps existing)"
                      name="address"
                      value={shop?.address}
                    />
                  </UiAttributes>

                  <UiAttributes>
                    <Field label="Tagline" name="tagline" value={shop?.tagline} />
                  </UiAttributes>
                  <UiAttributes>
                    <Field label="Description" name="description" value={shop?.description} />
                  </UiAttributes>
                </div>
              </section>
              <details className="seller-settings-advanced">
                <summary>
                  <UiText>More profile options</UiText>
                </summary>
                <div className="grid gap-4 md:grid-cols-2">
                  <UiAttributes>
                    <Field label="Short initials" name="initials" value={shop?.initials} required />
                  </UiAttributes>{" "}
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
                  </UiAttributes>{" "}
                  <UiAttributes>
                    <Field
                      label="Cover image HTTPS URL or durable key (optional)"
                      name="coverImage"
                      value={shop?.coverImage}
                    />
                  </UiAttributes>{" "}
                  <UiAttributes>
                    <Field
                      label="Listed delivery fee ₹ (blank keeps existing)"
                      name="deliveryFee"
                      type="number"
                      min={0}
                      step="0.01"
                      value={shop?.deliveryFee}
                    />
                  </UiAttributes>{" "}
                  <UiAttributes>
                    <Field
                      label="Minimum order ₹ (blank keeps existing)"
                      name="minimumOrderAmount"
                      type="number"
                      min={0}
                      step="0.01"
                      value={shop?.minimumOrderAmount}
                    />
                  </UiAttributes>{" "}
                  <UiAttributes>
                    <Field label="Pickup instructions" name="pickupNote" value={shop?.pickupNote} />
                  </UiAttributes>{" "}
                </div>
              </details>
              <fieldset className="seller-settings-taxonomy">
                <legend className="font-medium">
                  <Tag size={22} aria-hidden="true" />
                  <UiText>What do you sell?</UiText>
                </legend>
                <div className="seller-category-options">
                  {categories.map((c) => (
                    <label
                      key={c.id}
                      className={`seller-category-option ${categoryIds.includes(c.id) ? "is-selected" : ""}`}
                    >
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
              <fieldset className="seller-settings-choices">
                <legend className="font-medium">
                  <UiText>Subcategories (optional)</UiText>
                </legend>
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
              <fieldset className="seller-settings-choices">
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
              <details className="seller-settings-advanced seller-settings-location">
                <summary>
                  <MapPin size={20} aria-hidden="true" />
                  <UiText>Shop location</UiText>
                </summary>
                <p>
                  <UiText>Stand at your shop when using GPS. Check the pin before saving.</UiText>
                </p>
                <ShopGpsPin
                  coordinates={shop?.location?.coordinates}
                  locationName={[shopAddress, shopLocality].filter(Boolean).join(", ")}
                  onChange={() => {
                    draft.mark();
                    setProfileEditing(true);
                  }}
                />
              </details>
              <details className="seller-settings-advanced" open={!shop}>
                <summary>
                  <UiText>
                    {shop
                      ? "Profile delivery values and advanced hours"
                      : "Set your opening hours and order methods"}
                  </UiText>
                </summary>
                <p className="text-sm text-muted-foreground">
                  <UiText>
                    {shop
                      ? "For daily changes, use Hours & delivery instead. Saving this profile submits all its values for admin review."
                      : "Choose how customers receive their order and when the shop is open."}
                  </UiText>
                </p>
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
                      <UiText>
                        {method === "pickup"
                          ? "Store pickup"
                          : method === "seller_delivery"
                            ? "Shop delivers"
                            : "Just Pack It rider"}
                      </UiText>
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
                    Add each open day. No intervals means closed; overnight closing times are
                    supported.
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
                    onClick={() =>
                      setHours([...hours, { day: 1, opens: "09:00", closes: "18:00" }])
                    }
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
              </details>
              <SaveError error={save.error} />
              <div className="seller-settings-save">
                <p>
                  <UiText>
                    Review your changes before submitting. Admin approval is required.
                  </UiText>
                </p>
                <Button type="submit" disabled={!!shop && !profileEditing}>
                  <Check size={18} aria-hidden="true" />
                  <UiText>{save.isPending ? "Saving…" : "Save and submit for approval"}</UiText>
                </Button>
              </div>
            </fieldset>
          </form>
        </TabsContent>
        {shop && (
          <TabsContent
            value="availability"
            forceMount
            hidden={settingsTab !== "availability"}
            className="seller-settings-content"
          >
            <div className="seller-settings-note">
              <strong>
                <UiText>Daily shop controls</UiText>
              </strong>
              <p>
                <UiText>
                  Change your hours, pause new orders or update delivery. Save availability here;
                  profile approval stays unchanged.
                </UiText>
              </p>
            </div>
            <ShopAvailability shop={shop} disabled={profileEditing || photoEditing} />
          </TabsContent>
        )}
        {shop && (
          <TabsContent
            value="photo"
            forceMount
            hidden={settingsTab !== "photo"}
            className="seller-settings-content"
          >
            <div className="seller-settings-note">
              <strong>
                <UiText>Help customers recognise your shop</UiText>
              </strong>
              <p>
                <UiText>Upload a clear storefront photo. A photo change needs admin review.</UiText>
              </p>
            </div>
            <ShopPhotoUpload
              shop={shop}
              disabled={save.isPending || profileEditing}
              onEditing={setPhotoEditing}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
