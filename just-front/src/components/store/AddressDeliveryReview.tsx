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
}: {
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
        Where should it go?
      </h2>
      <p className="text-sm text-muted-foreground">
        Check pincode coverage, saved delivery-pin distance when available, and listed pickup
        options. The server review below determines whether COD can be placed; this check does not
        reserve stock.
      </p>
      {!ready ? (
        <p role="status">Checking your session…</p>
      ) : !session ? (
        <Button asChild>
          <Link to="/login">Sign in to check your address</Link>
        </Button>
      ) : (
        <SignedInReview
          key={session.userId}
          userId={session.userId}
          shops={shops}
          lines={lines}
          areaId={areaId}
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
}: {
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
    : addresses.data?.find((address) => address.id === selected);
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
  return (
    <>
      {addresses.isPending ? (
        <p role="status">Loading saved addresses…</p>
      ) : addresses.isError ? (
        <div role="alert">
          <p>Couldn't load saved addresses.</p>
          <Button variant="outline" onClick={() => void addresses.refetch()}>
            Retry addresses
          </Button>
        </div>
      ) : (
        <>
          {!addresses.data.length && <p>No saved addresses yet.</p>}
          <Button variant="outline" asChild>
            <Link to="/account" search={{ tab: "addresses" }}>
              Manage saved addresses
            </Link>
          </Button>
          {!!addresses.data.length && (
            <fieldset className="space-y-2">
              <legend className="mb-2 font-medium">Choose an address to check</legend>
              {addresses.data.map((address) => (
                <label
                  key={address.id}
                  className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 text-sm"
                >
                  <input
                    type="radio"
                    name="delivery-address"
                    value={address.id}
                    checked={selected === address.id}
                    onChange={() => {
                      setSelected(address.id);
                      setChoices({});
                    }}
                    className="mt-1 accent-primary"
                  />
                  <span>
                    <strong>{address.label}</strong>
                    <br />
                    {address.line1}, {address.locality}, {address.city} {address.pincode}
                    <span className="block text-xs text-muted-foreground">
                      {address.location
                        ? "Delivery pin saved; distance is checked per shop."
                        : "No pin saved: pincode coverage only, exact destination distance not checked."}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </>
      )}
      {current &&
        (check.isPending ? (
          <p role="status">Checking shop delivery options…</p>
        ) : check.isError ? (
          <div role="alert">
            <p>
              Couldn't verify delivery options. The address may have changed; reload addresses or
              retry.
            </p>
            <Button variant="outline" onClick={() => void addresses.refetch()}>
              Reload addresses
            </Button>
            <Button variant="outline" onClick={() => void check.refetch()}>
              Retry delivery check
            </Button>
          </div>
        ) : check.data && check.data.addressVersion !== current.version ? (
          <div role="alert">
            <p>Your address changed elsewhere. Reload addresses before checking delivery again.</p>
            <Button variant="outline" onClick={() => void addresses.refetch()}>
              Reload addresses
            </Button>
          </div>
        ) : (
          check.data && (
            <div className="space-y-4" aria-live="polite">
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
                  {!group.options.length && (
                    <p className="text-sm">No fulfilment options verified.</p>
                  )}
                  <ul className="space-y-2">
                    {group.options.map((option) => (
                      <li key={option.method} className="text-sm">
                        <p className="font-medium">
                          {fulfilmentLabel[option.method]} ·{" "}
                          {option.status === "eligible"
                            ? "Configured checks passed"
                            : option.status === "unavailable"
                              ? "Unavailable"
                              : "Not verified"}
                        </p>
                        <p className="text-muted-foreground">{option.message}</p>
                        {lines.length > 0 && (
                          <label className="my-2 flex items-center gap-2">
                            <input
                              type="radio"
                              name={`fulfilment-${group.shopId}`}
                              disabled={option.status !== "eligible" || check.isFetching}
                              checked={choices[group.shopId] === option.method}
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
                            {option.method === "pickup"
                              ? "Pickup delivery charge: ₹0"
                              : `Listed fee: ${option.listedFee === null ? "Not supplied" : inr(option.listedFee)} · Final quote pending`}
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
                Refresh delivery check
              </Button>
              {areaId &&
                lines.length > 0 &&
                !check.isFetching &&
                ids.every((id) =>
                  check
                    .data!.shops.find((shop) => shop.shopId === id)
                    ?.options.some(
                      (option) => option.method === choices[id] && option.status === "eligible",
                    ),
                ) && (
                  <CheckoutReviewPanel
                    userId={userId}
                    areaId={areaId}
                    addressId={current.id}
                    addressVersion={current.version}
                    lines={lines}
                    fulfilments={ids.map((shopId) => ({ shopId, method: choices[shopId] }))}
                  />
                )}
            </div>
          )
        ))}
    </>
  );
}
