import { useQuery } from "@tanstack/react-query";
import { management } from "@/services/management";
import { Panel } from "./management-shared";
import { ErrorState } from "@/components/common/states";
export function SellerDirectory() {
  const sellers = useQuery({ queryKey: ["admin-sellers"], queryFn: management.sellers });
  return (
    <Panel>
      <h2 className="font-display text-2xl">Registered sellers</h2>
      <p className="text-sm text-muted-foreground">
        Sellers register their own accounts and shops from signup. Review their pending shop
        applications below.
      </p>
      {sellers.isPending ? (
        <p role="status">Loading sellers…</p>
      ) : sellers.error ? (
        <ErrorState message={sellers.error.message} onRetry={() => void sellers.refetch()} />
      ) : sellers.data.length ? (
        <ul className="divide-y divide-border">
          {sellers.data.map((seller) => (
            <li key={seller.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
              <span>
                <strong>{seller.name}</strong> · {seller.phone}
              </span>
              <span>{seller.active ? "Active account" : "Inactive account"}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No sellers have registered yet.</p>
      )}
    </Panel>
  );
}
