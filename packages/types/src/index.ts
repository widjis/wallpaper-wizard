export type UserRole = "ADMINISTRATOR" | "OPERATOR" | "VIEWER";

export type CampaignStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export type QueueState = "RUNNING" | "PAUSED";

export type DeploymentResult = "SUCCESS" | "FAILED" | "WARNING";

export type TriggerSource = "SCHEDULER" | "MANUAL" | "RETRY";

export type DeploymentSourceType = "CAMPAIGN" | "DEFAULT_WALLPAPER";

export interface UserSummary {
  id: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface UserMutationPayload {
  username: string;
  password?: string;
  role: UserRole;
  isActive: boolean;
}

export interface WallpaperSummary {
  id: string;
  title: string;
  filename: string;
  description: string | null;
  tags: string[];
  resolution: string;
  width: number;
  height: number;
  sizeBytes: number;
  checksumSha256: string;
  mimeType: string;
  imageUrl: string;
  uploadedAt: string;
  usageStatus: "IN_USE" | "SCHEDULED" | "DRAFT";
  isDefault: boolean;
}

export interface CampaignSummary {
  id: string;
  name: string;
  wallpaperId: string;
  wallpaperTitle: string;
  wallpaperImageUrl: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  priority: number;
  status: CampaignStatus;
}

export interface QueueItem {
  id: string;
  campaignId: string;
  positionLabel: "NOW" | "NEXT";
  name: string;
  scheduleLabel: string;
  wallpaperUrl: string | null;
  status: CampaignStatus;
}

export interface DeploymentLogItem {
  id: string;
  campaignId: string | null;
  campaignName: string;
  wallpaperId: string;
  wallpaperTitle: string;
  wallpaperImageUrl: string;
  startedAt: string;
  finishedAt: string | null;
  durationSeconds: number | null;
  result: DeploymentResult;
  sourceType: DeploymentSourceType;
  triggerSource: TriggerSource;
  operator: string;
  message: string | null;
  targetPath: string;
  targetFilename: string;
  verifiedExists: boolean | null;
  verifiedSizeBytes: number | null;
  verifiedChecksumSha256: string | null;
}

export interface ActivityLogItem {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  actor: string;
}

export interface DashboardSummary {
  currentCampaign: CampaignSummary | null;
  nextCampaign: CampaignSummary | null;
  schedulerStatus: {
    healthy: boolean;
    queueState: QueueState;
    intervalMinutes: number;
    lastRunAt: string | null;
    nextRunAt: string | null;
  };
  deploymentStats: {
    success: number;
    failed: number;
    warning: number;
    total: number;
  };
  recentActivity: ActivityLogItem[];
  systemInfo: {
    sysvolPath: string;
    wallpaperFilename: string;
    serverTime: string;
    defaultWallpaperId: string | null;
    defaultWallpaperTitle: string | null;
  };
}

export interface AppSettings {
  sysvolPath: string;
  wallpaperFilename: string;
  defaultWallpaperId: string | null;
  storageLocation: string;
  schedulerIntervalMinutes: number;
  deploymentTimeoutSeconds: number;
  retryAttempts: number;
  maxUploadSizeMb: number;
  allowedExtensions: string[];
  overwriteExistingWallpaper: boolean;
  autoRetryFailedDeployments: boolean;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserSummary;
}
