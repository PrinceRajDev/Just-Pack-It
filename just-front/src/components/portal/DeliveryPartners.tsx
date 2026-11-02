import { LoadingState } from "@/components/common/LoadingState";
import { UiText } from "@/lib/i18n/Language";
import { DeliveryExceptions } from "./DeliveryExceptions";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { delivery } from "@/services/delivery";
import { management } from "@/services/management";
import type { AdminPartner } from "@/domain/live-delivery";
import { Button } from "@/components/ui/button";
export function DeliveryPartners() {
  const query = useQuery({
      queryKey: ["admin-delivery-partners"],
      queryFn: delivery.partners,
      retry: false,
    }),
    areas = useQuery({ queryKey: ["admin-areas"], queryFn: management.adminAreas });
  return (
    <section className="my-8 space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-2xl">Delivery partner approval</h2>
      <DeliveryExceptions />
      <p className="text-sm">
        Existing delivery-role accounts only (up to100 shown). Provision accounts through the
        backend operator command. Approval and active area assignment allow partners to go online
        and claim one task. Changes are blocked during an active delivery.
      </p>
      {query.isPending || areas.isPending ? (
        <LoadingState label="Loading partners…" compact />
      ) : query.isError || areas.isError ? (
        <div role="alert">
          Could not load partners.{" "}
          <Button
            variant="outline"
            onClick={() => {
              void query.refetch();
              void areas.refetch();
            }}
          >
            Retry partners
          </Button>
        </div>
      ) : (
        <>
          {!query.data.length && <p>No delivery accounts found.</p>}
          {query.data.map((partner) => (
            <PartnerForm
              key={`${partner.id}:${partner.version}`}
              partner={partner}
              areas={areas.data.filter((a) => a.active)}
            />
          ))}
        </>
      )}
    </section>
  );
}
function PartnerForm({
  partner,
  areas,
}: {
  partner: AdminPartner;
  areas: { id: string; name: string }[];
}) {
  const [approved, setApproved] = useState(partner.approved),
    [selected, setSelected] = useState(partner.areaIds),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const client = useQueryClient();
  return (
    <form
      className="space-y-3 border-t border-border py-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          await delivery.savePartner(partner, approved, selected);
          await client.invalidateQueries({ queryKey: ["admin-delivery-partners"] });
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Approval was not confirmed; refresh and retry.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-semibold">{partner.name}</h3>
      <p className="break-all text-xs">
        {partner.id} · <UiText>{partner.active ? "Active account" : "Inactive account"}</UiText>
        <UiText>{partner.activeTask ? " · Active delivery" : ""}</UiText>
      </p>
      <fieldset disabled={busy || partner.activeTask || !partner.active} className="space-y-2">
        <legend className="sr-only">Delivery approval for {partner.name}</legend>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={approved}
            onChange={(e) => setApproved(e.target.checked)}
          />
          Approved delivery partner
        </label>
        <p className="text-sm">
          <UiText>{"Service areas"}</UiText>
        </p>
        {areas.map((area) => (
          <label key={area.id} className="mr-4 inline-flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(area.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, area.id]
                    : selected.filter((id) => id !== area.id),
                )
              }
            />
            {area.name}
          </label>
        ))}
        <Button variant="outline" disabled={!selected.length}>
          Save partner approval
        </Button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
