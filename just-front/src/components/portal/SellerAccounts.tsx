import { LoadingState } from "@/components/common/LoadingState";
import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { management } from "@/services/management";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/states";
import { Panel, SaveError } from "./management-shared";
import { useDraftGuard } from "./useDraftGuard";
const inputSchema = z.object({
  name: z.string().trim().min(2, "Enter the seller's name").max(100),
  phone: z
    .string()
    .trim()
    .regex(
      /^(?:\+[1-9]\d{9,14}|[6-9]\d{9})$/,
      "Enter a valid mobile number, with country code if needed",
    ),
  password: z.string().min(12, "Use at least 12 characters for the password").max(128),
});
export function SellerAccounts() {
  const client = useQueryClient();
  const sellers = useQuery({ queryKey: ["admin-sellers"], queryFn: management.sellers });
  const draft = useDraftGuard();
  const [validation, setValidation] = useState<string>();
  const [created, setCreated] = useState<string>();
  const [requestError, setRequestError] = useState<Error | null>(null);
  const create = useMutation({
    gcTime: 0,
    mutationFn: management.createSeller,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin-sellers"] });
    },
  });
  return (
    <Panel>
      {draft.dialog}
      <div>
        <h2 className="font-display text-2xl">Add a seller</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a seller login here. The seller then submits their shop profile for your approval.
        </p>
      </div>
      <form
        onChange={draft.mark}
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const values = new FormData(form);
          setValidation(undefined);
          setCreated(undefined);
          setRequestError(null);
          create.reset();
          const parsed = inputSchema.safeParse({
            name: values.get("name"),
            phone: values.get("phone"),
            password: values.get("password"),
          });
          if (!parsed.success) {
            setValidation(parsed.error.issues.map((issue) => issue.message).join(". "));
            return;
          }
          const input = {
            ...parsed.data,
            phone: parsed.data.phone.startsWith("+")
              ? parsed.data.phone
              : `+91${parsed.data.phone}`,
          };
          create.mutate(input, {
            onSuccess: (account) => {
              form.reset();
              draft.reset();
              setCreated(
                `${account.name}'s seller account is ready. Share their login details privately; no SMS has been sent.`,
              );
              create.reset();
            },
            onError: (error) => {
              setRequestError(error);
              create.reset();
            },
          });
        }}
      >
        <fieldset disabled={create.isPending} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span>Seller name</span>
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                autoComplete="off"
                className="block w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Seller mobile number</span>
              <UiAttributes>
                <input
                  name="phone"
                  required
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="+91…"
                  className="block w-full rounded-md border border-input bg-background px-3 py-2"
                />
              </UiAttributes>
            </label>
            <label className="block space-y-1 text-sm">
              <span>Seller password</span>
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                aria-describedby="seller-password-help"
                className="block w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </label>
          </div>
          <p id="seller-password-help" className="text-xs text-muted-foreground">
            12 to 128 characters. Share securely with the seller. This does not change an existing
            account or automatically approve a shop. Password reset and SMS invitations are not
            connected yet.
          </p>
          {validation && (
            <p role="alert" className="text-sm text-destructive">
              {validation}
            </p>
          )}
          <SaveError error={requestError} />
          <Button type="submit">
            <UiText>{create.isPending ? "Creating seller…" : "Create seller account"}</UiText>
          </Button>
        </fieldset>
      </form>
      {created && (
        <p role="status" className="rounded-lg bg-secondary p-3 text-sm">
          {created}
        </p>
      )}
      <div className="border-t border-border pt-4">
        <h3 className="font-medium">Seller accounts</h3>
        {sellers.isPending ? (
          <LoadingState label="Loading seller accounts…" compact />
        ) : sellers.error ? (
          <UiAttributes>
            <ErrorState message={sellers.error.message} onRetry={() => void sellers.refetch()} />
          </UiAttributes>
        ) : sellers.data.length ? (
          <ul className="mt-3 divide-y divide-border">
            {[...sellers.data]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((account) => (
                <li key={account.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                  <span>
                    <strong>{account.name}</strong>
                    <span className="ml-3 text-muted-foreground">{account.phone}</span>
                  </span>
                  <span>
                    <UiText>{account.active ? "Active login" : "Inactive login"}</UiText>
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No seller accounts yet. Add the first real seller above.
          </p>
        )}
      </div>
    </Panel>
  );
}
