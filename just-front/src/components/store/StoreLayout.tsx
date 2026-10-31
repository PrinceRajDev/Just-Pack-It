import { PublicPlatformInfo } from "./PublicPlatformInfo";
import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { DemoBanner } from "@/components/common/states";
import { StoreFooter, StoreHeader } from "./StoreHeader";
import { AreaNotice } from "./AreaNotice";
import { isDemoMode } from "@/lib/config";

export function StoreLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <div
      className={`store-shell flex min-h-screen flex-col ${pathname === "/" ? "" : "store-interior"}`}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-card focus:p-2"
      >
        Skip to content
      </a>
      <DemoBanner />
      <StoreHeader />
      <PublicPlatformInfo />
      <main id="main" className="flex-1">
        {!isDemoMode && (
          <p className="border-b border-border bg-paper px-4 py-2 text-center text-sm">
            Connected marketplace · Payment availability is checked at checkout.
          </p>
        )}
        {(pathname === "/" ||
          pathname === "/categories" ||
          pathname === "/search" ||
          pathname.startsWith("/category/")) && <AreaNotice />}
        {children}
      </main>
      <StoreFooter />
    </div>
  );
}

export function PageTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="interior-page-title mx-auto max-w-7xl px-4 pb-6 pt-10">
      {eyebrow && <p className="label-stamp text-muted-foreground">{eyebrow}</p>}
      <h1 className="mt-1 font-display text-4xl md:text-5xl">{title}</h1>
      {children}
    </div>
  );
}
