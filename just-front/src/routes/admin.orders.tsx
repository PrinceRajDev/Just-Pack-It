import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { z } from "zod";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PortalHeader } from "@/components/portal/PortalShell";
import { DataTable } from "@/components/portal/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { fulfilmentLabel } from "@/components/store/ShopMark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { sellerOrders, deliveryTasks, type SellerOrder } from "@/mocks/data";
import { riders } from "@/mocks/admin";
import { inr } from "@/lib/image";

export const Route = createFileRoute("/admin/orders")({
  validateSearch: z.object({
    orderId: z
      .uuid()
      .transform((value) => value.toLowerCase())
      .optional(),
  }),
  component: AdminOrders,
});

function AdminOrders() {
  const [detail, setDetail] = useState<SellerOrder | null>(null);
  const [status, setStatus] = useState("all");
  const rows = sellerOrders.filter((o) => status === "all" || o.status === status);
  return (
    <>
      <UiAttributes>
        <PortalHeader title="Orders & delivery" sub="Sub-orders across all shops." />
      </UiAttributes>
      <DataTable
        rows={rows}
        searchText={(r) => `${r.id} ${r.customer}`}
        toolbar={
          <UiAttributes>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              aria-label="Status filter"
            >
              <option value="all">All statuses</option>
              <option value="placed">
                <UiText>{"New"}</UiText>
              </option>
              <option value="accepted">
                <UiText>{"Accepted"}</UiText>
              </option>
              <option value="preparing">
                <UiText>{"Preparing"}</UiText>
              </option>
              <option value="ready">
                <UiText>{"Ready"}</UiText>
              </option>
            </select>
          </UiAttributes>
        }
        columns={[
          {
            key: "id",
            header: "Sub-order",
            cell: (r) => (
              <button
                className="font-mono text-primary hover:underline"
                onClick={() => setDetail(r)}
              >
                {r.id}
              </button>
            ),
          },
          { key: "c", header: "Customer", cell: (r) => r.customer },
          { key: "f", header: "Fulfilment", cell: (r) => fulfilmentLabel[r.fulfilment] },
          { key: "t", header: "Total", cell: (r) => inr(r.total), className: "tabular-nums" },
          { key: "a", header: "Age", cell: (r) => `${r.placedMinsAgo}m` },
          { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
      <h2 className="mt-12 border-b border-foreground pb-2 font-display text-xl">
        Delivery assignment
      </h2>
      <DataTable
        rows={deliveryTasks}
        columns={[
          {
            key: "id",
            header: "Sub-order",
            cell: (r) => <span className="font-mono">{r.subOrderId}</span>,
          },
          { key: "s", header: "Shop", cell: (r) => r.shopName },
          { key: "d", header: "Distance", cell: (r) => `${r.distanceKm} km` },
          { key: "st", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          {
            key: "a",
            header: "",
            className: "text-right",
            cell: (r) =>
              r.status === "available" ? (
                <UiAttributes>
                  <select
                    defaultValue=""
                    onChange={(e) => toast.success(`Assigned to ${e.target.value} (demo)`)}
                    className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                    aria-label="Assign rider"
                  >
                    <option value="" disabled>
                      Assign rider…
                    </option>
                    {riders
                      .filter((x) => x.status === "approved")
                      .map((x) => (
                        <option key={x.id}>{x.name}</option>
                      ))}
                  </select>
                </UiAttributes>
              ) : r.status === "failed" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toast.info("Opens exception workflow")}
                >
                  <UiText>{"Resolve"}</UiText>
                </Button>
              ) : null,
          },
        ]}
      />
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent>
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono">{detail.id}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 px-4 text-sm">
                <StatusBadge status={detail.status} />
                <p>
                  <span className="label-stamp block text-muted-foreground">Customer</span>
                  {detail.customer}
                </p>
                <ul>
                  {detail.items.map((i) => (
                    <li key={i.name}>
                      {i.qty} × {i.name}
                    </li>
                  ))}
                </ul>
                <p className="font-semibold">{inr(detail.total)}</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => toast.info("Cancellation requires backend")}
                  >
                    Cancel sub-order
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => toast.info("Refund requires payments backend")}
                  >
                    Issue refund
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
