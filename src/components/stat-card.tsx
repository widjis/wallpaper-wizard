import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "success" | "info" | "warning" | "primary";

const toneClasses: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning-foreground",
  primary: "bg-primary-soft text-primary",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  badge,
  footer,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: Tone;
  badge?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex gap-4">
      <div className={cn("h-12 w-12 rounded-lg flex items-center justify-center shrink-0", toneClasses[tone])}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-bold text-foreground mt-0.5 truncate">{value}</div>
        {badge && <div className="mt-1.5">{badge}</div>}
        {footer && <div className="mt-2 text-xs text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}