import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Images,
  CalendarDays,
  ListOrdered,
  Rocket,
  History,
  Users,
  Settings,
  ChevronDown,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getVisibleNav } from "@/lib/roles";

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
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const visibleNav = getVisibleNav(session?.user.role).map((item) => ({
    ...item,
    icon: nav.find((entry) => entry.to === item.to)?.icon ?? LayoutDashboard,
  }));

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="px-5 py-5 flex items-center gap-3 border-b border-border">
          <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-5 w-5"
              stroke="currentColor"
              strokeWidth="2"
            >
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
          {visibleNav.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
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
              <div className="text-sm font-medium truncate">
                {session?.user.username ?? "Guest"}
              </div>
              <div className="text-xs text-muted-foreground">{session?.user.role ?? "Unknown"}</div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await logout();
                await navigate({ to: "/login" });
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Logout
            </button>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Access reflects your current role permissions.
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card flex items-center px-8 gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground leading-tight">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3 pl-3 border-l border-border">
            <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
              W
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">{session?.user.username ?? "Guest"}</div>
              <div className="text-xs text-muted-foreground">{session?.user.role ?? "Unknown"}</div>
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
