import type {
  AppSettings,
  DashboardSummary,
  DeploymentLogItem,
  WallpaperSummary,
  CampaignSummary,
  QueueItem,
  UserSummary,
  ActivityLogItem,
} from "@cwcm/types";

export interface AppState {
  users: UserSummary[];
  wallpapers: WallpaperSummary[];
  campaigns: CampaignSummary[];
  queue: QueueItem[];
  deploymentLogs: DeploymentLogItem[];
  activityLogs: ActivityLogItem[];
  settings: AppSettings;
  dashboard: DashboardSummary;
}
