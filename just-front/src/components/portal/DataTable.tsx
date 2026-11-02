import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/** Compact table with text filter and client pagination. Swap to server pagination when the API exists. */
export function DataTable<T>({
  rows,
  columns,
  searchText,
  pageSize = 8,
  empty = "No records",
  toolbar,
}: {
  rows: T[];
  columns: Column<T>[];
  searchText?: (r: T) => string;
  pageSize?: number;
  empty?: string;
  toolbar?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const filtered = useMemo(
    () =>
      searchText && q
        ? rows.filter((r) => searchText(r).toLowerCase().includes(q.toLowerCase()))
        : rows,
    [rows, q, searchText],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const view = filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  return (
    <div className="workspace-records">
      <div className="record-toolbar mb-3 flex flex-wrap items-center gap-3">
        {searchText && (
          <label className="relative">
            <span className="sr-only">Search records</span>
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <UiAttributes>
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                placeholder="Filter…"
                className="h-9 w-56 rounded-md border border-input bg-card pl-8 pr-3 text-sm"
              />
            </UiAttributes>
          </label>
        )}
        {toolbar}
      </div>
      <div className="record-table hidden overflow-x-auto border border-border bg-card md:block">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">
            Records, page {currentPage + 1} of {pages}
          </caption>
          <thead className="border-b border-border bg-muted/50 text-left">
            <tr>
              {columns.map((c) => (
                <th
                  scope="col"
                  key={c.key}
                  className={`p-2.5 font-medium text-muted-foreground ${c.className ?? ""}`}
                >
                  {c.header || (
                    <span className="sr-only">
                      <UiText>{"Actions"}</UiText>
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {view.map((r, i) => (
              <tr key={i} className="hover:bg-muted/30">
                {columns.map((c) => (
                  <td key={c.key} className={`p-2.5 ${c.className ?? ""}`}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {view.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">{empty}</p>
        )}
      </div>
      <div className="record-mobile-cards md:hidden">
        {view.map((row, index) => (
          <article key={index} className="record-mobile-card">
            <dl>
              {columns.map((column) => (
                <div key={column.key} className={!column.header ? "record-mobile-actions" : ""}>
                  <dt>{column.header || "Actions"}</dt>
                  <dd>{column.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
        {view.length === 0 && (
          <p className="market-empty-state p-6 text-center text-sm text-muted-foreground">
            {empty}
          </p>
        )}
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </Button>
          <span aria-live="polite">
            {currentPage + 1} / {pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage >= pages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            <UiText>{"Next"}</UiText>
          </Button>
        </div>
      )}
    </div>
  );
}
