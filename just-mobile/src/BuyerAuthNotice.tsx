import { BuyerStateCard } from "./BuyerStateCard";

export function BuyerAuthNotice({ title, copy, warning = false, tone, icon, busyLabel, action, onAction }: {
  title: string;
  copy: string;
  warning?: boolean;
  tone?: "neutral" | "info" | "warning" | "error" | "success";
  icon?: "account" | "lock" | "mail" | "check" | "clock" | "warning";
  busyLabel?: string;
  action?: string;
  onAction?: () => void;
}) {
  const state = tone ?? (warning ? "error" : "info");
  return <BuyerStateCard title={title} copy={copy} tone={state} icon={icon ?? (warning ? "warning" : "lock")} compact={state !== "success"} busyLabel={busyLabel} action={action} onAction={onAction} />;
}
