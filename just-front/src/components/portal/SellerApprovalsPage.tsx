import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Store,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ChevronRight,
  ArrowRight,
  FileCheck2,
} from "lucide-react";
import { management } from "@/services/management";
import type { ManagedShop, ShopStatus } from "@/domain/management";
import { imageUrl } from "@/lib/image";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { NeighbourhoodIllustration } from "./NeighbourhoodIllustration";
import { AdminShopReview } from "./AdminShopReview";
import { SellerDirectory } from "./SellerDirectory";
import { DeliveryPartners } from "./DeliveryPartners";
import "@/styles/seller-approvals.css";
export function SellerApprovalsPage() {
  const shops = useQuery({ queryKey: ["admin-shops"], queryFn: management.shops, retry: false }),
    sellers = useQuery({ queryKey: ["admin-sellers"], queryFn: management.sellers, retry: false }),
    categories = useQuery({
      queryKey: ["admin-categories"],
      queryFn: management.adminCategories,
      retry: false,
    }),
    areas = useQuery({ queryKey: ["admin-areas"], queryFn: management.adminAreas, retry: false });
  const [status, setStatus] = useState<ShopStatus | "all">("all"),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [area, setArea] = useState(""),
    [sort, setSort] = useState("az"),
    [selected, setSelected] = useState<ManagedShop | null>(null),
    [initialDecision, setInitialDecision] = useState<ShopStatus>(),
    [accountsOpen, setAccountsOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null),
    searchInput = useRef<HTMLInputElement>(null);
  const ownerById = useMemo(
    () => new Map((sellers.data ?? []).map((s) => [s.id, s])),
    [sellers.data],
  );
  const counts = useMemo(
    () => ({
      all: shops.data?.length,
      pending: shops.data?.filter((s) => s.status === "pending").length,
      approved: shops.data?.filter((s) => s.status === "approved").length,
      rejected: shops.data?.filter((s) => s.status === "rejected").length,
      suspended: shops.data?.filter((s) => s.status === "suspended").length,
    }),
    [shops.data],
  );
  const filtered = (shops.data ?? [])
    .filter(
      (s) =>
        (status === "all" || s.status === status) &&
        (!category || s.categoryIds.includes(category)) &&
        (!area || s.serviceAreaIds.includes(area)) &&
        `${s.name} ${s.address ?? ""} ${s.locality} ${s.ownerId ? (ownerById.get(s.ownerId)?.name ?? "") : ""}`
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        (sort === "za" ? -1 : 1) *
        (a.name.localeCompare(b.name, "en-IN", { numeric: true, sensitivity: "base" }) ||
          a.id.localeCompare(b.id)),
    );
  const busy = shops.isFetching || sellers.isFetching || categories.isFetching || areas.isFetching;
  const refresh = () =>
    void Promise.allSettled([
      shops.refetch(),
      sellers.refetch(),
      categories.refetch(),
      areas.refetch(),
    ]);
  function view(shop: ManagedShop, decision?: ShopStatus) {
    opener.current = document.activeElement as HTMLElement;
    setSelected(shop);
    setInitialDecision(decision);
  }
  const time = shops.dataUpdatedAt
    ? new Date(shops.dataUpdatedAt).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;
  const stats = [
    {
      label: "Total sellers",
      count: sellers.data?.length,
      pending: sellers.isPending,
      tone: "green",
      icon: Users,
      hint: "Registered seller accounts",
      action: () => {
        setAccountsOpen(true);
        requestAnimationFrame(() =>
          document.getElementById("registered-sellers")?.scrollIntoView({ block: "start" }),
        );
      },
    },
    {
      label: "Pending approvals",
      count: counts.pending,
      pending: shops.isPending,
      tone: "yellow",
      icon: Store,
      hint: "New shop applications",
      action: () => setStatus("pending"),
    },
    {
      label: "Approved shops",
      count: counts.approved,
      pending: shops.isPending,
      tone: "blue",
      icon: CheckCircle2,
      hint: "Admin-approved status",
      action: () => setStatus("approved"),
    },
    {
      label: "Rejected applications",
      count: counts.rejected,
      pending: shops.isPending,
      tone: "red",
      icon: XCircle,
      hint: "Applications needing changes",
      action: () => setStatus("rejected"),
    },
  ];
  function actions(shop: ManagedShop) {
    return (
      <div className="seller-row-actions">
        <Button variant="outline" size="sm" onClick={() => view(shop)}>
          <UiText>{"View details"}</UiText>
        </Button>
        {shop.status === "pending" && (
          <>
            <Button variant="ghost" size="sm" onClick={() => view(shop, "rejected")}>
              Reject
            </Button>
            <Button size="sm" onClick={() => view(shop, "approved")}>
              Approve
            </Button>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="seller-approvals-page">
      <section className="seller-approvals-hero">
        <div>
          <UiAttributes>
            <nav aria-label="Breadcrumb">
              <Link to="/admin">
                <UiText>{"Operations"}</UiText>
              </Link>
              <ChevronRight size={13} aria-hidden="true" />
              <span>
                <UiText>{"Sellers & approvals"}</UiText>
              </span>
            </nav>
          </UiAttributes>
          <h1>
            <UiText>{"Sellers and shop approvals"}</UiText>
          </h1>
          <p>Review new shop applications, check seller details and approve local businesses.</p>
        </div>
        <div className="seller-hero-art">
          <img
            src={imageUrl("/admin-seller-hero-v1.webp", { width: 900 })}
            alt=""
            width={900}
            height={600}
          />
          <span className="seller-local-stamp">
            Support
            <br />
            local sellers
          </span>
          <div>
            <Store size={30} aria-hidden="true" />
            <h2>
              Real shops.
              <br />
              Real people.
            </h2>
            <p>Help local businesses join the Just Pack It marketplace.</p>
          </div>
        </div>
      </section>
      <UiAttributes>
        <section className="seller-stats" aria-label="Seller statistics">
          {stats.map(({ label, count, pending, tone, icon: Icon, hint, action }) => (
            <button
              type="button"
              key={label}
              className={`seller-stat seller-tone-${tone}`}
              onClick={action}
            >
              <span>
                <Icon size={25} aria-hidden="true" />
              </span>
              <div>
                <h2>
                  <UiText>{label}</UiText>
                </h2>
                {pending ? (
                  <Skeleton className="mt-2 h-8 w-12" />
                ) : (
                  <strong>{count ?? "N/A"}</strong>
                )}
                <p>
                  <UiText>{count === undefined && !pending ? "Unavailable" : hint}</UiText>
                </p>
              </div>
              {label === "Pending approvals" && <ArrowRight size={17} aria-hidden="true" />}
            </button>
          ))}
        </section>
      </UiAttributes>
      <div className="seller-snapshot-line">
        <p>
          <UiText>
            {time ? `Applications refreshed ${time} · IST` : "Waiting for application data"}
          </UiText>
        </p>
        <Button variant="outline" disabled={busy} onClick={refresh}>
          <RefreshCw size={15} className={busy ? "animate-spin" : ""} />
          <UiText>{"Refresh data"}</UiText>
        </Button>
      </div>
      {sellers.isError && (
        <div role="alert" className="seller-partial-error">
          Seller accounts could not be refreshed. Loaded owner details and totals may be from an
          earlier successful snapshot.
          <Button variant="outline" onClick={() => void sellers.refetch()}>
            Retry seller accounts
          </Button>
        </div>
      )}
      {(categories.isError || areas.isError) && (
        <div role="alert" className="seller-partial-error">
          Some category or area details are unavailable.
          <Button
            variant="outline"
            onClick={() => {
              void categories.refetch();
              void areas.refetch();
            }}
          >
            Retry filter details
          </Button>
        </div>
      )}
      <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
        <div className="seller-controls">
          <UiAttributes>
            <TabsList aria-label="Application status">
              {(["all", "pending", "approved", "rejected", "suspended"] as const).map((s) => (
                <TabsTrigger key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)} ({counts[s] ?? "N/A"})
                </TabsTrigger>
              ))}
            </TabsList>
          </UiAttributes>
          <label className="seller-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search applications</span>
            <UiAttributes>
              <input
                ref={searchInput}
                type="search"
                placeholder="Search shop, owner or address…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </UiAttributes>
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <SlidersHorizontal size={16} />
                Filters<UiText>{category || area ? " · applied" : ""}</UiText>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="seller-filter-popover w-72 max-w-[calc(100vw-1rem)]">
              <label>
                <UiText>{"Shop category"}</UiText>
                <select
                  value={category}
                  disabled={!categories.data}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">
                    <UiText>{"All categories"}</UiText>
                  </option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      <UiText>{c.active === false ? " (inactive)" : ""}</UiText>
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <UiText>{"Service area"}</UiText>
                <select
                  value={area}
                  disabled={!areas.data}
                  onChange={(e) => setArea(e.target.value)}
                >
                  <option value="">All areas</option>
                  {areas.data?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="ghost"
                onClick={() => {
                  setCategory("");
                  setArea("");
                }}
              >
                Clear extra filters
              </Button>
            </PopoverContent>
          </Popover>
          <label className="seller-sort">
            <UiText>{"Sort by"}</UiText>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="az">Shop name A to Z</option>
              <option value="za">Shop name Z to A</option>
            </select>
          </label>
        </div>
        <TabsContent value={status}>
          {shops.isError ? (
            <div role="alert" className="seller-load-error">
              <p>
                Shop submissions could not be refreshed.
                <UiText>
                  {shops.data ? " The last loaded list is kept; reload before reviewing." : ""}
                </UiText>
              </p>
              <Button variant="outline" onClick={() => void shops.refetch()}>
                Retry applications
              </Button>
            </div>
          ) : null}
          {shops.isPending ? (
            <div role="status" className="seller-list-skeleton">
              <span className="sr-only">Loading shop applications…</span>
              {[1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-20 w-full" />
              ))}
            </div>
          ) : !shops.data ? null : !filtered.length ? (
            <section className="seller-applications-empty">
              <div className="seller-empty-illustration">
                <NeighbourhoodIllustration />
                <FileCheck2 size={48} aria-hidden="true" />
              </div>
              <h2>
                <UiText>
                  {shops.data.length ? "No matching applications" : "No shop submissions yet"}
                </UiText>
              </h2>
              <p>
                <UiText>
                  {shops.data.length
                    ? "Try another status, search or filter to find the application."
                    : "Sellers can register their shop from the signup page. Their applications will appear here for review."}
                </UiText>
              </p>
              {shops.data.length ? (
                <Button
                  onClick={() => {
                    setStatus("all");
                    setSearch("");
                    setCategory("");
                    setArea("");
                  }}
                >
                  Clear all filters
                </Button>
              ) : (
                <Button disabled={busy} onClick={refresh}>
                  <RefreshCw size={16} />
                  <UiText>{"Refresh data"}</UiText>
                </Button>
              )}
              {time && (
                <small>
                  Last refreshed: {time}
                  <UiText>{"· IST"}</UiText>
                </small>
              )}
            </section>
          ) : (
            <>
              <p className="seller-results-count" role="status">
                {filtered.length} matching · {shops.data.length} total shop submissions. Status
                counts cover the complete loaded list.
              </p>
              <div className="seller-table-wrap">
                <table className="seller-application-table">
                  <caption className="sr-only">Shop applications</caption>
                  <thead>
                    <tr>
                      {[
                        "Shop",
                        "Owner",
                        "Category",
                        "Location",
                        "Submitted",
                        "Status",
                        "Action",
                      ].map((t) => (
                        <th key={t} scope="col">
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((shop) => (
                      <tr key={shop.id}>
                        <td>
                          <div className="seller-shop-identity">
                            {shop.coverImage ? (
                              <img
                                src={imageUrl(shop.coverImage, { width: 120 })}
                                alt=""
                                loading="lazy"
                              />
                            ) : (
                              <span aria-hidden="true">
                                <Store size={23} />
                              </span>
                            )}
                            <div>
                              <strong>{shop.name}</strong>
                              <small>
                                <UiText>
                                  {shop.active ? "Active profile" : "Inactive profile"}
                                </UiText>
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <UiText>
                            {shop.ownerId
                              ? (ownerById.get(shop.ownerId)?.name ?? "Owner unavailable")
                              : "Owner unavailable"}
                          </UiText>
                        </td>
                        <td>
                          {shop.categoryIds
                            .map(
                              (id) =>
                                categories.data?.find((c) => c.id === id)?.name ??
                                "Unavailable category",
                            )
                            .join(", ")}
                        </td>
                        <td>
                          {shop.address || shop.locality || "Not supplied"}
                          <small>
                            {shop.serviceAreaIds
                              .map(
                                (id) =>
                                  areas.data?.find((a) => a.id === id)?.name ?? "Unavailable area",
                              )
                              .join(", ")}
                          </small>
                        </td>
                        <td>
                          <span className="seller-unavailable">Not provided</span>
                        </td>
                        <td>
                          <span className={`seller-status seller-status-${shop.status}`}>
                            <UiText>{shop.status}</UiText>
                          </span>
                        </td>
                        <td>{actions(shop)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="seller-application-cards">
                {filtered.map((shop) => (
                  <li key={shop.id}>
                    <div className="seller-mobile-card-heading">
                      <Store size={22} aria-hidden="true" />
                      <h2>{shop.name}</h2>
                      <span className={`seller-status seller-status-${shop.status}`}>
                        <UiText>{shop.status}</UiText>
                      </span>
                    </div>
                    <p>
                      <UiText>
                        {shop.ownerId
                          ? (ownerById.get(shop.ownerId)?.name ?? "Owner unavailable")
                          : "Owner unavailable"}
                      </UiText>
                    </p>
                    <p>{shop.address || shop.locality}</p>
                    <p>
                      {shop.categoryIds
                        .map(
                          (id) =>
                            categories.data?.find((c) => c.id === id)?.name ??
                            "Unavailable category",
                        )
                        .join(", ")}
                    </p>
                    {actions(shop)}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="seller-data-note">
            Submission dates are not provided by this API, so date sorting is unavailable. Approved
            status alone does not mean a shop is active, open or serviceable.
          </p>
        </TabsContent>
      </Tabs>
      <details
        id="registered-sellers"
        open={accountsOpen}
        onToggle={(e) => setAccountsOpen(e.currentTarget.open)}
        className="seller-secondary-tools"
      >
        <summary>Registered seller accounts</summary>
        <SellerDirectory />
      </details>
      <details className="seller-secondary-tools">
        <summary>Delivery partner operations</summary>
        <DeliveryPartners />
      </details>
      {selected && (
        <AdminShopReview
          key={`${selected.id}:${selected.version}`}
          shop={selected}
          owner={selected.ownerId ? ownerById.get(selected.ownerId) : undefined}
          categories={categories.data ?? []}
          areas={areas.data ?? []}
          initialDecision={initialDecision}
          latest={shops.data?.find((s) => s.id === selected.id)}
          reviewUnavailable={
            shops.isError ||
            shops.isFetching ||
            categories.isError ||
            areas.isError ||
            categories.isPending ||
            areas.isPending
          }
          onReload={() => {
            const fresh = shops.data?.find((s) => s.id === selected.id);
            if (fresh) setSelected(fresh);
          }}
          onClose={() => setSelected(null)}
          restoreFocus={() => {
            if (opener.current?.isConnected) opener.current.focus();
            else searchInput.current?.focus();
          }}
        />
      )}
    </div>
  );
}
