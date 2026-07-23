import type { UserRole } from "@cwcm/types";

export function isAdministrator(role: UserRole | string | undefined): boolean {
  return role === "ADMINISTRATOR";
}

export function canManageCampaigns(role: UserRole | string | undefined): boolean {
  return role === "ADMINISTRATOR" || role === "OPERATOR";
}

export function canManageDeployments(role: UserRole | string | undefined): boolean {
  return role === "ADMINISTRATOR" || role === "OPERATOR";
}

export function canManageWallpapers(role: UserRole | string | undefined): boolean {
  return role === "ADMINISTRATOR" || role === "OPERATOR";
}

export function canViewTimeline(role: UserRole | string | undefined): boolean {
  return role === "ADMINISTRATOR" || role === "OPERATOR";
}

export function canViewUsers(role: UserRole | string | undefined): boolean {
  return role === "ADMINISTRATOR";
}

export function canViewSettings(role: UserRole | string | undefined): boolean {
  return role === "ADMINISTRATOR";
}

export function getVisibleNav(role: UserRole | string | undefined) {
  return [
    { to: "/", label: "Dashboard" },
    ...(canManageWallpapers(role) ? [{ to: "/wallpapers", label: "Wallpaper Library" }] : []),
    { to: "/campaigns", label: "Campaigns" },
    ...(canViewTimeline(role) ? [{ to: "/timeline", label: "Timeline & Queue" }] : []),
    ...(canManageDeployments(role) ? [{ to: "/deployment", label: "Deployment" }] : []),
    { to: "/history", label: "History & Audit" },
    ...(canViewUsers(role) ? [{ to: "/users", label: "Users" }] : []),
    ...(canViewSettings(role) ? [{ to: "/settings", label: "Settings" }] : []),
  ] as const;
}
