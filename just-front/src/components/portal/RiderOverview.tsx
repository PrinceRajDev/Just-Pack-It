import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MapPin, PackageCheck, Route, Wallet, RefreshCw, ArrowRight } from "lucide-react";
import { management } from "@/services/management";
import { UiText } from "@/lib/i18n/Language";
import type { PartnerProfile, LiveDeliveryTask } from "@/domain/live-delivery";
import { inr } from "@/lib/image";

export function RiderOverview({
  profile,
  task,
  taskKnown,
  loadedTasks,
  hasMore,
  updatedAt,
  refreshing,
}: {
  profile: PartnerProfile;
  task: LiveDeliveryTask | null | undefined;
  taskKnown: boolean;
  loadedTasks: number | undefined;
  hasMore: boolean;
  updatedAt: number;
  refreshing: boolean;
}) {
  const areas = useQuery({ queryKey: ["areas"], queryFn: management.areas, retry: false });
  const assigned = areas.data?.filter((area) => profile.areaIds.includes(area.id));
  return (
    <section className="rider-overview" aria-label="Delivery overview">
      <div className="rider-metrics">
        <article>
          <span>
            <MapPin aria-hidden="true" />
          </span>
          <div>
            <p>
              <UiText>Assigned areas</UiText>
            </p>
            <strong>{profile.areaIds.length}</strong>
            <small>
              <UiText>Approved delivery coverage</UiText>
            </small>
          </div>
        </article>
        <article>
          <span>
            <PackageCheck aria-hidden="true" />
          </span>
          <div>
            <p>
              <UiText>Ready tasks loaded</UiText>
            </p>
            <strong>
              {loadedTasks === undefined ? "Checking" : `${loadedTasks}${hasMore ? "+" : ""}`}
            </strong>
            <small>
              <UiText>
                {profile.online ? "Ready orders you can review" : "Go online to check tasks"}
              </UiText>
            </small>
          </div>
        </article>
        <article>
          <span>
            <Route aria-hidden="true" />
          </span>
          <div>
            <p>
              <UiText>Current delivery</UiText>
            </p>
            <strong>
              <UiText>{!taskKnown ? "Checking" : task ? "In progress" : "No active task"}</UiText>
            </strong>
            <small>{task?.shopName ?? <UiText>One delivery at a time</UiText>}</small>
          </div>
        </article>
      </div>
      <div className="rider-operation-grid">
        <article className="rider-coverage-card">
          <h2>
            <MapPin size={20} aria-hidden="true" />
            <UiText>Your delivery areas</UiText>
          </h2>
          <p>
            <UiText>
              Ready orders appear here when a shop in your assigned area requests a rider.
            </UiText>
          </p>
          <div className="rider-area-chips">
            {!profile.areaIds.length ? (
              <span>
                <UiText>No areas assigned. Ask your admin to assign coverage.</UiText>
              </span>
            ) : areas.isPending ? (
              <span role="status">
                <UiText>Loading service areas…</UiText>
              </span>
            ) : areas.isError ? (
              <span>
                <UiText>Area names could not be loaded. Your assignments are unchanged.</UiText>
              </span>
            ) : assigned?.length ? (
              assigned.map((area) => <span key={area.id}>{area.name}</span>)
            ) : (
              <span>
                <UiText>Assigned areas are not currently listed as active.</UiText>
              </span>
            )}
          </div>
        </article>
        <article className="rider-cash-shortcut">
          <h2>
            <Wallet size={20} aria-hidden="true" />
            <UiText>Cash & handover</UiText>
          </h2>
          <p>
            {task ? (
              <>
                <UiText>Collect on this task:</UiText> <strong>{inr(task.amountToCollect)}</strong>
              </>
            ) : (
              <UiText>Review collected cash and recorded handovers in your ledger.</UiText>
            )}
          </p>
          <Link to="/delivery/earnings">
            <UiText>Open cash ledger</UiText>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </article>
      </div>
      <p className="rider-refresh-state" role="status">
        <RefreshCw size={14} aria-hidden="true" />
        <UiText>{refreshing ? "Refreshing delivery data…" : "Last task check:"}</UiText>
        {!refreshing &&
          (updatedAt
            ? new Date(updatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST"
            : "Not checked yet")}
      </p>
      <details className="rider-help-card">
        <summary>
          <UiText>How a delivery works</UiText>
        </summary>
        <ol>
          <li>
            <strong>
              1. <UiText>Claim a ready order</UiText>
            </strong>
            <UiText>
              Review the shop and cash amount before claiming. Customer details unlock after a
              successful claim.
            </UiText>
          </li>
          <li>
            <strong>
              2. <UiText>Collect from the shop</UiText>
            </strong>
            <UiText>The seller confirms the handover before you start delivery.</UiText>
          </li>
          <li>
            <strong>
              3. <UiText>Deliver and verify</UiText>
            </strong>
            <UiText>
              Use the buyer receipt code. Confirm the exact cash received only for COD orders.
            </UiText>
          </li>
          <li>
            <strong>
              4. <UiText>Record cash handover</UiText>
            </strong>
            <UiText>Hand collected cash to the admin and track the receipt in your ledger.</UiText>
          </li>
        </ol>
      </details>
    </section>
  );
}
