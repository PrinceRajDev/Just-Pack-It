import { UiAttributes } from "@/lib/i18n/Language";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PortalHeader } from "@/components/portal/PortalShell";
import { DataTable } from "@/components/portal/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sellerApplications, riders } from "@/mocks/admin";

export const Route = createFileRoute("/admin/partners")({ component: Partners });

function Partners() {
  const [apps, setApps] = useState(sellerApplications);
  const [rs, setRs] = useState(riders);
  const decide = (id: string, status: string) => {
    setApps((a) => a.map((x) => (x.id === id ? { ...x, status } : x)));
    toast.success(`Application ${status} (demo)`);
  };
  return (
    <>
      <UiAttributes>
        <PortalHeader title="Sellers & riders" />
      </UiAttributes>
      <Tabs defaultValue="sellers">
        <TabsList>
          <TabsTrigger value="sellers">Seller approvals</TabsTrigger>
          <TabsTrigger value="riders">Delivery partners</TabsTrigger>
          <TabsTrigger value="buyers">Buyers</TabsTrigger>
        </TabsList>
        <TabsContent value="sellers" className="pt-4">
          <DataTable
            rows={apps}
            searchText={(r) => `${r.shop} ${r.owner}`}
            columns={[
              {
                key: "s",
                header: "Shop",
                cell: (r) => (
                  <span>
                    <b className="font-medium">{r.shop}</b>
                    <span className="block text-xs text-muted-foreground">
                      {r.owner} · {r.locality}
                    </span>
                  </span>
                ),
              },
              { key: "c", header: "Category", cell: (r) => r.category },
              {
                key: "d",
                header: "Documents",
                cell: (r) => (
                  <span className={r.docs.includes("missing") ? "text-promo" : ""}>{r.docs}</span>
                ),
              },
              { key: "t", header: "Submitted", cell: (r) => r.submitted },
              { key: "st", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
              {
                key: "a",
                header: "",
                className: "text-right",
                cell: (r) =>
                  r.status === "pending" && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => decide(r.id, "rejected")}>
                        Reject
                      </Button>
                      <Button size="sm" onClick={() => decide(r.id, "approved")}>
                        Approve
                      </Button>
                    </div>
                  ),
              },
            ]}
          />
        </TabsContent>
        <TabsContent value="riders" className="pt-4">
          <DataTable
            rows={rs}
            searchText={(r) => r.name}
            columns={[
              { key: "n", header: "Name", cell: (r) => r.name },
              { key: "z", header: "Zone", cell: (r) => r.zone },
              { key: "v", header: "Vehicle", cell: (r) => r.vehicle },
              { key: "s", header: "Verification", cell: (r) => <StatusBadge status={r.status} /> },
              {
                key: "a",
                header: "",
                className: "text-right",
                cell: (r) =>
                  r.status === "pending" && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setRs((x) =>
                          x.map((y) => (y.id === r.id ? { ...y, status: "approved" } : y)),
                        );
                        toast.success("Rider verified (demo)");
                      }}
                    >
                      Verify
                    </Button>
                  ),
              },
            ]}
          />
        </TabsContent>
        <TabsContent value="buyers" className="pt-4">
          <p className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Buyer accounts load from the users API. Personal data is never mocked here.
          </p>
        </TabsContent>
      </Tabs>
    </>
  );
}
