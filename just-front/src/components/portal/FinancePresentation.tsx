import { UiText } from "@/lib/i18n/Language";
import type { ReactNode } from "react";
import { BookOpen, CreditCard, RotateCcw } from "lucide-react";

export function FinancialTable<T>({
  rows,
  rowKey,
  columns,
}: {
  rows: T[];
  rowKey: (row: T) => string;
  columns: { title: string; cell: (row: T) => ReactNode }[];
}) {
  return (
    <div className="finance-table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.title} scope="col">
                <UiText>{c.title}</UiText>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.title} data-label={c.title}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function FinanceEmpty({
  kind,
  title,
  children,
}: {
  kind: "ledger" | "payments" | "refunds";
  title: string;
  children: ReactNode;
}) {
  const Icon = kind === "ledger" ? BookOpen : kind === "payments" ? CreditCard : RotateCcw;
  return (
    <div className="finance-empty">
      <Icon aria-hidden="true" />
      <div>
        <h3>
          <UiText>{title}</UiText>
        </h3>
        <p>{children}</p>
      </div>
    </div>
  );
}
