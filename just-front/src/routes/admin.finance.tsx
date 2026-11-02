import { UiAttributes } from "@/lib/i18n/Language";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PortalHeader } from "@/components/portal/PortalShell";
import { DataTable } from "@/components/portal/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { coupons } from "@/mocks/admin";

export const Route = createFileRoute("/admin/finance")({ component: Finance });

function Finance() {
  return (
    <>
      <UiAttributes>
        <PortalHeader title="Payments & coupons" />
      </UiAttributes>
      <section className="grid gap-4 md:grid-cols-3">
        {["Payments", "Refunds", "Seller settlements"].map((t) => (
          <div key={t} className="border border-dashed border-border p-5 text-sm">
            <p className="font-display text-xl">{t}</p>
            <p className="mt-1 text-muted-foreground">
              Loads from the payments service. No transaction data is simulated.
            </p>
          </div>
        ))}
      </section>
      <h2 className="mt-12 border-b border-foreground pb-2 font-display text-xl">
        Coupons & promotions
      </h2>
      <div className="mt-4">
        <DataTable
          rows={coupons}
          toolbar={
            <Button
              size="sm"
              onClick={() => toast.info("Coupon creation requires backend validation rules.")}
            >
              New coupon
            </Button>
          }
          columns={[
            { key: "c", header: "Code", cell: (r) => <span className="font-mono">{r.code}</span> },
            { key: "d", header: "Description", cell: (r) => r.desc },
            { key: "f", header: "Funded by", cell: (r) => r.funded },
            { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      </div>
    </>
  );
}
