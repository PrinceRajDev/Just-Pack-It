import { AccountProfile } from "@/components/auth/AccountProfile";
import { AccountSecurity } from "@/components/auth/AccountSecurity";
import { useAuth } from "@/stores/auth";
import { UiText } from "@/lib/i18n/Language";
import { UserRound, ShieldCheck, MapPin } from "lucide-react";
import type { PartnerProfile } from "@/domain/live-delivery";
import { useQuery } from "@tanstack/react-query";
import { management } from "@/services/management";
export function RiderProfile({
  profile,
  loading,
  error,
}: {
  profile: PartnerProfile | null | undefined;
  loading: boolean;
  error: boolean;
}) {
  const { session } = useAuth();
  const areas = useQuery({ queryKey: ["areas"], queryFn: management.areas, retry: false });
  return (
    <section className="rider-profile-page">
      <header>
        <h2>
          <UserRound aria-hidden="true" />
          <UiText>Rider profile</UiText>
        </h2>
        <p>
          <UiText>Manage your name, account security and delivery details.</UiText>
        </p>
      </header>
      <div className="rider-profile-layout">
        <aside className="rider-profile-identity">
          <span className="rider-avatar" aria-hidden="true">
            {session?.name
              ?.trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((word) => word[0])
              .join("")
              .toUpperCase()}
          </span>
          <h3>{session?.name}</h3>
          <p>
            <UiText>Delivery partner</UiText>
          </p>
          <h4>
            <ShieldCheck size={17} aria-hidden="true" />
            <UiText>Approval status</UiText>
          </h4>
          <p role="status">
            <UiText>
              {loading
                ? "Checking delivery approval…"
                : error
                  ? "Could not load delivery approval."
                  : profile?.approved
                    ? "Approved delivery partner"
                    : "Awaiting admin approval"}
            </UiText>
          </p>
          <h4>
            <MapPin size={17} aria-hidden="true" />
            <UiText>Assigned service areas</UiText>
          </h4>
          {areas.isPending ? (
            <p>Loading service areas…</p>
          ) : areas.isError ? (
            <p>Could not load area names.</p>
          ) : (
            <ul>
              {profile?.areaIds.map((id) => (
                <li key={id}>
                  {areas.data?.find((area) => area.id === id)?.name ?? "Area not currently listed"}
                </li>
              ))}
            </ul>
          )}
          {!loading && !error && !profile?.areaIds.length && <p>No service areas assigned yet.</p>}
          <small>
            <UiText>Approval and service areas are managed by your admin.</UiText>
          </small>
        </aside>
        <div>
          <AccountProfile />
          <details className="rider-profile-security">
            <summary>
              <UiText>Account security</UiText>
            </summary>
            <AccountSecurity />
          </details>
        </div>
      </div>
    </section>
  );
}
