import { useState, useEffect, useId } from "react";
import { recentSearches, rememberSearch, clearSearches } from "@/lib/search";
import { useQuery } from "@tanstack/react-query";
import { productsQuery, categoriesQuery } from "@/services/catalog";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Heart,
  MapPin,
  Search,
  ShoppingBag,
  User,
  ChevronDown,
  Check,
  Ticket,
  Grid2X2,
} from "lucide-react";
import "@/styles/store-navbar.css";
import { Logo } from "@/components/brand/Logo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCart } from "@/stores/cart";
import { useAuth } from "@/stores/auth";
import { NotificationBell } from "@/components/common/NotificationBell";
import { useLocationArea } from "@/stores/location";

export function SearchBox({
  autoFocus,
  className = "",
}: {
  autoFocus?: boolean;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const searchId = useId();
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(timer);
  }, [q]);
  const navigate = useNavigate();
  const { area, gps } = useLocationArea();
  const { data: matches = [] } = useQuery({
    ...productsQuery({ q: debounced, area: area?.id, ...gps }),
    enabled: !!area && !!debounced,
  });
  const suggestions = debounced === q.trim() ? matches.slice(0, 5) : [];

  const go = (term: string) => {
    rememberSearch(term);
    setOpen(false);
    navigate({ to: "/search", search: { q: term } });
  };

  return (
    <form
      role="search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
      className={`market-search relative ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        go(q);
      }}
    >
      <label htmlFor={searchId} className="sr-only">
        Search products
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        id={searchId}
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setRecent(recentSearches());
          setOpen(true);
        }}
        placeholder="Search for a product…"
        autoComplete="off"
        className="h-11 w-full rounded-xl border border-input bg-card pl-9 pr-16 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
      <button
        type="submit"
        aria-label="Search products"
        className="absolute right-0 top-0 flex h-11 w-14 items-center justify-center rounded-r-xl bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <Search className="size-5" aria-hidden />
      </button>
      {area && open && (q ? suggestions.length > 0 : true) && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 rounded-md border border-border bg-popover p-1 shadow-lift">
          {q ? (
            suggestions.map((s) => (
              <button
                type="button"
                key={s.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(s.name)}
                className="block w-full truncate rounded-sm px-3 py-2 text-left text-sm hover:bg-muted"
              >
                {s.name} <span className="text-muted-foreground">· {s.unit}</span>
              </button>
            ))
          ) : (
            <div className="p-2">
              {recent.length > 0 && (
                <div className="mb-3">
                  <div className="mb-2 flex justify-between text-sm">
                    <span>Recent searches</span>
                    <button
                      type="button"
                      onClick={() => {
                        clearSearches();
                        setRecent([]);
                      }}
                      className="text-primary underline"
                    >
                      Clear recent searches
                    </button>
                  </div>
                  {recent.map((term) => (
                    <button
                      type="button"
                      key={term}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => go(term)}
                      className="block min-h-11 w-full truncate rounded px-3 text-left text-sm hover:bg-muted"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              )}
              <p className="label-stamp mb-2 text-muted-foreground">Popular nearby</p>
              <div className="flex flex-wrap gap-1.5">
                {["milk", "atta", "tomatoes", "eggs", "chai"].map((t) => (
                  <button
                    type="button"
                    key={t}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => go(t)}
                    className="rounded-full border border-border px-3 py-1 text-xs hover:border-primary"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

export function LocationPicker() {
  const {
    area,
    areas,
    ready,
    isError,
    retry,
    setArea,
    gps,
    locating,
    locationError,
    requestGps,
    gpsAreaIds,
    chooseGpsArea,
  } = useLocationArea();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="market-location flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
        aria-label="Choose delivery area"
      >
        <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0">
          <span className="label-stamp block text-muted-foreground">Deliver to</span>
          <span className="block max-w-[11rem] truncate text-sm font-medium">
            {area ? `${gps ? "Within 6 km · " : ""}${area.name}` : "Choose your area"}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-1rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain"
      >
        <p className="font-display text-lg">Where should we deliver?</p>
        <button
          type="button"
          disabled={locating}
          onClick={() => void requestGps()}
          className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-lg bg-primary px-3 py-2 text-left text-sm text-primary-foreground disabled:opacity-60"
        >
          <MapPin className="size-4" aria-hidden />
          {locating ? "Finding your location…" : "Use my location · shops within 6 km"}
        </button>
        {locationError && (
          <p className="mt-2 text-sm" role="alert">
            {locationError}
          </p>
        )}
        {!!gpsAreaIds?.length && gpsAreaIds.length > 1 && (
          <div className="mt-3">
            <p className="text-sm">Choose a nearby service area:</p>
            {areas
              .filter((item) => gpsAreaIds.includes(item.id))
              .map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    chooseGpsArea(item.id);
                    setOpen(false);
                  }}
                  className="block min-h-11 w-full text-left text-sm underline"
                >
                  {item.name}
                </button>
              ))}
          </div>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          GPS uses straight-line distance, not driving distance. Or choose a service area manually
          below.
        </p>
        <ul className="mt-3 divide-y divide-border">
          {!ready && !isError && (
            <li className="py-3 text-sm" role="status">
              Loading areas…
            </li>
          )}
          {isError && (
            <li className="py-3 text-sm" role="alert">
              Couldn't load areas.{" "}
              <button onClick={retry} className="underline">
                Try again
              </button>
            </li>
          )}
          {ready && !isError && !areas.length && (
            <li className="py-3 text-sm">No service areas available yet.</li>
          )}
          {areas.map((z) => (
            <li key={z.id}>
              <button
                disabled={!z.active}
                onClick={() => {
                  setArea(z.id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between py-2.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>
                  {z.name}, {z.city}
                  <span className="block text-xs text-muted-foreground">
                    {z.active ? `PIN ${z.pincodes.join(", ")}` : "Coming soon"}
                  </span>
                </span>
                {area?.id === z.id && <Check className="size-4 text-primary" />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function StoreHeader() {
  const { data: categories = [] } = useQuery(categoriesQuery());
  const { count, wishlist } = useCart();
  const { session } = useAuth();
  return (
    <header className="market-navbar sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="market-navbar-main mx-auto flex max-w-none items-center gap-3 px-4 py-3 md:px-8 md:gap-6 xl:px-12">
        <div className="market-navbar-brand shrink-0">
          <Logo />
          <span className="market-navbar-tagline text-caption ml-10 hidden text-muted-foreground xl:block">
            Your neighbourhood, delivered
          </span>
        </div>
        <div className="hidden md:block">
          <LocationPicker />
        </div>
        <SearchBox className="hidden flex-1 md:block" />
        <nav className="market-navbar-actions ml-auto flex items-center gap-1" aria-label="Account">
          <Link
            to="/search"
            search={{ offersOnly: true }}
            className="market-navbar-offers hidden h-10 items-center gap-2 rounded-md px-2.5 text-sm hover:bg-muted xl:flex"
          >
            <Ticket className="size-4 text-promo" aria-hidden /> Offers
          </Link>
          <Link
            to="/categories"
            className="market-navbar-categories hidden h-11 items-center gap-2 rounded-md px-2.5 text-sm hover:bg-muted xl:flex"
          >
            <Grid2X2 size={18} aria-hidden="true" /> Categories
          </Link>
          <Link
            to={session ? "/account" : "/login"}
            className="market-navbar-account flex h-10 items-center gap-2 rounded-md px-2.5 text-sm hover:bg-muted"
            aria-label="Account"
          >
            <User className="size-5" aria-hidden="true" />{" "}
            <span className="hidden lg:inline">
              {session ? session.name.split(" ")[0] : "Sign in"}
            </span>
          </Link>
          <Link
            to="/account"
            search={{ tab: "wishlist" }}
            className="relative hidden h-10 items-center rounded-md px-2.5 hover:bg-muted sm:flex"
            aria-label={`Wishlist, ${wishlist.length} items`}
          >
            <Heart className="size-5" />
            {wishlist.length > 0 && (
              <span className="absolute right-1 top-1 size-2 rounded-full bg-promo" />
            )}
          </Link>
          <Link
            to="/cart"
            className="market-navbar-bag flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            aria-label={`Bag, ${count} items`}
          >
            <ShoppingBag className="size-4" aria-hidden="true" />
            <span className="market-navbar-bag-label">Your bag</span>{" "}
            <span className="market-navbar-count tabular-nums">{count}</span>
          </Link>
          <div className="hidden md:block">
            <NotificationBell />
          </div>
        </nav>
      </div>
      <div className="market-navbar-mobile-location flex items-center gap-2 border-t border-border px-4 py-2 md:hidden">
        <LocationPicker />
        <div className="ml-auto">
          <NotificationBell />
        </div>
      </div>
      <div className="px-4 pb-3 md:hidden">
        <SearchBox />
      </div>
      <nav aria-label="Categories" className="header-category-nav hidden border-t border-border">
        <ul className="no-scrollbar mx-auto flex max-w-none gap-6 overflow-x-auto px-4 py-2 text-sm md:px-8 xl:px-12">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                to="/category/$slug"
                params={{ slug: c.slug }}
                className="whitespace-nowrap text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-foreground font-medium" }}
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

export function StoreFooter() {
  return (
    <footer className="market-footer text-primary-foreground">
      <div className="footer-content">
        <div>
          <Logo inverse />
          <p className="footer-headline font-display">
            Your neighbourhood,
            <br />
            packed and delivered.
          </p>
          <p className="mt-4 max-w-sm text-sm opacity-80">
            Discover the shops around you. Fill one bag, support independent counters, and keep your
            neighbourhood close.
          </p>
        </div>
        <div>
          <p className="label-stamp opacity-70">Shop</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link to="/categories" className="hover:underline">
                Explore categories
              </Link>
            </li>
            <li>
              <Link to="/search" className="hover:underline">
                All products
              </Link>
            </li>
            <li>
              <Link to="/cart" className="hover:underline">
                Your bag
              </Link>
            </li>
            <li>
              <Link to="/orders" className="hover:underline">
                Track orders
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="label-stamp opacity-70">Work with us</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link to="/seller" className="hover:underline">
                Sell on Just Pack It
              </Link>
            </li>
            <li>
              <Link to="/delivery" className="hover:underline">
                Deliver with us
              </Link>
            </li>
            <li>
              <Link to="/admin" className="hover:underline">
                Operations
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Just Pack It. Pilot programme.</span>
        <span>Your neighbourhood, delivered.</span>
      </div>
    </footer>
  );
}
