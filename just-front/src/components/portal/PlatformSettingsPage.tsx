import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Clock, Mail, Phone } from "lucide-react";
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
import { inr } from "@/lib/image";
import { DELIVERY_FEE } from "@/lib/pricing";
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
            <UiText>Operations</UiText>
            <ChevronRight aria-hidden="true" />
            <span aria-current="page">
              <UiText>Platform settings</UiText>
            </span>
          </nav>
        </UiAttributes>
        <h1>
          <UiText>Platform settings</UiText>
        </h1>
        <p>Manage the support details and announcement buyers see on Just Pack It.</p>
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
  const hasNotice = draft.noticeEnabled && Boolean(draft.noticeText.trim());
  const hasSupport = Boolean(draft.supportPhone || draft.supportEmail || draft.supportHours);
  return (
    <>
      <div className="platform-layout">
        <section className="platform-panel">
          <h2>Public marketplace information</h2>
          <p>Blank contact fields stay hidden from buyers.</p>
          {data.version !== baseVersion && (
            <p role="alert">
              Settings changed elsewhere. Your draft is retained; copy it before reloading or
              discarding.
            </p>
          )}
          <form ref={form} onSubmit={(e) => e.preventDefault()}>
            <fieldset disabled={busy || refreshing} className="platform-fields">
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
                This announcement is for information only. Shop availability and checkout follow
                their existing rules.
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
          <p className="platform-save-state" role="status">
            {data.updatedAt
              ? `Last saved ${financeDate(data.updatedAt)} (IST).`
              : "No publication recorded."}{" "}
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
            <h2>Customer preview</h2>
            <div className="platform-noticeboard">
              <p className="platform-preview-status">
                {stale
                  ? "Draft · Publication unconfirmed"
                  : dirty
                    ? "Draft · Changes go live after publishing"
                    : data.updatedAt
                      ? "Published settings"
                      : "Preview · Nothing published yet"}
              </p>
              <p className={hasNotice ? "platform-notice-preview" : "platform-preview-empty"}>
                {hasNotice ? draft.noticeText : "No announcement to show"}
              </p>
              {hasSupport && (
                <ul className="platform-preview-contacts" aria-label="Customer support details">
                  {draft.supportPhone && (
                    <li>
                      <Phone aria-hidden="true" />
                      {draft.supportPhone}
                    </li>
                  )}
                  {draft.supportEmail && (
                    <li>
                      <Mail aria-hidden="true" />
                      {draft.supportEmail}
                    </li>
                  )}
                  {draft.supportHours && (
                    <li>
                      <Clock aria-hidden="true" />
                      {draft.supportHours}
                    </li>
                  )}
                </ul>
              )}
            </div>
            <p>Buyers see published changes on refresh or the next background check.</p>
          </aside>
        </UiAttributes>
      </div>
      <section className="platform-panel">
        <h2>Deployment configuration</h2>
        <p>Read-only settings from the backend. Live service health is checked separately.</p>
        <dl className="platform-config">
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
            <div key={label}>
              <dt>
                <UiText>{label}</UiText>
              </dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
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
            Delivery fees: shops set and keep their own delivery fee. Just Pack It receives{" "}
            {inr(DELIVERY_FEE.platform_delivery)} per shop order delivered by a platform rider.
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
