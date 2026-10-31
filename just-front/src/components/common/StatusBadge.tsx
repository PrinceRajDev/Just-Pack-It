import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "progress" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-secondary text-secondary-foreground border-primary/20",
  progress: "bg-citrus/30 text-citrus-foreground border-citrus",
  success: "bg-success/12 text-success border-success/30",
  warning: "bg-warning/15 text-foreground border-warning/50",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
};

const map: Record<string, [string, Tone]> = {
  placed: ["New", "info"],
  accepted: ["Accepted", "progress"],
  preparing: ["Preparing", "progress"],
  ready: ["Ready for pickup", "warning"],
  picked_up: ["Picked up", "progress"],
  out_for_delivery: ["Out for delivery", "progress"],
  delivered: ["Delivered", "success"],
  cancelled: ["Cancelled", "danger"],
  delivery_failed: ["Delivery failed", "danger"],
  failed: ["Failed", "danger"],
  available: ["Available", "info"],
  assigned: ["Assigned to you", "warning"],
  pending: ["Pending", "warning"],
  approved: ["Approved", "success"],
  rejected: ["Rejected", "danger"],
  open: ["Open", "warning"],
  resolved: ["Resolved", "success"],
  active: ["Active", "success"],
  archived: ["Archived", "neutral"],
  unavailable: ["Unavailable", "neutral"],
  low: ["Low stock", "warning"],
  out: ["Out of stock", "danger"],
};

export function StatusBadge({
  status,
  label,
  tone,
  className,
}: {
  status?: string;
  label?: string;
  tone?: Tone;
  className?: string;
}) {
  const [l, t] = status && map[status] ? map[status] : [label ?? status ?? "", "neutral" as Tone];
  return (
    <span
      className={cn(
        "status-badge inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium",
        tones[tone ?? t],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label ?? l}
    </span>
  );
}
