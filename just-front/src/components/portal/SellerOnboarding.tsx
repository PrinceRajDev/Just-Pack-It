import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { management } from "@/services/management";
import type { ManagedShop, ManagedCategory, ManagedArea } from "@/domain/management";
import { PortalHeader } from "./PortalShell";
import { Panel } from "./management-shared";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { ShopReviewNotice } from "./ShopReviewNotice";

export function SellerOnboarding({
  shop,
  categories,
  areas,
}: {
  shop: ManagedShop;
  categories: ManagedCategory[];
  areas: ManagedArea[];
}) {
  const products = useQuery({ queryKey: ["seller-products"], queryFn: management.products });
  const referencesReady =
    shop.categoryIds.some((id) => categories.some((category) => category.id === id)) &&
    shop.serviceAreaIds.some((id) => areas.some((area) => area.id === id && area.active));
  const profileReady = !!(
    shop.name.trim() &&
    shop.address?.trim() &&
    shop.fulfilment.length &&
    referencesReady
  );
  const hoursReady = shop.openingHours.length > 0;
  const stocked =
    products.data?.filter(
      (product) =>
        product.active &&
        (product.variants?.length
          ? product.variants.some((variant) => variant.stock > 0 && variant.price > 0)
          : product.stock > 0 && product.price > 0),
    ) ?? [];
  const canBrowse = shop.status === "approved" && shop.active && referencesReady;
  const statusCopy =
    shop.status === "pending"
      ? "Your shop is awaiting admin approval and is hidden from the marketplace. You can complete hours and products while waiting."
      : shop.status === "rejected"
        ? "Your shop was not approved and is hidden from the marketplace. Review your details, then save your profile to request another review."
        : shop.status === "suspended"
          ? "Your shop is suspended and hidden from the marketplace. Contact the platform admin for a review; updating your profile does not automatically approve it."
          : !shop.active
            ? "Your shop is approved but inactive. Contact the platform admin before it can appear in the marketplace."
            : !referencesReady
              ? "Your shop is approved, but its service area or shop type is unavailable. Update those assignments before it can be listed."
              : shop.temporarilyClosed
                ? "Your shop is approved and available for browsing, but marked temporarily closed. Update your profile when you are ready to open."
                : shop.isOpen
                  ? "Your shop is approved, listed and open according to the server's current status. Review your orders in the Orders workspace."
                  : "Your shop is approved and available for browsing, but currently closed. Check your saved operating hours. Review your orders in the Orders workspace.";
  const steps = [
    {
      title: "Confirm your shop details",
      done: profileReady,
      body: profileReady
        ? "Shop name, address, fulfilment and active category/area assignments are saved."
        : "Add your full shop address and check category, service area and fulfilment assignments.",
      to: "/seller/settings",
      action: "Edit shop profile",
    },
    {
      title: "Set operating hours",
      done: hoursReady,
      body: hoursReady
        ? `${shop.openingHours.length} operating interval${shop.openingHours.length === 1 ? "" : "s"} saved in ${shop.timezone}. Current open status comes from the server.`
        : "No operating intervals are saved. Your shop will show as closed until you add hours.",
      to: "/seller/settings",
      action: "Set shop hours",
    },
    {
      title: "Add a stocked listing",
      done: !products.error && !products.isPending && stocked.length > 0,
      body: products.isPending
        ? "Checking your saved catalogue…"
        : products.error
          ? "Catalogue could not be checked. Retry below; no stock result is assumed."
          : stocked.length
            ? `${stocked.length} active listing${stocked.length === 1 ? " has" : "s have"} available stock. Stock is tracked separately for every product and option.`
            : "Add an actual product with its price and stock, or restock an existing listing.",
      to: products.data?.length ? "/seller/products" : "/seller/products/new",
      action: "Manage products",
    },
    {
      title: "Admin approval",
      done: shop.status === "approved",
      body:
        shop.status === "approved"
          ? "Your profile has been approved. Saving profile changes sends it back for review."
          : shop.status === "pending"
            ? "Your submission is already in the review queue. No additional submit button is needed."
            : "Your shop needs another admin review before it can be listed.",
      to: "/seller/settings",
      action: "Review submitted profile",
    },
  ];
  return (
    <>
      <UiAttributes>
        <PortalHeader
          title={`Welcome, ${shop.name}`}
          sub="Your shop setup, step by step. These states come from your saved account and catalogue."
        />
      </UiAttributes>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl">
            Shop status: <UiText>{shop.status}</UiText>
          </h2>
          {canBrowse && (
            <Button variant="outline" asChild>
              <Link to="/shop/$slug" params={{ slug: shop.slug }}>
                View your shop
              </Link>
            </Button>
          )}
        </div>
        <p role="status" className="text-sm">
          {statusCopy}
        </p>
        <ShopReviewNotice shop={shop} />
        <p className="text-xs text-muted-foreground">
          Approval controls marketplace visibility. Hours and stock describe readiness; they do not
          make an unapproved shop public.
        </p>
      </Panel>
      <UiAttributes>
        <ol aria-label="Shop onboarding steps" className="mt-5 grid gap-4 md:grid-cols-2">
          {steps.map((step, index) => (
            <li key={step.title}>
              <Panel>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Step {index + 1}</span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs ${step.done ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}
                  >
                    <UiText>
                      {step.done
                        ? "Complete"
                        : index === 2 && products.isPending
                          ? "Checking"
                          : index === 2 && products.error
                            ? "Not checked"
                            : index === 3 && shop.status === "pending"
                              ? "Awaiting review"
                              : "To do"}
                    </UiText>
                  </span>
                </div>
                <h2 className="font-display text-xl">
                  <UiText>{step.title}</UiText>
                </h2>
                <p className="text-sm text-muted-foreground">
                  <UiText>{step.body}</UiText>
                </p>
                <Button variant="outline" asChild>
                  <Link to={step.to}>{step.action}</Link>
                </Button>
              </Panel>
            </li>
          ))}
        </ol>
      </UiAttributes>
      {products.error && (
        <div className="mt-4">
          <UiAttributes>
            <ErrorState
              message="We could not check your catalogue. Your existing listings have not been changed."
              onRetry={() => void products.refetch()}
            />
          </UiAttributes>
        </div>
      )}
    </>
  );
}
