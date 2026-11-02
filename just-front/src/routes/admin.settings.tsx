import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PortalHeader } from "@/components/portal/PortalShell";
import { Switch } from "@/components/ui/switch";
import { serviceAreas } from "@/mocks/data";
import { audit } from "@/mocks/admin";
import { DELIVERY_FEE } from "@/lib/pricing";
import { inr } from "@/lib/image";

export const Route = createFileRoute("/admin/settings")({ component: AdminSettings });

function AdminSettings() {
  const [areas, setAreas] = useState(serviceAreas);
  return (
    <>
      <UiAttributes>
        <PortalHeader title="Service areas & audit" />
      </UiAttributes>
      <section>
        <h2 className="border-b border-foreground pb-2 font-display text-xl">Serviceable areas</h2>
        <ul className="divide-y divide-border">
          {areas.map((a) => (
            <li key={a.id} className="flex items-center gap-4 py-3 text-sm">
              <span className="flex-1">
                <b className="font-medium">{a.name}</b>, {a.city}
                <span className="block text-xs text-muted-foreground">
                  PIN {a.pincodes.join(", ")}
                </span>
              </span>
              <UiAttributes>
                <Switch
                  checked={a.active}
                  onCheckedChange={(v) => {
                    setAreas((x) => x.map((y) => (y.id === a.id ? { ...y, active: v } : y)));
                    toast(`${a.name} ${v ? "enabled" : "disabled"} (demo)`);
                  }}
                  aria-label={`Toggle ${a.name}`}
                />
              </UiAttributes>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-10 text-sm">
        <h2 className="border-b border-foreground pb-2 font-display text-xl">Delivery settings</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="label-stamp text-muted-foreground">Rider delivery fee</dt>
            <dd>{inr(DELIVERY_FEE.platform_delivery)}</dd>
          </div>
          <div>
            <dt className="label-stamp text-muted-foreground">Rider fee policy</dt>
            <dd>Fixed per shop order</dd>
          </div>
          <div>
            <dt className="label-stamp text-muted-foreground">Seller delivery</dt>
            <dd>Set by shop</dd>
          </div>
        </dl>
      </section>
      <section id="admin-audit-log" className="mt-10">
        <h2 className="border-b border-foreground pb-2 font-display text-xl">
          <UiText>{"Audit log"}</UiText>
        </h2>
        <ul className="divide-y divide-border font-mono text-xs">
          {audit.map((a, i) => (
            <li key={i} className="flex gap-4 py-2">
              <span className="w-20 text-muted-foreground">{a.at}</span>
              <span className="w-24">{a.who}</span>
              <span className="flex-1">{a.what}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
