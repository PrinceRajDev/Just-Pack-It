import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { FinancialTable, FinanceEmpty } from "./FinancePresentation";
import { Scale } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { inr } from "@/lib/image";
import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { adminWorkspace } from "@/services/admin-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function Paging({
  more,
  busy,
  error,
  onMore,
  onRefresh,
}: {
  more: boolean;
  busy: boolean;
  error: boolean;
  onMore: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 py-3">
      {error && (
        <p role="alert">Could not refresh this view. Previously loaded records may be outdated.</p>
      )}
      <Button variant="outline" disabled={busy} onClick={onRefresh}>
        <UiText>{"Refresh records"}</UiText>
      </Button>
      {more && (
        <Button disabled={busy} onClick={onMore}>
          Load more records
        </Button>
      )}
    </div>
  );
}
export { ProductModeration } from "./CatalogueModeration";
export { AuditExplorer } from "./SettingsAudit";
export function Reconciliation() {
  const [draft, setDraft] = useState(""),
    [shop, setShop] = useState("");
  const query = useInfiniteQuery({
    queryKey: ["admin-reconciliation", shop],
    queryFn: ({ pageParam }) => adminWorkspace.reconciliation(shop || undefined, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.next,
    retry: false,
  });
  return (
    <section className="finance-panel space-y-4">
      <h2 className="finance-panel-title">
        <Scale aria-hidden="true" />
        Settlement reconciliation
      </h2>
      <p>
        Read-only order allocations. Cash acknowledgements and captured payments do not prove bank
        settlement, seller payout or cash remittance. Test orders excluded. No transfers are
        available.
      </p>
      <form
        className="finance-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft || uuid.test(draft)) setShop(draft.toLowerCase());
        }}
      >
        <label>
          Shop ID (optional)
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value.trim())}
            aria-invalid={!!draft && !uuid.test(draft)}
          />
        </label>
        <Button variant="outline" disabled={!!draft && !uuid.test(draft)}>
          Filter reconciliation
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraft("");
            setShop("");
          }}
        >
          Clear reconciliation filters
        </Button>
      </form>
      {query.isPending ? (
        <UiAttributes>
          <div role="status" aria-label="Loading payment and cash allocations">
            <Skeleton className="h-20 w-full" />
          </div>
        </UiAttributes>
      ) : (
        <>
          <FinancialTable
            rows={query.data?.pages.flatMap((p) => p.items) ?? []}
            rowKey={(row) => row.id}
            columns={[
              {
                title: "Shop / order",
                cell: (row) => (
                  <>
                    <b>{row.shopName}</b>
                    <small>{row.orderId}</small>
                    <small>Part {row.id}</small>
                  </>
                ),
              },
              {
                title: "Method / status",
                cell: (row) => (
                  <>
                    {row.method.toUpperCase()}
                    <small>
                      <UiText>{row.status}</UiText>
                    </small>
                  </>
                ),
              },
              {
                title: "Original / cancelled",
                cell: (row) => (
                  <>
                    {inr(row.originalAmount)}
                    <small>
                      <UiText>{"Cancelled "}</UiText>
                      {inr(row.cancelledAmount)}
                    </small>
                  </>
                ),
              },
              { title: "Captured allocation", cell: (row) => inr(row.onlineCapturedAllocation) },
              {
                title: "Cash recorded",
                cell: (row) => (
                  <>
                    {inr(row.cashRecorded)}
                    <small>
                      {row.cashCollector?.replaceAll("_", " ") ?? "No collector recorded"}
                    </small>
                  </>
                ),
              },
              {
                title: "Refund",
                cell: (row) =>
                  row.refund ? (
                    <>
                      {inr(row.refund.amount)}
                      <small>{row.refund.state}</small>
                    </>
                  ) : (
                    "No refund record"
                  ),
              },
            ]}
          />
          {query.isSuccess && !query.data.pages.some((p) => p.items.length) && (
            <UiAttributes>
              <FinanceEmpty kind="ledger" title="No matching reconciliation records">
                Try another shop ID or refresh. These allocations do not establish seller payout or
                bank settlement.
              </FinanceEmpty>
            </UiAttributes>
          )}
        </>
      )}
      <p className="text-sm text-muted-foreground">
        Bank settlement is not verified here. See the settlement ledger for cash receipts and manual
        payout records. No relevant event date or confirmed payout field is provided by this
        reconciliation API.
      </p>
      <Paging
        more={!!query.hasNextPage}
        busy={query.isFetching}
        error={query.isError}
        onMore={() => void query.fetchNextPage()}
        onRefresh={() => void query.refetch()}
      />
    </section>
  );
}
