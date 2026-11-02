import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Store, Map, MapPinOff, ChevronRight, RefreshCw } from "lucide-react";
import { management } from "@/services/management";
import type { ManagedArea, ManagedShop } from "@/domain/management";
import { imageUrl } from "@/lib/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, SaveError, useSave, text } from "./management-shared";
import { AreaReadiness } from "./AreaReadiness";
import { AuditExplorer } from "./AdminWorkspace";
import "@/styles/admin-settings.css";

function pinned(shop: ManagedShop) {
  const point = shop.location?.coordinates;
  return (
    point?.length === 2 &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1]) &&
    Math.abs(point[0]) <= 180 &&
    Math.abs(point[1]) <= 90
  );
}
export function AdminSettings() {
  const areas = useQuery({
    queryKey: ["admin-areas"],
    queryFn: management.adminAreas,
    retry: false,
  });
  const shops = useQuery({ queryKey: ["admin-shops"], queryFn: management.shops, retry: false });
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [editing, setEditing] = useState<string | null>(null),
    [reset, setReset] = useState(0);
  const area = areas.data?.find((a) => a.id === editing);
  const all = areas.data ?? [],
    rows = all.filter(
      (a) =>
        (status === "all" || a.active === (status === "active")) &&
        [a.name, a.city, ...a.pincodes].some((v) =>
          v.toLowerCase().includes(search.trim().toLowerCase()),
        ),
    );
  const approved = shops.data?.filter((s) => s.active && s.status === "approved") ?? [];
  const cards = [
    {
      title: "Total service areas",
      icon: MapPin,
      value: all.length,
      ready: areas.isSuccess,
      note: "Configured on platform",
    },
    {
      title: "Active areas",
      icon: Store,
      value: all.filter((a) => a.active).length,
      ready: areas.isSuccess,
      note: "Active definitions; coverage varies",
    },
    {
      title: "Shops with active areas",
      icon: Map,
      value: approved.filter((s) =>
        s.serviceAreaIds.some((id) => all.some((a) => a.id === id && a.active)),
      ).length,
      ready: areas.isSuccess && shops.isSuccess,
      note: "Active approved shops, counted once",
    },
    {
      title: "Missing map pins",
      icon: MapPinOff,
      value: approved.filter((s) => !pinned(s)).length,
      ready: shops.isSuccess,
      note: "Active approved shops only",
    },
  ];
  return (
    <div className="admin-settings">
      <header className="settings-hero">
        <div>
          <UiAttributes>
            <nav aria-label="Breadcrumb">
              <UiText>{"OPERATIONS "}</UiText>
              <ChevronRight size={13} />
              <b>SERVICE AREAS &amp; AUDIT</b>
            </nav>
          </UiAttributes>
          <h1>Service areas &amp; audit</h1>
          <p>
            Manage active service areas for delivery and review platform activity. Keep the
            marketplace accurate, transparent and well monitored.
          </p>
        </div>
        <div className="settings-hero-art">
          <img src={imageUrl("/admin-settings-hero-v1.webp")} alt="" />
          <aside>
            <MapPin />
            <h2>
              Enable local delivery.
              <br />
              Stronger neighbourhoods.
            </h2>
            <p>Define service areas accurately so customers can find nearby shops.</p>
          </aside>
        </div>
      </header>
      <UiAttributes>
        <section className="settings-metrics" aria-label="Service area statistics">
          {cards.map(({ title, icon: Icon, value, ready, note }) => (
            <article key={title}>
              <Icon aria-hidden="true" />
              <div>
                <p>
                  <UiText>{title}</UiText>
                </p>
                {(areas.isPending || shops.isPending) && !ready ? (
                  <Skeleton className="my-2 h-8 w-12" />
                ) : (
                  <strong>
                    <UiText>{ready ? value : "N/A"}</UiText>
                  </strong>
                )}
                <small>
                  <UiText>{ready ? note : "Data unavailable"}</UiText>
                </small>
              </div>
            </article>
          ))}
        </section>
      </UiAttributes>
      <UiAttributes>
        <section className="settings-panel" aria-label="Service areas management">
          <header className="settings-panel-heading">
            <div>
              <h2>
                <MapPin />
                <UiText>{"Service areas"}</UiText>
              </h2>
              <p>
                Add an active area, then assign approved shops with saved GPS pins. Buyers using GPS
                see eligible shops within 6 km; the nearest shop’s area is selected automatically.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={areas.isFetching || shops.isFetching}
              onClick={() => {
                void areas.refetch();
                void shops.refetch();
              }}
            >
              <RefreshCw size={16} />
              <UiText>{"Refresh areas"}</UiText>
            </Button>
          </header>
          <div className="settings-columns">
            <AreaEditor
              key={`${area?.id ?? "new"}:${area?.version ?? 0}:${reset}`}
              area={area}
              onClear={() => {
                setEditing(null);
                setReset((n) => n + 1);
              }}
              onCreated={() => {
                setEditing(null);
                setReset((n) => n + 1);
              }}
            />
            <div className="settings-area-list">
              <h3>Service areas list</h3>
              <div className="settings-list-filters">
                <label>
                  Search service areas
                  <UiAttributes>
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search area, city or pincode…"
                    />
                  </UiAttributes>
                </label>
                <label>
                  Area status
                  <UiAttributes>
                    <select
                      aria-label="Area status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="all">All areas</option>
                      <option value="active">
                        <UiText>{"Active"}</UiText>
                      </option>
                      <option value="inactive">
                        <UiText>{"Inactive"}</UiText>
                      </option>
                    </select>
                  </UiAttributes>
                </label>
              </div>
              {areas.isPending ? (
                <UiAttributes>
                  <div role="status" aria-label="Loading service areas">
                    <Skeleton className="h-24 w-full" />
                  </div>
                </UiAttributes>
              ) : areas.isError ? (
                <div role="alert">
                  Could not load areas. {areas.error.message}
                  <Button variant="outline" onClick={() => void areas.refetch()}>
                    Retry areas
                  </Button>
                </div>
              ) : (
                <>
                  <p className="settings-result-count">{rows.length} matching areas</p>
                  <div className="settings-table">
                    <table>
                      <thead>
                        <tr>
                          {[
                            "Area / locality",
                            "City / town",
                            "Pincodes",
                            "Status",
                            "Assigned shops",
                            "Actions",
                          ].map((h) => (
                            <th key={h} scope="col">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((a) => (
                          <tr key={a.id}>
                            <td data-label="Area / locality">
                              <b>{a.name}</b>
                            </td>
                            <td data-label="City / town">{a.city}</td>
                            <td data-label="Pincodes">{a.pincodes.join(", ")}</td>
                            <td data-label="Status">
                              <span className={`settings-badge ${a.active ? "" : "inactive"}`}>
                                <UiText>{a.active ? "Active" : "Inactive"}</UiText>
                              </span>
                            </td>
                            <td data-label="Assigned shops">
                              {shops.isSuccess
                                ? shops.data.filter((s) => s.serviceAreaIds.includes(a.id)).length
                                : "Unavailable"}
                            </td>
                            <td data-label="Actions">
                              <Button
                                variant="outline"
                                disabled={areas.isFetching}
                                onClick={() => setEditing(a.id)}
                              >
                                <UiText>{"Edit "}</UiText>
                                {a.name}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!rows.length && (
                    <div className="settings-empty">
                      <MapPin />
                      <h3>No matching service areas</h3>
                      <p>Change your filters or add an area using the form.</p>
                    </div>
                  )}
                </>
              )}
              {shops.isError && (
                <div role="alert">
                  Shop readiness unavailable. Area editing remains available.
                  <Button variant="outline" onClick={() => void shops.refetch()}>
                    Retry shop readiness
                  </Button>
                </div>
              )}
              {shops.isSuccess &&
                rows.map((a) => (
                  <details key={a.id} className="settings-readiness">
                    <summary>GPS readiness: {a.name}</summary>
                    <AreaReadiness area={a} shops={shops.data} />
                  </details>
                ))}
            </div>
          </div>
        </section>
      </UiAttributes>
      <AuditExplorer />
    </div>
  );
}
function AreaEditor({
  area,
  onClear,
  onCreated,
}: {
  area?: ManagedArea;
  onClear: () => void;
  onCreated: () => void;
}) {
  const save = useSave(),
    lock = useRef(false);
  return (
    <div className="settings-area-editor">
      <h3>
        <UiText>{area ? `Edit ${area.name}` : "Add service area"}</UiText>
      </h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (lock.current) return;
          lock.current = true;
          const data = new FormData(e.currentTarget);
          save.mutate(
            () =>
              management.area(
                {
                  name: text(data, "name"),
                  city: text(data, "city"),
                  pincodes: text(data, "pincodes")
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                  ...(area ? { active: data.has("active") } : {}),
                },
                area,
              ),
            {
              onSuccess: () => {
                if (!area) onCreated();
              },
              onSettled: () => {
                lock.current = false;
              },
            },
          );
        }}
      >
        <fieldset disabled={save.isPending} className="space-y-4">
          <UiAttributes>
            <Field label="Area / locality name" name="name" value={area?.name} required />
          </UiAttributes>
          <UiAttributes>
            <Field label="City / town" name="city" value={area?.city} required />
          </UiAttributes>
          <label className="block text-sm">
            <UiText>{"Pincodes (comma separated)"}</UiText>
            <UiAttributes>
              <Input
                name="pincodes"
                defaultValue={area?.pincodes.join(", ")}
                required
                pattern="\s*[0-9]{6}\s*(,\s*[0-9]{6}\s*)*"
                title="Enter six-digit pincodes separated by commas"
              />
            </UiAttributes>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              name="active"
              type="checkbox"
              defaultChecked={area?.active ?? true}
              disabled={!area}
            />
            <UiText>{"Active area"}</UiText>
          </label>
          {!area && (
            <p className="text-xs text-muted-foreground">
              New areas are created active. Edit an existing area to change its status.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            An area name or pincode alone does not locate shops. Each seller needs an approved shop
            assigned to this area and an accurate map pin. Referenced areas cannot be deactivated
            until their assignments are resolved.
          </p>
          <SaveError error={save.error} />
          <div className="flex gap-3">
            <Button type="submit">
              <UiText>{save.isPending ? "Saving…" : "Save area"}</UiText>
            </Button>
            <Button type="button" variant="outline" onClick={onClear}>
              Clear area form
            </Button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
