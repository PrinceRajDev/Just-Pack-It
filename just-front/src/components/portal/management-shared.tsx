import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useState, useRef, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
export function Field({
  label,
  name,
  value,
  type = "text",
  required = false,
  min,
  max,
  step,
  placeholder,
}: {
  label: string;
  name: string;
  value?: string | number;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span>
        <UiText>{label}</UiText>
      </span>
      <UiAttributes>
        <Input
          name={name}
          type={type}
          defaultValue={value}
          required={required}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          onWheel={name === "stock" ? (event) => event.currentTarget.blur() : undefined}
        />
      </UiAttributes>
    </label>
  );
}
export const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
export const selected = (data: FormData, key: string) => data.getAll(key).map(String);
export function number(data: FormData, key: string) {
  const value = text(data, key);
  if (!value || !Number.isFinite(Number(value))) throw new Error(`Enter a valid ${key}.`);
  return Number(value);
}
export function useSave() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      await client.invalidateQueries();
      toast.success("Saved to the server");
    },
  });
}
export function SaveError({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
    >
      <UiText>
        {error instanceof ApiError && error.code === "VERSION_CONFLICT"
          ? "This record changed elsewhere. Your changes were not saved. Copy your changes, then reload the latest record before retrying."
          : error instanceof ApiError && error.fields?.length
            ? `${error.message}: ${error.fields.join(", ")}`
            : error.message}
      </UiText>
    </p>
  );
}
export function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 md:p-6">
      {children}
    </section>
  );
}
export function Attributes({
  values = [],
  prefix = "attr",
}: {
  values?: { label: string; value: string }[];
  prefix?: string;
}) {
  const [rows, setRows] = useState(() => values.map((value, key) => ({ ...value, key })));
  const nextKey = useRef(values.length);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Product details (optional)</legend>
      <p className="text-xs text-muted-foreground">
        Use relevant details such as size, colour, weight, cut, model or compatibility.
      </p>
      {rows.map((row, index) => (
        <div className="flex gap-2" key={row.key}>
          <UiAttributes>
            <Field label="Detail" name={`${prefix}-label-${index}`} value={row.label} required />
          </UiAttributes>
          <UiAttributes>
            <Field label="Value" name={`${prefix}-value-${index}`} value={row.value} required />
          </UiAttributes>
          <UiAttributes>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
              aria-label={`Remove detail ${index + 1}`}
            >
              <UiText>{"Remove"}</UiText>
            </Button>
          </UiAttributes>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => setRows([...rows, { label: "", value: "", key: nextKey.current++ }])}
      >
        Add detail
      </Button>
    </fieldset>
  );
}
export function attributes(data: FormData, prefix = "attr") {
  return [...data.keys()]
    .filter((key) => key.startsWith(`${prefix}-label-`))
    .map((key) => ({
      label: text(data, key),
      value: text(data, key.replace(`${prefix}-label-`, `${prefix}-value-`)),
    }));
}
