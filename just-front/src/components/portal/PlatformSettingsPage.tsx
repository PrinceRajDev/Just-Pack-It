import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, ShieldCheck, ChevronRight, Mail, Phone, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { platformSettings } from "@/services/platform-settings";
import type { PlatformSettings, PublicPlatformSettings } from "@/domain/platform-settings";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmAction } from "@/components/common/ConfirmAction";
import { financeDate } from "@/lib/finance-date";
import "@/styles/platform-settings.css";
export function PlatformSettingsPage() {
  const q = useQuery({
    queryKey: ["platform-settings"],
    queryFn: platformSettings.get,
    retry: false,
  });
  return (
    <div className="platform-settings">
      <header className="platform-hero">
        <UiAttributes>
          <nav aria-label="Breadcrumb">
            <UiText>{"OPERATIONS "}</UiText>
            <ChevronRight size={13} />
            <b>PLATFORM SETTINGS</b>
          </nav>
        </UiAttributes>
        <div>
          <section>
            <h1>A considered local market.</h1>
            <p>
              Publish support details and a clear marketplace notice. Keep operational policy and
              provider credentials under controlled configuration.
            </p>
          </section>
          <aside>
            <ShieldCheck />
            <h2>
              Useful controls.
              <br />
              Protected foundations.
            </h2>
            <p>Publishing changes information, not payment or delivery eligibility.</p>
          </aside>
        </div>
      </header>
      {q.isPending ? (
        <UiAttributes>
          <div role="status" aria-label="Loading platform settings">
            <Skeleton className="h-40 w-full" />
          </div>
        </UiAttributes>
      ) : q.isError && !q.data ? (
        <section className="platform-panel" role="alert">
          <h2>Could not load platform settings</h2>
          <p>{q.error.message}</p>
          <Button variant="outline" onClick={() => void q.refetch()}>
            Retry settings
          </Button>
        </section>
      ) : q.data ? (
        <>
          {q.isError && (
            <p role="alert">
              Settings refresh failed. Your draft is retained.
              <Button variant="outline" onClick={() => void q.refetch()}>
                Retry settings
              </Button>
            </p>
          )}
          <SettingsEditor
            data={q.data}
            refreshing={q.isFetching || q.isError}
            onReload={() => q.refetch()}
          />
        </>
      ) : null}
    </div>
  );
}
function SettingsEditor({
  data,
  refreshing,
  onReload,
}: {
  data: PlatformSettings;
  refreshing: boolean;
  onReload: () => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<PublicPlatformSettings>({
      supportEmail: data.supportEmail,
      supportPhone: data.supportPhone,
      supportHours: data.supportHours,
      noticeEnabled: data.noticeEnabled,
      noticeText: data.noticeText,
    }),
    [baseVersion, setBaseVersion] = useState(data.version),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [stale, setStale] = useState(false),
    lock = useRef(false),
    client = useQueryClient(),
    form = useRef<HTMLFormElement>(null);
  const dirty = Object.keys(draft).some(
    (k) => draft[k as keyof PublicPlatformSettings] !== data[k as keyof PublicPlatformSettings],
  );
  const resetDraft = (value: PlatformSettings) => {
    setDraft({
      supportEmail: value.supportEmail,
      supportPhone: value.supportPhone,
      supportHours: value.supportHours,
      noticeEnabled: value.noticeEnabled,
      noticeText: value.noticeText,
    });
    setBaseVersion(value.version);
    setReason("");
    setError("");
    setStale(false);
  };
  const save = async () => {
    if (
      lock.current ||
      refreshing ||
      stale ||
      data.version !== baseVersion ||
      reason.trim().length < 10 ||
      !form.current?.reportValidity()
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await platformSettings.save(draft, baseVersion, reason.trim());
      resetDraft(saved);
      client.setQueryData(["platform-settings"], saved);
      await client.invalidateQueries({ queryKey: ["public-platform-settings"] });
      void client.invalidateQueries({ queryKey: ["admin-audit"] });
      toast.success("Marketplace information published");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publishing was not confirmed");
      setStale(true);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  const c = data.configuration;
  return (
    <>
      <div className="platform-layout">
        <section className="platform-panel">
          <h2>
            <Settings />
            Public marketplace information
          </h2>
          <p>
            Blank contact fields stay hidden. These details are for customer support, not the sender
            used for login OTPs.
          </p>
          {data.version !== baseVersion && (
            <p role="alert">
              Settings changed elsewhere. Your draft is retained; copy it before reloading or
              discarding.
            </p>
          )}
          <form ref={form} onSubmit={(e) => e.preventDefault()}>
            <fieldset disabled={busy || refreshing} className="space-y-4">
              <label>
                Support email
                <UiAttributes>
                  <Input
                    type="email"
                    maxLength={254}
                    value={draft.supportEmail}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, supportEmail: e.target.value.trim() }))
                    }
                    placeholder="Leave blank until ready"
                  />
                </UiAttributes>
              </label>
              <label>
                Support phone
                <UiAttributes>
                  <Input
                    type="tel"
                    pattern="\+[1-9][0-9]{9,14}"
                    title="Use international format, for example +91 followed by your number"
                    value={draft.supportPhone}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, supportPhone: e.target.value.trim() }))
                    }
                    placeholder="International format"
                  />
                </UiAttributes>
              </label>
              <label>
                Support hours
                <UiAttributes>
                  <Input
                    maxLength={100}
                    value={draft.supportHours}
                    onChange={(e) => setDraft((d) => ({ ...d, supportHours: e.target.value }))}
                    placeholder="Only state hours you can provide"
                  />
                </UiAttributes>
              </label>
              <label className="platform-checkbox">
                <input
                  type="checkbox"
                  checked={draft.noticeEnabled}
                  onChange={(e) => setDraft((d) => ({ ...d, noticeEnabled: e.target.checked }))}
                />
                Show buyer announcement
              </label>
              <label>
                Announcement text
                <Textarea
                  maxLength={300}
                  required={draft.noticeEnabled}
                  value={draft.noticeText}
                  onChange={(e) => setDraft((d) => ({ ...d, noticeText: e.target.value }))}
                />
              </label>
              <p className="platform-note">
                Informational text only. This does not close shops, pause checkout or override
                availability.
              </p>
              <label>
                Reason for publishing
                <Textarea
                  minLength={10}
                  maxLength={500}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            </fieldset>
            <div className="platform-actions">
              <UiAttributes>
                <ConfirmAction
                  title="Publish marketplace information?"
                  description="The contact details and active notice in the preview will become visible to customers. Payments, fees and order eligibility do not change."
                  confirmLabel="Confirm publish"
                  onConfirm={() => void save()}
                >
                  <Button
                    type="button"
                    disabled={
                      busy ||
                      refreshing ||
                      stale ||
                      data.version !== baseVersion ||
                      !dirty ||
                      reason.trim().length < 10 ||
                      (draft.noticeEnabled && !draft.noticeText.trim())
                    }
                  >
                    <UiText>{busy ? "Publishing…" : "Publish changes"}</UiText>
                  </Button>
                </ConfirmAction>
              </UiAttributes>
              <Button
                type="button"
                variant="outline"
                disabled={busy || refreshing}
                onClick={() => {
                  resetDraft(data);
                }}
              >
                Discard draft
              </Button>
            </div>
            {error && (
              <p role="alert">{error} Copy your draft before reloading the latest settings.</p>
            )}
          </form>
          <p className="platform-note">
            Last saved: {financeDate(data.updatedAt)} (IST).{" "}
            <UiText>{dirty ? "You have unpublished changes." : "No unpublished changes."}</UiText>
          </p>
          <UiAttributes>
            <ConfirmAction
              title="Reload saved settings?"
              description="Unsaved draft text will be replaced by the latest saved information."
              confirmLabel="Reload settings"
              onConfirm={() =>
                void onReload().then((result) => {
                  if (
                    result &&
                    typeof result === "object" &&
                    "data" in result &&
                    result.data &&
                    !("isError" in result && result.isError)
                  )
                    resetDraft(result.data as PlatformSettings);
                })
              }
            >
              <Button variant="outline" disabled={busy || refreshing}>
                Reload saved settings
              </Button>
            </ConfirmAction>
          </UiAttributes>
        </section>
        <UiAttributes>
          <aside
            className="platform-panel platform-preview"
            aria-label="Public information preview"
          >
            <h2>
              <Megaphone />
              Customer preview
            </h2>
            {draft.noticeEnabled && draft.noticeText ? (
              <p className="platform-notice-preview">{draft.noticeText}</p>
            ) : (
              <p>No announcement published in this draft.</p>
            )}
            {draft.supportPhone && (
              <p>
                <Phone size={16} />
                {draft.supportPhone}
              </p>
            )}
            {draft.supportEmail && (
              <p className="break-all">
                <Mail size={16} />
                {draft.supportEmail}
              </p>
            )}
            {draft.supportHours && <p>{draft.supportHours}</p>}
            <small>
              Preview only until confirmed publication. Storefront updates on refresh or its next
              background check.
            </small>
          </aside>
        </UiAttributes>
      </div>
      <section className="platform-panel">
        <h2>
          <ShieldCheck />
          Deployment configuration
        </h2>
        <p>
          Read-only configuration flags, not live provider or worker health. Secrets remain on the
          server; deployment settings cannot be changed here.
        </p>
        <div className="platform-config-grid">
          {[
            ["Cash on delivery", c.codEnabled ? "Enabled" : "Disabled"],
            ["Online payments", c.onlineEnabled ? `Enabled (${c.paymentMode})` : "Disabled"],
            ["Refund submissions", c.refundsEnabled ? "Enabled" : "Disabled"],
            ["Platform delivery", c.platformDeliveryEnabled ? "Enabled" : "Disabled"],
            ["Email OTP", c.emailOtpRequired ? "Required" : "Not required by deployment"],
            ["OTP email integration", c.emailConfigured ? "Configured" : "Not configured"],
            [
              "Image storage",
              `${c.imageProvider === "r2" ? "Cloudflare R2" : "Cloudflare Images"} · ${c.imageConfigured ? "Configured" : "Not configured"}`,
            ],
            ["Push notifications", c.pushEnabled ? "Enabled in configuration" : "Disabled"],
            [
              "Inventory worker",
              c.inventoryWorkerEnabled ? "Enabled flag; process not checked" : "Disabled flag",
            ],
            [
              "Payment recovery worker",
              c.paymentWorkerEnabled ? "Enabled flag; process not checked" : "Disabled flag",
            ],
          ].map(([label, value]) => (
            <article key={label}>
              <h3>
                <UiText>{label}</UiText>
              </h3>
              <p>{value}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="platform-panel">
        <h2>Marketplace policies</h2>
        <ul className="space-y-2 text-sm">
          <li>
            Nearby discovery: 6 km straight-line radius, with approved shops, active category and
            service-area assignments.
          </li>
          <li>
            Commission: zero under the current settlement policy. Taxes are included in listed
            prices.
          </li>
          <li>
            Delivery fee: shop-listed fee; seller delivery belongs to seller, platform delivery
            belongs to platform.
          </li>
          <li>
            Account access: one active login session; role migrations require separate controlled
            workflows.
          </li>
        </ul>
        <div className="platform-actions">
          <Button asChild variant="outline">
            <Link to="/admin/settings">Service areas &amp; audit</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/users">Users &amp; roles</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
