import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Images,
  CalendarDays,
  ListOrdered,
  Rocket,
  History,
  Users,
  Settings,
  Bell,
  HelpCircle,
  ChevronDown,
  Circle,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/wallpapers", label: "Wallpaper Library", icon: Images },
  { to: "/campaigns", label: "Campaigns", icon: CalendarDays },
  { to: "/timeline", label: "Timeline & Queue", icon: ListOrdered },
  { to: "/deployment", label: "Deployment", icon: Rocket },
  { to: "/history", label: "History & Audit", icon: History },
  { to: "/users", label: "Users", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="px-5 py-5 flex items-center gap-3 border-b border-border">
          <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="font-bold text-foreground leading-tight">CWCM</div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              Corporate Wallpaper
              <br />
              Campaign Manager
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((item) => {
            const active =
              item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary-soft text-primary"
                    : "text-sidebar-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
              W
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">Widji</div>
              <div className="text-xs text-muted-foreground">Administrator</div>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs">
            <Circle className="h-2 w-2 fill-success text-success" />
            <span className="text-foreground">corp.intra.local</span>
          </div>
          <div className="text-[11px] text-muted-foreground">v1.0.0</div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card flex items-center px-8 gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <button className="relative h-9 w-9 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground">
            <Bell className="h-5 w-5" />
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
              3
            </span>
          </button>
          <button className="h-9 w-9 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground">
            <HelpCircle className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3 pl-3 border-l border-border">
            <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
              W
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">Widji</div>
              <div className="text-xs text-muted-foreground">Administrator</div>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </header>

        <main className="flex-1 p-8 overflow-auto">{children}</main>

        <footer className="border-t border-border bg-card px-8 py-4 text-center text-xs text-muted-foreground">
          Copyright © 2026 Corporate IT. All rights reserved.
        </footer>
      </div>
    </div>
  );
}