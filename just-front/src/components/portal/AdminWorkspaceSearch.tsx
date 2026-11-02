import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, ArrowUpRight } from "lucide-react";
import type { NavItem } from "./PortalShell";
export function AdminWorkspaceSearch({ items }: { items: NavItem[] }) {
  const root = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState(""),
    [focused, setFocused] = useState(false);
  const matches = items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div
      ref={root}
      className="admin-workspace-search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
      }}
    >
      <Search size={19} aria-hidden="true" />
      <label className="sr-only" htmlFor="admin-workspace-search">
        Search admin workspaces
      </label>
      <UiAttributes>
        <input
          id="admin-workspace-search"
          type="search"
          autoComplete="off"
          placeholder="Find an admin workspace…"
          value={q}
          onFocus={() => setFocused(true)}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (q.trim() && matches.length && (e.key === "Enter" || e.key === "ArrowDown")) {
              e.preventDefault();
              const first =
                root.current?.querySelector<HTMLAnchorElement>(".admin-search-results a");
              if (e.key === "Enter") first?.click();
              else first?.focus();
            }
            if (e.key === "Escape") {
              setQ("");
              setFocused(false);
            }
          }}
          aria-describedby="admin-search-hint"
        />
      </UiAttributes>
      <span id="admin-search-hint" className="sr-only">
        Search navigation sections. Record search is available within each workspace.
      </span>
      {focused && q.trim() && (
        <div className="admin-search-results">
          <p>Admin workspaces · search records inside each section</p>
          {matches.length ? (
            <ul>
              {matches.map((i) => (
                <li key={i.to}>
                  <Link
                    to={i.to}
                    onClick={() => {
                      setQ("");
                      setFocused(false);
                    }}
                  >
                    <UiText>{i.label}</UiText>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status">No matching workspace. Try orders, sellers or catalogue.</p>
          )}
        </div>
      )}
    </div>
  );
}
