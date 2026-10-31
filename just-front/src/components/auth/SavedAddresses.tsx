import { DeliveryPinEditor } from "@/components/store/DeliveryPinEditor";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { savedAddresses, type SavedAddress, type AddressInput } from "@/services/addresses";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDraftGuard } from "@/components/portal/useDraftGuard";
import { MapPin, Plus, RefreshCw } from "lucide-react";

const empty: AddressInput = { label: "", line1: "", locality: "", city: "", pincode: "" };
const fields = [
  ["label", "Address label", 60, "off"],
  ["line1", "House, street and landmark", 300, "address-line1"],
  ["locality", "Locality / village", 120, "address-line2"],
  ["city", "City / town", 120, "address-level2"],
  ["pincode", "Pincode", 6, "postal-code"],
] as const;
export function SavedAddresses({ userId }: { userId: string }) {
  const client = useQueryClient();
  const key = ["addresses", userId];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => savedAddresses.list(signal),
    retry: false,
  });
  const [editing, setEditing] = useState<SavedAddress | "new" | null>(null);
  const [draft, setDraft] = useState<AddressInput>(empty);
  const [deleting, setDeleting] = useState<SavedAddress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const guard = useDraftGuard();
  function start(address: SavedAddress | "new") {
    setEditing(address);
    setError("");
    setNotice("");
    setDraft(
      address === "new"
        ? empty
        : {
            label: address.label,
            line1: address.line1,
            locality: address.locality,
            city: address.city,
            pincode: address.pincode,
            ...(address.location ? { location: address.location } : {}),
          },
    );
  }
  async function commit(remove = false) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (remove && deleting) await savedAddresses.remove(deleting.id, deleting.version);
      else if (editing) {
        const input = Object.fromEntries(
          Object.entries(draft).map(([name, value]) => [
            name,
            typeof value === "string" ? value.trim() : value,
          ]),
        ) as AddressInput;
        if (editing === "new") await savedAddresses.create(input);
        else await savedAddresses.update(editing.id, editing.version, input);
      }
      guard.reset();
      setEditing(null);
      setDeleting(null);
      setNotice(remove ? "Address removed." : "Address saved.");
      await client.invalidateQueries({ queryKey: key });
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 409
          ? "This address changed elsewhere. Your draft is kept. Cancel, then reload addresses before trying again."
          : cause instanceof Error
            ? cause.message
            : "Couldn't save your address. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-6" aria-labelledby="saved-addresses-heading">
      {guard.dialog}
      <div className="account-section-heading">
        <h2 id="saved-addresses-heading" className="account-card-heading">
          <span>
            <MapPin size={21} aria-hidden="true" />
          </span>
          Saved addresses
        </h2>
        <p>
          Saved delivery addresses. Delivery availability and charges will be checked separately at
          checkout.
        </p>
      </div>
      <p role="status" className="text-sm text-primary">
        {notice}
      </p>
      {error && (
        <p role="alert" className="my-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {query.isPending ? (
        <p role="status">Loading addresses…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>Couldn't load addresses. Your saved data has not been replaced.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry addresses
          </Button>
        </div>
      ) : (
        <>
          {!query.data.length && (
            <p className="my-4 text-muted-foreground">
              No saved addresses yet. Add the place you'd like your shopping delivered.
            </p>
          )}
          <ul className="my-4 grid gap-3 sm:grid-cols-2">
            {query.data.map((address) => (
              <li key={address.id} className="rounded-xl border border-border bg-card p-4">
                <h3 className="font-semibold">{address.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {address.line1}, {address.locality}, {address.city} {address.pincode}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {address.location
                    ? "Delivery pin saved; shop coverage checked at checkout."
                    : "No delivery pin; pincode coverage only."}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    disabled={!!editing || !!deleting || busy}
                    aria-label={`Edit ${address.label}`}
                    onClick={() => start(address)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!!editing || !!deleting || busy}
                    aria-label={`Remove ${address.label}`}
                    onClick={() => {
                      setDeleting(address);
                      setError("");
                      setNotice("");
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {!editing && !deleting && (
            <div className="flex gap-2">
              <Button onClick={() => start("new")}>
                <Plus size={17} aria-hidden="true" />
                Add address
              </Button>
              <Button
                variant="outline"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                <RefreshCw size={16} aria-hidden="true" />
                Reload addresses
              </Button>
            </div>
          )}
        </>
      )}
      {deleting && (
        <div
          className="my-4 rounded-xl border border-border p-4"
          role="group"
          aria-label="Confirm address removal"
        >
          <p>Remove {deleting.label}? This removes it from your saved addresses.</p>
          <div className="mt-3 flex gap-2">
            <Button disabled={busy} onClick={() => void commit(true)}>
              {busy ? "Removing…" : "Confirm removal"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDeleting(null);
                setError("");
              }}
            >
              Keep address
            </Button>
          </div>
        </div>
      )}
      {editing && (
        <form
          className="my-5 max-w-xl space-y-4 rounded-xl border border-border bg-card p-5"
          onChange={guard.mark}
          onSubmit={(event) => {
            event.preventDefault();
            void commit();
          }}
        >
          <h3 className="font-semibold">
            {editing === "new" ? "Add an address" : `Edit ${editing.label}`}
          </h3>
          <fieldset disabled={busy} className="space-y-4">
            {fields.map(([name, label, max, autocomplete]) => (
              <div key={name}>
                <Label htmlFor={`address-${name}`}>{label}</Label>
                <Input
                  id={`address-${name}`}
                  className="mt-1"
                  required
                  maxLength={max}
                  minLength={name === "line1" ? 3 : 1}
                  autoComplete={autocomplete}
                  inputMode={name === "pincode" ? "numeric" : "text"}
                  pattern={name === "pincode" ? "[1-9][0-9]{5}" : ".*\\S.*"}
                  value={draft[name]}
                  onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
                />
              </div>
            ))}
            <DeliveryPinEditor
              key={editing === "new" ? "new" : editing.id}
              value={draft.location}
              onChange={(location) => {
                setDraft((current) => ({ ...current, location }));
                guard.mark();
              }}
            />
            <div className="flex gap-2">
              <Button type="submit">{busy ? "Saving…" : "Save address"}</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  guard.reset();
                  setEditing(null);
                  setError("");
                }}
              >
                Cancel
              </Button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
