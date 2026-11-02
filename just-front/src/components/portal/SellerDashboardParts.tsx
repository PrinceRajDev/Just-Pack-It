import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Store,
  PawPrint,
  Flower2,
  Shirt,
  Utensils,
  ShoppingBasket,
  ClipboardCheck,
  Clock3,
  CalendarDays,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ManagedShop } from "@/domain/management";
import { UiText } from "@/lib/i18n/Language";
import { useLanguage } from "@/lib/i18n/locale";
import { Button } from "@/components/ui/button";
import { OpenState } from "@/components/store/ShopMark";
import { NeighbourhoodIllustration } from "./NeighbourhoodIllustration";
import { Plus } from "lucide-react";
export function DashboardHero({ shop }: { shop: ManagedShop }) {
  const { language } = useLanguage();
  const categories = (shop.categories ?? []).join(" ").toLowerCase();
  const CategoryIcon = /pet/.test(categories)
    ? PawPrint
    : /flower|plant/.test(categories)
      ? Flower2
      : /cloth|fashion|footwear/.test(categories)
        ? Shirt
        : /restaurant|food|snack|meal/.test(categories)
          ? Utensils
          : /grocery|vegetable|fruit/.test(categories)
            ? ShoppingBasket
            : Store;
  return (
    <header className="seller-today-hero">
      <div className="seller-hero-copy">
        <p className="workspace-eyebrow">Just Pack It · Workspace</p>
        <h1>
          {shop.name} · <UiText>Today</UiText>
        </h1>
        <p className="seller-hero-date">
          {new Intl.DateTimeFormat(language === "hi" ? "hi-IN" : "en-IN", {
            dateStyle: "full",
            timeZone: shop.timezone,
          }).format(new Date())}
        </p>
        <div className="seller-hero-status">
          <OpenState shop={shop} />
          <span className="seller-hero-zone">{shop.timezone}</span>
        </div>
      </div>
      <div className="seller-storefront-scene" aria-hidden="true">
        <NeighbourhoodIllustration />
        <span className="seller-category-sign">
          <CategoryIcon size={26} />
        </span>
      </div>
      <Button asChild variant="citrus" className="seller-add-product">
        <Link to="/seller/products/new">
          <Plus size={19} aria-hidden="true" />
          <UiText>Add product</UiText>
        </Link>
      </Button>
    </header>
  );
}
export function QuickActionCard({
  title,
  description,
  icon: Icon,
  to,
  onClick,
  expanded,
  controls,
  primary = false,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  to?: "/seller/orders" | "/seller/inventory";
  onClick?: () => void;
  expanded?: boolean;
  controls?: string;
  primary?: boolean;
}) {
  const body = (
    <>
      <Icon className="seller-action-icon" size={28} aria-hidden="true" />
      <span className="seller-action-copy">
        <strong>
          <UiText>{title}</UiText>
        </strong>
        <small>
          <UiText>{description}</UiText>
        </small>
      </span>
      <span className="seller-action-arrow">
        <ArrowRight size={17} aria-hidden="true" />
      </span>
    </>
  );
  const className = `seller-action-card${primary ? " seller-action-primary" : ""}`;
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controls}
    >
      {body}
    </button>
  );
}
export function DashboardLoading() {
  return (
    <div role="status" className="seller-dashboard-loading">
      <span className="sr-only">
        <UiText>Loading daily orders and stock…</UiText>
      </span>
      <div className="seller-loading-metrics" aria-hidden="true">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="seller-loading-card">
            <i />
            <b />
            <em />
          </div>
        ))}
      </div>
      <div className="seller-loading-orders" aria-hidden="true" />
    </div>
  );
}
/** Decorative scenes only; counts and task state always come from the API. */
export function DashboardScene({ kind }: { kind: "handoff" | "stock" | "hours" }) {
  return (
    <div className={`seller-dashboard-scene seller-scene-${kind}`} aria-hidden="true">
      {kind === "handoff" ? (
        <svg viewBox="0 0 180 120" fill="none">
          <ellipse cx="94" cy="106" rx="75" ry="9" fill="#e4ead2" />
          <path
            d="M25 94C0 60 27 38 44 58C32 25 70 20 79 50C102 17 132 37 124 61C158 43 181 72 154 98Z"
            fill="#e9f2cf"
          />
          <rect x="36" y="53" width="76" height="42" rx="5" fill="#c7e68b" />
          <rect x="43" y="33" width="57" height="49" rx="4" fill="#edc365" />
          <path d="M64 33H79V52H64Z" fill="#f9e5a9" />
          <path d="M108 64H139L157 84V99H108Z" fill="#387245" />
          <path d="M118 70H136L147 83H118Z" fill="#e8f3d1" />
          <path d="M21 84H43M12 94H38" stroke="#7fba38" strokeWidth="4" strokeLinecap="round" />
          <circle cx="61" cy="99" r="11" fill="#245237" />
          <circle cx="137" cy="99" r="11" fill="#245237" />
          <circle cx="61" cy="99" r="5" fill="#b6d894" />
          <circle cx="137" cy="99" r="5" fill="#b6d894" />
        </svg>
      ) : kind === "stock" ? (
        <>
          <svg viewBox="0 0 160 110" fill="none">
            <ellipse cx="80" cy="100" rx="71" ry="8" fill="#e8e5cb" />
            <path d="M18 58L51 46L83 58V94L51 104L18 92Z" fill="#e9bd5a" />
            <path d="M18 58L51 69L83 58M51 69V103" stroke="#fff0bb" strokeWidth="3" />
            <path d="M72 22L101 13L132 24V61L101 72L72 61Z" fill="#f4d37f" />
            <path d="M72 22L101 34L132 24M101 34V70" stroke="#fff2c5" strokeWidth="3" />
          </svg>
          <ClipboardCheck className="seller-scene-clipboard" />
        </>
      ) : (
        <>
          <CalendarDays className="seller-scene-calendar" />
          <Clock3 className="seller-scene-clock" />
        </>
      )}
    </div>
  );
}
