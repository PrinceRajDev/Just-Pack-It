import { MapPin } from "lucide-react";
import { UiText } from "@/lib/i18n/Language";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/stores/auth";
import { savedAddresses } from "@/services/addresses";
import { reviewFulfilment } from "@/services/fulfilment";
import type { Shop, CartLine, FulfilmentMethod } from "@/domain/types";
import { CheckoutReviewPanel } from "./CheckoutReviewPanel";
import { Button } from "@/components/ui/button";
import { fulfilmentLabel } from "./ShopMark";
import { inr } from "@/lib/image";
export function AddressDeliveryReview({
  shops,
  lines = [],
  areaId,
  compact = false,
  riderOnly = false,
}: {
  riderOnly?: boolean;
  compact?: boolean;
  shops: Shop[];
  lines?: CartLine[];
  areaId?: string;
}) {
  const { session, ready } = useAuth();
  return (
    <section
      className="space-y-4 rounded-xl border border-border bg-card p-5"
      aria-labelledby="delivery-check-heading"
    >
      <h2 id="delivery-check-heading" className="font-display text-2xl">
        <MapPin size={22} aria-hidden="true" />
        <UiText>{"Delivery address"}</UiText>
      </h2>
      <p className="text-sm text-muted-foreground">
        <UiText>{"Choose your saved address and how you want to receive your order."}</UiText>
      </p>
      {!ready ? (
        <p role="status">Checking your session…</p>
      ) : !session ? (
        <Button asChild>
          <Link to="/login">
            <UiText>{"Sign in to check your address"}</UiText>
          </Link>
        </Button>
      ) : (
        <SignedInReview
          key={session.userId}
          userId={session.userId}
          shops={shops}
          lines={lines}
          areaId={areaId}
          compact={compact}
          riderOnly={riderOnly}
        />
      )}
    </section>
  );
}
function SignedInReview({
  userId,
  shops,
  lines,
  areaId,
  compact,
  riderOnly,
}: {
  riderOnly: boolean;
  compact: boolean;
  userId: string;
  shops: Shop[];
  lines: CartLine[];
  areaId?: string;
}) {
  const [selected, setSelected] = useState("");
  const [choices, setChoices] = useState<Record<string, FulfilmentMethod>>({});
  const addresses = useQuery({
    queryKey: ["addresses", userId],
    queryFn: ({ signal }) => savedAddresses.list(signal),
    retry: false,
  });
  const current = addresses.isError
    ? undefined
    : addresses.data?.find((address) => address.id === (selected || addresses.data?.[0]?.id));
  const ids = shops.map((shop) => shop.id).sort();
  const check = useQuery({
    queryKey: ["fulfilment-review", userId, current?.id, current?.version, ids],
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    queryFn: ({ signal }) => reviewFulfilment(current!.id, ids, signal),
    enabled: !!current && ids.length > 0,
    retry: false,
    staleTime: 0,
  });
  // Only delivery can be preselected. Pickup always needs an explicit choice.
  const resolvedChoices = { ...choices };
  if (check.data?.addressVersion === current?.version) {
    for (const group of check.data?.shops ?? []) {
      if (!resolvedChoices[group.shopId]) {
        const delivery = group.options.find(
          (option) =>
            option.status === "eligible" &&
            (riderOnly ? option.method === "platform_delivery" : option.method !== "pickup"),
        );
        if (delivery) resolvedChoices[group.shopId] = delivery.method;
      }
    }
  }
  return (
    <>
      {addresses.isPending ? (
        <p role="status">
          <UiText>{"Loading saved addresses…"}</UiText>
        </p>
      ) : addresses.isError ? (
        <div role="alert">
          <p>Couldn't load saved addresses.</p>
          <Button variant="outline" onClick={() => void addresses.refetch()}>
            <UiText>{"Retry addresses"}</UiText>
          </Button>
        </div>
      ) : (
        <>
          {!addresses.data.length && (
            <p>
              <UiText>{"No saved addresses yet."}</UiText>
            </p>
          )}
          {!addresses.data.length && (
            <div className="bag-address-empty-action">
              <Button variant="outline" asChild>
                <Link to="/account" search={{ tab: "addresses" }}>
                  <UiText>{"Manage saved addresses"}</UiText>
                </Link>
              </Button>
            </div>
          )}
          {!!addresses.data.length && (
            <details className="bag-address-picker" open={!compact}>
              <summary>
                {current && (
                  <>
                    <strong>{current.label}</strong>
                    <span>
                      {current.line1}, {current.locality}, {current.city} {current.pincode}
                    </span>
                  </>
                )}
                <span className="bag-edit-address">
                  <UiText>Edit</UiText>
                </span>
              </summary>
              <fieldset className="space-y-2">
                <legend className="mb-2 font-medium">
                  <UiText>{"Delivery address"}</UiText>
                </legend>
                {addresses.data.map((address) => (
                  <label
                    key={address.id}
                    className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 text-sm"
                  >
                    <input
                      type="radio"
                      name="delivery-address"
                      value={address.id}
                      checked={current?.id === address.id}
                      onChange={() => {
                        setSelected(address.id);
                        setChoices({});
                      }}
                      className="mt-1 accent-primary"
                    />
                    <span>
                      <strong>
                        <UiText>{address.label}</UiText>
                      </strong>
                      <br />
                      {address.line1}, {address.locality}, {address.city} {address.pincode}
                      <span className="block text-xs text-muted-foreground">
                        <UiText>
                          {address.location
                            ? "Delivery pin saved; distance is checked per shop."
                            : "No pin saved: pincode coverage only, exact destination distance not checked."}
                        </UiText>
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="bag-address-manage">
                <Button variant="outline" asChild>
                  <Link to="/account" search={{ tab: "addresses" }}>
                    <UiText>{"Manage saved addresses"}</UiText>
                  </Link>
                </Button>
              </div>
            </details>
          )}
        </>
      )}
      {current &&
        (check.isPending ? (
          <p role="status">
            <UiText>{"Checking shop delivery options…"}</UiText>
          </p>
        ) : check.isError ? (
          <div role="alert">
            <p>
              Couldn't verify delivery options. The address may have changed; reload addresses or
              retry.
            </p>
            <Button variant="outline" onClick={() => void addresses.refetch()}>
              <UiText>{"Reload addresses"}</UiText>
            </Button>
            <Button variant="outline" onClick={() => void check.refetch()}>
              <UiText>{"Retry delivery check"}</UiText>
            </Button>
          </div>
        ) : check.data && check.data.addressVersion !== current.version ? (
          <div role="alert">
            <p>Your address changed elsewhere. Reload addresses before checking delivery again.</p>
            <Button variant="outline" onClick={() => void addresses.refetch()}>
              <UiText>{"Reload addresses"}</UiText>
            </Button>
          </div>
        ) : (
          check.data && (
            <div className="space-y-4" aria-live="polite">
              <details
                className="bag-delivery-options"
                open={!compact || ids.some((id) => !resolvedChoices[id])}
              >
                <summary>
                  <UiText>{riderOnly ? "Rider delivery" : "Delivery and pickup options"}</UiText>
                </summary>
                {check.data.shops.map((group) => (
                  <div key={group.shopId} className="border-t border-border pt-3">
                    <h3 className="font-semibold">
                      {shops.find((shop) => shop.id === group.shopId)?.name ?? "Shop"}
                    </h3>
                    {group.issues.map((issue) => (
                      <p key={issue.code} className="text-sm text-destructive">
                        {issue.message}
                      </p>
                    ))}
                    {riderOnly &&
                      !group.options.some(
                        (option) =>
                          option.method === "platform_delivery" && option.status === "eligible",
                      ) && (
                        <p role="status" className="bag-delivery-warning">
                          <UiText>
                            Rider delivery is not available for this shop and address. Try another
                            address or remove this shop to continue.
                          </UiText>
                        </p>
                      )}
                    {!group.options.length && (
                      <p className="text-sm">No delivery or pickup options available.</p>
                    )}
                    <ul className="space-y-2">
                      {group.options
                        .filter((option) => !riderOnly || option.method === "platform_delivery")
                        .map((option) => (
                          <li key={option.method} className="text-sm">
                            <p className="font-medium">
                              {riderOnly
                                ? "Rider collects from shop and delivers to you"
                                : fulfilmentLabel[option.method]}{" "}
                              ·{" "}
                              <UiText>
                                {option.status === "eligible"
                                  ? "Available"
                                  : option.status === "unavailable"
                                    ? "Unavailable"
                                    : "Not verified"}
                              </UiText>
                            </p>
                            <p className="text-muted-foreground">{option.message}</p>
                            {lines.length > 0 && !riderOnly && (
                              <label className="my-2 flex items-center gap-2">
                                <input
                                  type="radio"
                                  name={`fulfilment-${group.shopId}`}
                                  disabled={option.status !== "eligible" || check.isFetching}
                                  checked={resolvedChoices[group.shopId] === option.method}
                                  onChange={() =>
                                    setChoices({ ...choices, [group.shopId]: option.method })
                                  }
                                  className="accent-primary"
                                />
                                Choose {fulfilmentLabel[option.method]} for{" "}
                                {shops.find((shop) => shop.id === group.shopId)?.name ?? "shop"}
                              </label>
                            )}
                            {option.status === "eligible" && (
                              <p>
                                <UiText>
                                  {option.method === "pickup"
                                    ? "Pickup delivery charge: ₹0"
                                    : `Listed fee: ${option.listedFee === null ? "Not supplied" : inr(option.listedFee)}`}
                                </UiText>
                              </p>
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
                <Button
                  variant="outline"
                  disabled={check.isFetching}
                  onClick={() => void check.refetch()}
                >
                  <UiText>{"Refresh delivery check"}</UiText>
                </Button>
              </details>
              {areaId &&
                lines.length > 0 &&
                !check.isFetching &&
                ids.every((id) =>
                  check
                    .data!.shops.find((shop) => shop.shopId === id)
                    ?.options.some(
                      (option) =>
                        option.method === resolvedChoices[id] && option.status === "eligible",
                    ),
                ) && (
                  <CheckoutReviewPanel
                    compact={compact}
                    userId={userId}
                    areaId={areaId}
                    addressId={current.id}
                    addressVersion={current.version}
                    lines={lines}
                    fulfilments={ids.map((shopId) => ({ shopId, method: resolvedChoices[shopId] }))}
                  />
                )}
            </div>
          )
        ))}
    </>
  );
}
