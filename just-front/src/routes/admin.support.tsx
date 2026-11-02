import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { isDemoMode } from "@/lib/config";
import { LiveSupport } from "@/components/portal/LiveSupport";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PortalHeader } from "@/components/portal/PortalShell";
import { DataTable } from "@/components/portal/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { disputes as seed } from "@/mocks/admin";

export const Route = createFileRoute("/admin/support")({ component: Support });

function Support() {
  const [rows, setRows] = useState(seed);
  if (!isDemoMode) return <LiveSupport />;
  return (
    <>
      <UiAttributes>
        <PortalHeader title="Support & disputes" />
      </UiAttributes>
      <DataTable
        rows={rows}
        searchText={(r) => `${r.order} ${r.raisedBy} ${r.type}`}
        columns={[
          { key: "o", header: "Order", cell: (r) => <span className="font-mono">{r.order}</span> },
          { key: "t", header: "Issue", cell: (r) => r.type },
          { key: "b", header: "Raised by", cell: (r) => r.raisedBy },
          { key: "a", header: "Age", cell: (r) => r.age },
          { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          {
            key: "x",
            header: "",
            className: "text-right",
            cell: (r) =>
              r.status === "open" && (
                <Button
                  size="sm"
                  onClick={() => {
                    setRows((x) =>
                      x.map((y) => (y.id === r.id ? { ...y, status: "resolved" } : y)),
                    );
                    toast.success("Marked resolved (demo)");
                  }}
                >
                  <UiText>{"Resolve"}</UiText>
                </Button>
              ),
          },
        ]}
      />
    </>
  );
}
