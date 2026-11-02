import { UiText } from "@/lib/i18n/Language";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Store, MapPin, UserRound, ShieldCheck } from "lucide-react";
import type {
  ManagedShop,
  ManagedArea,
  ManagedCategory,
  SellerAccount,
  ShopStatus,
} from "@/domain/management";
import { management } from "@/services/management";
import { imageUrl, inr } from "@/lib/image";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { SaveError } from "./management-shared";
import { ShopReviewNotice } from "./ShopReviewNotice";
export function AdminShopReview({
  shop,
  owner,
  categories,
  areas,
  initialDecision,
  latest,
  onReload,
  onClose,
  restoreFocus,
  reviewUnavailable = false,
}: {
  shop: ManagedShop;
  owner?: SellerAccount;
  categories: ManagedCategory[];
  areas: ManagedArea[];
  initialDecision?: ShopStatus;
  latest?: ManagedShop;
  onReload: () => void;
  onClose: () => void;
  restoreFocus: () => void;
  reviewUnavailable?: boolean;
}) {
  const [decision, setDecision] = useState<ShopStatus>(initialDecision ?? shop.status),
    [reason, setReason] = useState(""),
    [confirmation, setConfirmation] = useState<{ decision: ShopStatus; reason: string } | null>(
      null,
    );
  const locked = useRef(false),
    client = useQueryClient(),
    reasonInput = useRef<HTMLTextAreaElement>(null);
  const stale = !!latest && latest.version !== shop.version;
  const save = useMutation({
    mutationFn: (command: { decision: ShopStatus; reason: string }) =>
      management.approve(shop, command.decision, command.reason || undefined),
    retry: false,
    onSuccess: async (saved) => {
      toast.success(`Shop review saved: ${saved.status}.`);
      setConfirmation(null);
      await Promise.allSettled([
        client.invalidateQueries({ queryKey: ["admin-shops"] }),
        client.invalidateQueries({ queryKey: ["admin-operations"] }),
        client.invalidateQueries({ queryKey: ["shops"] }),
        client.invalidateQueries({ queryKey: ["shop"] }),
      ]);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });
  async function commit() {
    if (!confirmation || locked.current || stale || reviewUnavailable) return;
    locked.current = true;
    try {
      await save.mutateAsync(confirmation);
    } catch {
      /* The saved draft and structured error remain visible. */
    } finally {
      locked.current = false;
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending && !locked.current) onClose();
      }}
    >
      <SheetContent
        className="seller-application-drawer w-full sm:max-w-2xl"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          restoreFocus();
        }}
        onOpenAutoFocus={(e) => {
          if (initialDecision === "rejected") {
            e.preventDefault();
            reasonInput.current?.focus();
          }
        }}
      >
        <div className="seller-detail-heading">
          <span className={`seller-status seller-status-${shop.status}`}>
            <UiText>{shop.status}</UiText>
          </span>
          <SheetTitle>{shop.name}</SheetTitle>
          <SheetDescription>
            Review the supplied application before saving an admin decision.
          </SheetDescription>
        </div>
        {shop.coverImage && (
          <img
            className="seller-detail-photo"
            src={imageUrl(shop.coverImage, { width: 700 })}
            alt={`${shop.name} submitted shop photo`}
            loading="lazy"
          />
        )}
        {stale && (
          <div role="alert" className="seller-partial-error">
            This application changed after you opened it. Your note is kept; load the latest details
            before reviewing again.
            <Button variant="outline" disabled={save.isPending} onClick={onReload}>
              Load latest details
            </Button>
          </div>
        )}
        <section className="seller-detail-section">
          <h3>
            <UserRound size={18} aria-hidden="true" />
            Seller account
          </h3>
          <dl>
            <div>
              <dt>
                <UiText>{"Name"}</UiText>
              </dt>
              <dd>{owner?.name ?? "Owner unavailable"}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{owner?.phone ?? "Not supplied by the seller API"}</dd>
            </div>
            <div>
              <dt>
                <UiText>{"Account"}</UiText>
              </dt>
              <dd>
                <UiText>{owner ? (owner.active ? "Active" : "Inactive") : "Unavailable"}</UiText>
              </dd>
            </div>
            <div>
              <dt>Email / account creation date</dt>
              <dd>Not provided by the seller API</dd>
            </div>
          </dl>
        </section>
        <section className="seller-detail-section">
          <h3>
            <Store size={18} aria-hidden="true" />
            Shop information
          </h3>
          <p>{shop.description || shop.tagline || "No description supplied"}</p>
          <dl>
            <div>
              <dt>
                <UiText>{"Categories"}</UiText>
              </dt>
              <dd>
                {shop.categoryIds
                  .map((id) => categories.find((c) => c.id === id)?.name ?? "Unavailable category")
                  .join(", ") || "Not supplied"}
              </dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{shop.address || shop.locality || "Not supplied"}</dd>
            </div>
            <div>
              <dt>
                <UiText>{"Service areas"}</UiText>
              </dt>
              <dd>
                {shop.serviceAreaIds
                  .map((id) => areas.find((a) => a.id === id)?.name ?? "Unavailable area")
                  .join(", ") || "None assigned"}
              </dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd>
                <UiText>{shop.active ? "Active profile" : "Inactive profile"}</UiText> ·{" "}
                <UiText>{shop.isOpen ? "Open now" : "Closed now"}</UiText>. Approval alone does not
                guarantee public availability.
              </dd>
            </div>
            <div>
              <dt>Delivery / pickup</dt>
              <dd>
                {shop.fulfilment.map((f) => f.replaceAll("_", " ")).join(", ") || "None supplied"}
              </dd>
            </div>
            <div>
              <dt>Listed delivery fee / minimum</dt>
              <dd>
                <UiText>
                  {shop.deliveryFee === undefined ? "Not supplied" : inr(shop.deliveryFee)}
                </UiText>{" "}
                /{" "}
                <UiText>
                  {shop.minimumOrderAmount === undefined
                    ? "Not supplied"
                    : inr(shop.minimumOrderAmount)}
                </UiText>
              </dd>
            </div>
            <div>
              <dt>Operating hours ({shop.timezone})</dt>
              <dd>
                {shop.openingHours.length
                  ? shop.openingHours
                      .map(
                        (h) =>
                          `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][h.day]} ${h.opens} to ${h.closes}`,
                      )
                      .join("; ")
                  : "No operating intervals (closed)"}
              </dd>
            </div>
            <div>
              <dt>Application submitted</dt>
              <dd>Date not provided by this API</dd>
            </div>
          </dl>
        </section>
        <section className="seller-detail-section">
          <h3>
            <MapPin size={18} aria-hidden="true" />
            Location check
          </h3>
          <p>
            <UiText>
              {shop.location
                ? `Map pin: ${shop.location.coordinates[1]}, ${shop.location.coordinates[0]}. Verify it against the written address before approval.`
                : "Map pin missing: this shop cannot appear in GPS nearby results."}
            </UiText>
          </p>
        </section>
        <section className="seller-detail-section">
          <h3>
            <ShieldCheck size={18} aria-hidden="true" />
            Review information
          </h3>
          <p>
            Identity documents and verification results are not provided here. An approval records
            an admin decision.
          </p>
          <ShopReviewNotice shop={shop} />
        </section>
        {reviewUnavailable && (
          <p role="alert">
            Application data is refreshing or unavailable. Return to the list and refresh before
            saving a review.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!save.isPending && !stale && !reviewUnavailable)
              setConfirmation({ decision, reason: reason.trim() });
          }}
        >
          <fieldset
            disabled={save.isPending || stale || reviewUnavailable}
            className="seller-decision-fields"
          >
            <legend>Review decision</legend>
            <label>
              Approval decision
              <select value={decision} onChange={(e) => setDecision(e.target.value as ShopStatus)}>
                {(["pending", "approved", "rejected", "suspended"] as const).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason for seller{" "}
              <UiText>
                {decision === "rejected" || decision === "suspended" ? "(required)" : "(optional)"}
              </UiText>
              <textarea
                ref={reasonInput}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={3}
                maxLength={1000}
                required={decision === "rejected" || decision === "suspended"}
                rows={3}
                aria-describedby="seller-review-note-help"
              />
            </label>
            <p id="seller-review-note-help">
              Visible to the shop owner. Explain what needs fixing; do not include private
              operational details.
            </p>
            <Button type="submit">
              <UiText>{save.isPending ? "Saving…" : "Review and save decision"}</UiText>
            </Button>
          </fieldset>
        </form>
        <SaveError error={save.error} />
        <Button variant="ghost" disabled={save.isPending} onClick={onClose}>
          Return to application list
        </Button>
        <AlertDialog
          open={!!confirmation}
          onOpenChange={(open) => {
            if (!open && !save.isPending) setConfirmation(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogTitle>
              <UiText>{"Confirm "}</UiText>
              {confirmation?.decision} decision?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This saves the review for {shop.name}.{" "}
              <UiText>
                {confirmation?.reason
                  ? "The reason will be visible to the seller."
                  : "Availability still depends on the shop profile, categories and service area."}
              </UiText>
            </AlertDialogDescription>
            {save.error && <p role="alert">{save.error.message}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={save.isPending}>Keep editing</AlertDialogCancel>
              <AlertDialogAction
                disabled={save.isPending || stale || reviewUnavailable}
                onClick={(e) => {
                  e.preventDefault();
                  void commit();
                }}
              >
                <UiText>{save.isPending ? "Saving…" : "Confirm decision"}</UiText>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
