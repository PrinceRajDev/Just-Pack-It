import { UiAttributes } from "@/lib/i18n/Language";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { imageUrl } from "@/lib/image";
import "@/styles/brand.css";

/** Shared storefront/parcel mark supplied by the brand owner. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src={imageUrl("/brand/just-pack-it-mark-v1.webp")}
      width={192}
      height={192}
      alt=""
      aria-hidden="true"
      className={cn("size-8 object-contain", className)}
    />
  );
}

export function Logo({
  to = "/",
  suffix,
  className,
  inverse = false,
}: {
  to?: string;
  suffix?: string;
  className?: string;
  inverse?: boolean;
}) {
  return (
    <UiAttributes>
      <Link
        to={to}
        className={cn("brand-logo flex items-center gap-2 shrink-0", className)}
        aria-label="Just Pack It home"
      >
        <img
          src={imageUrl(`/brand/just-pack-it-logo${inverse ? "-inverse" : ""}-v1.webp`)}
          width={1200}
          height={320}
          alt=""
          className="brand-logo-image"
        />
        {suffix && (
          <span className="label-stamp rounded-sm border border-current/30 px-1.5 py-0.5 opacity-80">
            {suffix}
          </span>
        )}
      </Link>
    </UiAttributes>
  );
}
