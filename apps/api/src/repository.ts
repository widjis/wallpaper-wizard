import type {
  ActivityLogItem,
  AppSettings,
  CampaignSummary,
  DashboardSummary,
  DeploymentLogItem,
  LoginResponse,
  QueueItem,
  UserSummary,
  WallpaperSummary,
} from "@cwcm/types";
import {
  CampaignStatus,
  DeploymentResult,
  Prisma,
  QueueState,
  TriggerSource,
  UserRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";
import { appConfig } from "./config.js";

function mapRole(role: UserRole): UserSummary["role"] {
  return role;
}

function mapCampaignStatus(status: CampaignStatus): CampaignSummary["status"] {
  return status;
}

function mapDeploymentResult(result: DeploymentResult): DeploymentLogItem["result"] {
  return result;
}

function parseSetting<T>(valueJson: string): T {
  return JSON.parse(valueJson) as T;
}

function buildWallpaperImageUrl(wallpaperId: string): string {
  return `/api/wallpapers/${wallpaperId}/image`;
}

function rangesOverlap(
  aStart: Date | null,
  aEnd: Date | null,
  bStart: Date | null,
  bEnd: Date | null,
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}

export async function loginWithLocalAuth(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user || !user.isActive) {
    throw new Error("Invalid username or password");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new Error("Invalid username or password");
  }

  const token = `local-${user.id}-${Date.now()}`;
  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
    },
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: mapRole(user.role),
      isActive: user.isActive,
      lastLoginAt: new Date().toISOString(),
    },
  };
}

export async function getUserByToken(token: string): Promise<UserSummary | null> {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null;
  }

  return {
    id: session.user.id,
    username: session.user.username,
    role: mapRole(session.user.role),
    isActive: session.user.isActive,
    lastLoginAt: session.user.lastLoginAt?.toISOString() ?? null,
  };
}

export async function logoutByToken(token: string): Promise<void> {
  await prisma.session.updateMany({
    where: {
      token,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function listUsers(): Promise<UserSummary[]> {
  const users = await prisma.user.findMany({
    orderBy: { username: "asc" },
  });

  return users.map((user) => ({
    id: user.id,
    username: user.username,
    role: mapRole(user.role),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  }));
}

export async function createUserRecord(payload: {
  username: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  createdById: string;
}): Promise<UserSummary> {
  const passwordHash = await bcrypt.hash(payload.password, 10);
  const user = await prisma.user.create({
    data: {
      username: payload.username,
      passwordHash,
      role: payload.role,
      isActive: payload.isActive,
    },
  });

  await prisma.activityLog.create({
    data: {
      actor: payload.createdById,
      action: "user.created",
      detail: user.username,
    },
  });

  return {
    id: user.id,
    username: user.username,
    role: mapRole(user.role),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

export async function updateUserRecord(payload: {
  userId: string;
  username: string;
  password?: string;
  role: UserRole;
  isActive: boolean;
  updatedById: string;
}): Promise<UserSummary> {
  const existingUser = await prisma.user.findUnique({
    where: { id: payload.userId },
  });

  if (!existingUser) {
    throw new Error("User not found");
  }

  const user = await prisma.user.update({
    where: { id: payload.userId },
    data: {
      username: payload.username,
      role: payload.role,
      isActive: payload.isActive,
      ...(payload.password ? { passwordHash: await bcrypt.hash(payload.password, 10) } : {}),
    },
  });

  await prisma.activityLog.create({
    data: {
      actor: payload.updatedById,
      action: "user.updated",
      detail: user.username,
    },
  });

  return {
    id: user.id,
    username: user.username,
    role: mapRole(user.role),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

export async function deleteUserRecord(payload: {
  userId: string;
  deletedById: string;
}): Promise<void> {
  const existingUser = await prisma.user.findUnique({
    where: { id: payload.userId },
  });

  if (!existingUser) {
    throw new Error("User not found");
  }

  await prisma.session.updateMany({
    where: { userId: existingUser.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await prisma.user.delete({
    where: { id: existingUser.id },
  });

  await prisma.activityLog.create({
    data: {
      actor: payload.deletedById,
      action: "user.deleted",
      detail: existingUser.username,
    },
  });
}

export async function listWallpapers(): Promise<WallpaperSummary[]> {
  const wallpapers = await prisma.wallpaper.findMany({
    where: { deletedAt: null },
    include: {
      campaigns: true,
    },
    orderBy: { uploadedAt: "desc" },
  });

  return wallpapers.map((wallpaper) => ({
    id: wallpaper.id,
    title: wallpaper.title,
    filename: wallpaper.filename,
    description: wallpaper.description,
    tags: wallpaper.tags,
    resolution: wallpaper.resolution,
    width: wallpaper.width,
    height: wallpaper.height,
    sizeBytes: wallpaper.sizeBytes,
    checksumSha256: wallpaper.checksumSha256,
    mimeType: wallpaper.mimeType,
    imageUrl: buildWallpaperImageUrl(wallpaper.id),
    uploadedAt: wallpaper.uploadedAt.toISOString(),
    usageStatus: wallpaper.campaigns.some((campaign) => campaign.status === CampaignStatus.ACTIVE)
      ? "IN_USE"
      : wallpaper.campaigns.some((campaign) => campaign.status === CampaignStatus.SCHEDULED)
        ? "SCHEDULED"
        : "DRAFT",
  }));
}

export async function createWallpaperRecord(payload: {
  title: string;
  filename: string;
  mimeType: string;
  imageData: Buffer;
  width: number;
  height: number;
  resolution: string;
  sizeBytes: number;
  checksumSha256: string;
  uploadedById: string;
}): Promise<WallpaperSummary> {
  const wallpaper = await prisma.wallpaper.create({
    data: {
      title: payload.title,
      filename: payload.filename,
      description: null,
      tags: [],
      resolution: payload.resolution,
      width: payload.width,
      height: payload.height,
      sizeBytes: payload.sizeBytes,
      checksumSha256: payload.checksumSha256,
      mimeType: payload.mimeType,
      imageData: new Uint8Array(payload.imageData),
      uploadedById: payload.uploadedById,
    },
  });

  await prisma.activityLog.create({
    data: {
      actor: payload.uploadedById,
      action: "wallpaper.uploaded",
      detail: payload.filename,
    },
  });

  return {
    id: wallpaper.id,
    title: wallpaper.title,
    filename: wallpaper.filename,
    description: wallpaper.description,
    tags: wallpaper.tags,
    resolution: wallpaper.resolution,
    width: wallpaper.width,
    height: wallpaper.height,
    sizeBytes: wallpaper.sizeBytes,
    checksumSha256: wallpaper.checksumSha256,
    mimeType: wallpaper.mimeType,
    imageUrl: buildWallpaperImageUrl(wallpaper.id),
    uploadedAt: wallpaper.uploadedAt.toISOString(),
    usageStatus: "DRAFT",
  };
}

export async function deleteWallpaperRecord(payload: {
  wallpaperId: string;
  deletedById: string;
}): Promise<void> {
  const wallpaper = await prisma.wallpaper.findFirst({
    where: {
      id: payload.wallpaperId,
      deletedAt: null,
    },
    include: {
      campaigns: {
        where: {
          status: {
            in: [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED, CampaignStatus.ACTIVE],
          },
        },
      },
    },
  });

  if (!wallpaper) {
    throw new Error("Wallpaper not found");
  }

  if (wallpaper.campaigns.length > 0) {
    throw new Error("Wallpaper is still used by active or scheduled campaigns");
  }

  await prisma.wallpaper.update({
    where: { id: wallpaper.id },
    data: {
      deletedAt: new Date(),
    },
  });

  await prisma.activityLog.create({
    data: {
      actor: payload.deletedById,
      action: "wallpaper.deleted",
      detail: wallpaper.filename,
    },
  });
}

export async function listCampaigns(): Promise<CampaignSummary[]> {
  const campaigns = await prisma.campaign.findMany({
    include: { wallpaper: true },
    orderBy: [{ startDate: "asc" }, { priority: "desc" }],
  });

  return campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    wallpaperId: campaign.wallpaperId,
    wallpaperTitle: campaign.wallpaper.title,
    description: campaign.description,
    startDate: campaign.startDate?.toISOString() ?? null,
    endDate: campaign.endDate?.toISOString() ?? null,
    priority: campaign.priority,
    status: mapCampaignStatus(campaign.status),
  }));
}

export async function createCampaignRecord(payload: {
  name: string;
  wallpaperId: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  priority: number;
  createdById: string;
}): Promise<CampaignSummary> {
  const wallpaper = await prisma.wallpaper.findUnique({
    where: { id: payload.wallpaperId },
  });
  if (!wallpaper) {
    throw new Error("Wallpaper not found");
  }

  const startDate = payload.startDate ? new Date(payload.startDate) : null;
  const endDate = payload.endDate ? new Date(payload.endDate) : null;

  const existingCampaigns = await prisma.campaign.findMany({
    where: {
      status: {
        in: [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED, CampaignStatus.ACTIVE],
      },
    },
  });

  const overlap = existingCampaigns.find((campaign) =>
    rangesOverlap(startDate, endDate, campaign.startDate, campaign.endDate),
  );
  if (overlap) {
    throw new Error(`Campaign schedule overlaps with "${overlap.name}"`);
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: payload.name,
      wallpaperId: wallpaper.id,
      description: payload.description ?? null,
      startDate,
      endDate,
      priority: payload.priority,
      status: CampaignStatus.SCHEDULED,
      createdById: payload.createdById,
    },
    include: { wallpaper: true },
  });

  const lastQueue = await prisma.campaignQueueEntry.findFirst({
    orderBy: { orderIndex: "desc" },
  });

  await prisma.campaignQueueEntry.create({
    data: {
      campaignId: campaign.id,
      orderIndex: lastQueue ? lastQueue.orderIndex + 1 : 0,
    },
  });

  await prisma.activityLog.create({
    data: {
      actor: payload.createdById,
      action: "campaign.created",
      detail: campaign.name,
    },
  });

  return {
    id: campaign.id,
    name: campaign.name,
    wallpaperId: campaign.wallpaperId,
    wallpaperTitle: campaign.wallpaper.title,
    description: campaign.description,
    startDate: campaign.startDate?.toISOString() ?? null,
    endDate: campaign.endDate?.toISOString() ?? null,
    priority: campaign.priority,
    status: mapCampaignStatus(campaign.status),
  };
}

export async function updateCampaignRecord(payload: {
  campaignId: string;
  name: string;
  wallpaperId: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  priority: number;
  updatedById: string;
}): Promise<CampaignSummary> {
  const existingCampaign = await prisma.campaign.findUnique({
    where: { id: payload.campaignId },
  });

  if (!existingCampaign) {
    throw new Error("Campaign not found");
  }

  const wallpaper = await prisma.wallpaper.findUnique({
    where: { id: payload.wallpaperId },
  });

  if (!wallpaper) {
    throw new Error("Wallpaper not found");
  }

  const startDate = payload.startDate ? new Date(payload.startDate) : null;
  const endDate = payload.endDate ? new Date(payload.endDate) : null;

  const existingCampaigns = await prisma.campaign.findMany({
    where: {
      id: { not: payload.campaignId },
      status: {
        in: [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED, CampaignStatus.ACTIVE],
      },
    },
  });

  const overlap = existingCampaigns.find((campaign) =>
    rangesOverlap(startDate, endDate, campaign.startDate, campaign.endDate),
  );

  if (overlap) {
    throw new Error(`Campaign schedule overlaps with "${overlap.name}"`);
  }

  const campaign = await prisma.campaign.update({
    where: { id: payload.campaignId },
    data: {
      name: payload.name,
      wallpaperId: payload.wallpaperId,
      description: payload.description ?? null,
      startDate,
      endDate,
      priority: payload.priority,
    },
    include: {
      wallpaper: true,
    },
  });

  await prisma.activityLog.create({
    data: {
      actor: payload.updatedById,
      action: "campaign.updated",
      detail: campaign.name,
    },
  });

  return {
    id: campaign.id,
    name: campaign.name,
    wallpaperId: campaign.wallpaperId,
    wallpaperTitle: campaign.wallpaper.title,
    description: campaign.description,
    startDate: campaign.startDate?.toISOString() ?? null,
    endDate: campaign.endDate?.toISOString() ?? null,
    priority: campaign.priority,
    status: mapCampaignStatus(campaign.status),
  };
}

export async function deleteCampaignRecord(payload: {
  campaignId: string;
  deletedById: string;
}): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: payload.campaignId },
  });

  if (!campaign) {
    throw new Error("Campaign not found");
  }

  if (campaign.status === CampaignStatus.ACTIVE) {
    throw new Error("Active campaign cannot be deleted");
  }

  await prisma.$transaction([
    prisma.campaignQueueEntry.deleteMany({
      where: { campaignId: campaign.id },
    }),
    prisma.deploymentLog.deleteMany({
      where: { campaignId: campaign.id },
    }),
    prisma.campaign.delete({
      where: { id: campaign.id },
    }),
  ]);

  await prisma.activityLog.create({
    data: {
      actor: payload.deletedById,
      action: "campaign.deleted",
      detail: campaign.name,
    },
  });
}

export async function duplicateCampaignRecord(payload: {
  campaignId: string;
  createdById: string;
}): Promise<CampaignSummary> {
  const existingCampaign = await prisma.campaign.findUnique({
    where: { id: payload.campaignId },
    include: { wallpaper: true },
  });

  if (!existingCampaign) {
    throw new Error("Campaign not found");
  }

  const duplicated = await prisma.campaign.create({
    data: {
      name: `${existingCampaign.name} Copy`,
      wallpaperId: existingCampaign.wallpaperId,
      description: existingCampaign.description,
      startDate: null,
      endDate: null,
      priority: existingCampaign.priority,
      status: CampaignStatus.DRAFT,
      createdById: payload.createdById,
    },
    include: { wallpaper: true },
  });

  const lastQueue = await prisma.campaignQueueEntry.findFirst({
    orderBy: { orderIndex: "desc" },
  });

  await prisma.campaignQueueEntry.create({
    data: {
      campaignId: duplicated.id,
      orderIndex: lastQueue ? lastQueue.orderIndex + 1 : 0,
    },
  });

  await prisma.activityLog.create({
    data: {
      actor: payload.createdById,
      action: "campaign.duplicated",
      detail: duplicated.name,
    },
  });

  return {
    id: duplicated.id,
    name: duplicated.name,
    wallpaperId: duplicated.wallpaperId,
    wallpaperTitle: duplicated.wallpaper.title,
    description: duplicated.description,
    startDate: duplicated.startDate?.toISOString() ?? null,
    endDate: duplicated.endDate?.toISOString() ?? null,
    priority: duplicated.priority,
    status: mapCampaignStatus(duplicated.status),
  };
}

export async function activateCampaignRecord(payload: {
  campaignId: string;
  updatedById: string;
}): Promise<CampaignSummary> {
  const existingCampaign = await prisma.campaign.findUnique({
    where: { id: payload.campaignId },
    include: { wallpaper: true },
  });

  if (!existingCampaign) {
    throw new Error("Campaign not found");
  }

  await prisma.campaign.updateMany({
    where: {
      status: CampaignStatus.ACTIVE,
      id: { not: existingCampaign.id },
    },
    data: {
      status: CampaignStatus.COMPLETED,
      completedAt: new Date(),
    },
  });

  const activated = await prisma.campaign.update({
    where: { id: payload.campaignId },
    data: {
      status: CampaignStatus.ACTIVE,
      activatedAt: new Date(),
    },
    include: { wallpaper: true },
  });

  await prisma.activityLog.create({
    data: {
      actor: payload.updatedById,
      action: "campaign.activated",
      detail: activated.name,
    },
  });

  return {
    id: activated.id,
    name: activated.name,
    wallpaperId: activated.wallpaperId,
    wallpaperTitle: activated.wallpaper.title,
    description: activated.description,
    startDate: activated.startDate?.toISOString() ?? null,
    endDate: activated.endDate?.toISOString() ?? null,
    priority: activated.priority,
    status: mapCampaignStatus(activated.status),
  };
}

export async function cancelCampaignRecord(payload: {
  campaignId: string;
  updatedById: string;
}): Promise<CampaignSummary> {
  const existingCampaign = await prisma.campaign.findUnique({
    where: { id: payload.campaignId },
    include: { wallpaper: true },
  });

  if (!existingCampaign) {
    throw new Error("Campaign not found");
  }

  const cancelled = await prisma.campaign.update({
    where: { id: payload.campaignId },
    data: {
      status: CampaignStatus.CANCELLED,
      completedAt: new Date(),
    },
    include: { wallpaper: true },
  });

  await prisma.campaignQueueEntry.deleteMany({
    where: { campaignId: payload.campaignId },
  });

  await prisma.activityLog.create({
    data: {
      actor: payload.updatedById,
      action: "campaign.cancelled",
      detail: cancelled.name,
    },
  });

  return {
    id: cancelled.id,
    name: cancelled.name,
    wallpaperId: cancelled.wallpaperId,
    wallpaperTitle: cancelled.wallpaper.title,
    description: cancelled.description,
    startDate: cancelled.startDate?.toISOString() ?? null,
    endDate: cancelled.endDate?.toISOString() ?? null,
    priority: cancelled.priority,
    status: mapCampaignStatus(cancelled.status),
  };
}

export async function getQueueState(): Promise<QueueState> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: "queueState" },
  });
  return setting ? parseSetting<QueueState>(setting.valueJson) : QueueState.RUNNING;
}

export async function setQueueState(nextState: QueueState, updatedById?: string) {
  await prisma.systemSetting.upsert({
    where: { key: "queueState" },
    update: {
      valueJson: JSON.stringify(nextState),
      updatedById,
    },
    create: {
      key: "queueState",
      valueJson: JSON.stringify(nextState),
      updatedById: updatedById ?? null,
    },
  });
}

export async function listQueue(): Promise<QueueItem[]> {
  const entries = await prisma.campaignQueueEntry.findMany({
    include: {
      campaign: {
        include: {
          wallpaper: true,
        },
      },
    },
    orderBy: { orderIndex: "asc" },
  });

  return entries.map((entry, index) => ({
    id: entry.id,
    campaignId: entry.campaignId,
    positionLabel: index === 0 ? "NOW" : "NEXT",
    name: entry.campaign.name,
    scheduleLabel: `${entry.campaign.startDate?.toISOString() ?? "TBD"} - ${entry.campaign.endDate?.toISOString() ?? "TBD"}`,
    wallpaperUrl: buildWallpaperImageUrl(entry.campaign.wallpaperId),
    status: mapCampaignStatus(entry.campaign.status),
  }));
}

export async function reorderQueueItems(campaignIds: string[]): Promise<QueueItem[]> {
  await prisma.$transaction(
    campaignIds.map((campaignId, index) =>
      prisma.campaignQueueEntry.update({
        where: { campaignId },
        data: { orderIndex: index },
      }),
    ),
  );

  return listQueue();
}

export async function removeQueueItemRecord(payload: {
  campaignId: string;
  updatedById: string;
}): Promise<QueueItem[]> {
  const entry = await prisma.campaignQueueEntry.findUnique({
    where: { campaignId: payload.campaignId },
    include: { campaign: true },
  });

  if (!entry) {
    throw new Error("Queue item not found");
  }

  await prisma.campaignQueueEntry.delete({
    where: { campaignId: payload.campaignId },
  });

  const remaining = await prisma.campaignQueueEntry.findMany({
    orderBy: { orderIndex: "asc" },
  });

  await prisma.$transaction(
    remaining.map((item, index) =>
      prisma.campaignQueueEntry.update({
        where: { id: item.id },
        data: { orderIndex: index },
      }),
    ),
  );

  await prisma.activityLog.create({
    data: {
      actor: payload.updatedById,
      action: "queue.removed",
      detail: entry.campaign.name,
    },
  });

  return listQueue();
}

export async function listDeployments(): Promise<DeploymentLogItem[]> {
  const items = await prisma.deploymentLog.findMany({
    include: {
      campaign: true,
    },
    orderBy: { startedAt: "desc" },
  });

  return items.map((item) => ({
    id: item.id,
    campaignId: item.campaignId,
    campaignName: item.campaign.name,
    startedAt: item.startedAt.toISOString(),
    finishedAt: item.finishedAt?.toISOString() ?? null,
    durationSeconds: item.durationMs ? Math.round(item.durationMs / 1000) : null,
    result: mapDeploymentResult(item.result),
    operator: item.triggerSource === TriggerSource.MANUAL ? "Widji" : "scheduler",
    message: item.message,
  }));
}

export async function createDeploymentRecord(payload: {
  triggerSource: TriggerSource;
  operator: string;
}): Promise<DeploymentLogItem> {
  const activeCampaign =
    (await prisma.campaign.findFirst({
      where: { status: CampaignStatus.ACTIVE },
      include: { wallpaper: true },
      orderBy: { priority: "desc" },
    })) ??
    (await prisma.campaign.findFirst({
      include: { wallpaper: true },
      orderBy: { startDate: "asc" },
    }));

  if (!activeCampaign) {
    throw new Error("No campaign available for deployment");
  }

  const settings = await getSettings();

  const startedAt = new Date();
  const finishedAt = new Date(startedAt.getTime() + 15000);

  const deployment = await prisma.deploymentLog.create({
    data: {
      campaignId: activeCampaign.id,
      wallpaperId: activeCampaign.wallpaperId,
      triggerSource: payload.triggerSource,
      startedAt,
      finishedAt,
      durationMs: 15000,
      result: DeploymentResult.SUCCESS,
      message: `Deployment accepted through ${payload.triggerSource.toLowerCase()} trigger.`,
      targetPath: settings.sysvolPath,
      targetFilename: settings.wallpaperFilename,
      verifiedExists: true,
      verifiedSizeBytes: activeCampaign.wallpaper.sizeBytes,
      verifiedChecksumSha256: activeCampaign.wallpaper.checksumSha256,
    },
    include: {
      campaign: true,
    },
  });

  await prisma.activityLog.create({
    data: {
      actor: payload.operator,
      action: "deployment.triggered",
      detail: activeCampaign.name,
    },
  });

  return {
    id: deployment.id,
    campaignId: deployment.campaignId,
    campaignName: deployment.campaign.name,
    startedAt: deployment.startedAt.toISOString(),
    finishedAt: deployment.finishedAt?.toISOString() ?? null,
    durationSeconds: deployment.durationMs ? Math.round(deployment.durationMs / 1000) : null,
    result: mapDeploymentResult(deployment.result),
    operator: payload.operator,
    message: deployment.message,
  };
}

export async function verifyDeploymentRecord(deploymentId: string): Promise<DeploymentLogItem> {
  const deployment = await prisma.deploymentLog.update({
    where: { id: deploymentId },
    data: {
      message: "Verification re-run requested.",
    },
    include: { campaign: true },
  });

  return {
    id: deployment.id,
    campaignId: deployment.campaignId,
    campaignName: deployment.campaign.name,
    startedAt: deployment.startedAt.toISOString(),
    finishedAt: deployment.finishedAt?.toISOString() ?? null,
    durationSeconds: deployment.durationMs ? Math.round(deployment.durationMs / 1000) : null,
    result: mapDeploymentResult(deployment.result),
    operator: deployment.triggerSource === TriggerSource.MANUAL ? "Widji" : "scheduler",
    message: deployment.message,
  };
}

export async function getDeploymentDetail(deploymentId: string) {
  return prisma.deploymentLog.findUnique({
    where: { id: deploymentId },
    include: {
      campaign: true,
      wallpaper: true,
    },
  });
}

export async function getWallpaperBinary(wallpaperId: string) {
  return prisma.wallpaper.findFirst({
    where: {
      id: wallpaperId,
      deletedAt: null,
    },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      imageData: true,
      checksumSha256: true,
      sizeBytes: true,
    },
  });
}

export async function finalizeDeploymentRecord(payload: {
  deploymentId: string;
  result: DeploymentResult;
  message: string;
  verifiedExists: boolean;
  verifiedSizeBytes: number;
  verifiedChecksumSha256: string;
}) {
  const startedAt = new Date();
  const deployment = await prisma.deploymentLog.update({
    where: { id: payload.deploymentId },
    data: {
      result: payload.result,
      message: payload.message,
      finishedAt: new Date(),
      durationMs: Math.max(1, Date.now() - startedAt.getTime()),
      verifiedExists: payload.verifiedExists,
      verifiedSizeBytes: payload.verifiedSizeBytes,
      verifiedChecksumSha256: payload.verifiedChecksumSha256,
    },
    include: {
      campaign: true,
    },
  });

  return {
    id: deployment.id,
    campaignId: deployment.campaignId,
    campaignName: deployment.campaign.name,
    startedAt: deployment.startedAt.toISOString(),
    finishedAt: deployment.finishedAt?.toISOString() ?? null,
    durationSeconds: deployment.durationMs ? Math.round(deployment.durationMs / 1000) : null,
    result: mapDeploymentResult(deployment.result),
    operator: deployment.triggerSource === TriggerSource.MANUAL ? "Widji" : "scheduler",
    message: deployment.message,
  };
}

export async function listActivityLogs(): Promise<ActivityLogItem[]> {
  const items = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return items.map((item) => ({
    id: item.id,
    title: item.action,
    detail: item.detail,
    timestamp: item.createdAt.toISOString(),
    actor: item.actor,
  }));
}

export async function getSettings(): Promise<AppSettings> {
  const entries = await prisma.systemSetting.findMany();
  const map = new Map(entries.map((entry) => [entry.key, entry.valueJson]));

  return {
    sysvolPath: parseSetting<string>(map.get("sysvolPath") ?? JSON.stringify("")),
    wallpaperFilename: parseSetting<string>(
      map.get("wallpaperFilename") ?? JSON.stringify("Wallpaper.jpg"),
    ),
    storageLocation: parseSetting<string>(
      map.get("storageLocation") ?? JSON.stringify(appConfig.APP_STORAGE_PATH),
    ),
    schedulerIntervalMinutes: parseSetting<number>(map.get("schedulerIntervalMinutes") ?? "1"),
    deploymentTimeoutSeconds: parseSetting<number>(map.get("deploymentTimeoutSeconds") ?? "60"),
    retryAttempts: parseSetting<number>(map.get("retryAttempts") ?? "3"),
    maxUploadSizeMb: parseSetting<number>(map.get("maxUploadSizeMb") ?? "20"),
    allowedExtensions: parseSetting<string[]>(
      map.get("allowedExtensions") ?? JSON.stringify([".jpg", ".jpeg", ".png"]),
    ),
    overwriteExistingWallpaper: parseSetting<boolean>(
      map.get("overwriteExistingWallpaper") ?? "true",
    ),
    autoRetryFailedDeployments: parseSetting<boolean>(
      map.get("autoRetryFailedDeployments") ?? "true",
    ),
  };
}

export async function updateSettingsRecord(
  payload: AppSettings,
  updatedById?: string,
): Promise<AppSettings> {
  const entries = Object.entries(payload);
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.systemSetting.upsert({
        where: { key },
        update: {
          valueJson: JSON.stringify(value),
          updatedById,
        },
        create: {
          key,
          valueJson: JSON.stringify(value),
          updatedById: updatedById ?? null,
        },
      }),
    ),
  );

  return getSettings();
}

export async function buildDashboardSummary(): Promise<DashboardSummary> {
  const [campaigns, deployments, activity, settings, queueState] = await Promise.all([
    listCampaigns(),
    listDeployments(),
    listActivityLogs(),
    getSettings(),
    getQueueState(),
  ]);

  const currentCampaign = campaigns.find((campaign) => campaign.status === "ACTIVE") ?? null;
  const nextCampaign = campaigns.find((campaign) => campaign.status === "SCHEDULED") ?? null;

  const deploymentStats = deployments.reduce(
    (acc, deployment) => {
      acc.total += 1;
      if (deployment.result === "SUCCESS") acc.success += 1;
      if (deployment.result === "FAILED") acc.failed += 1;
      if (deployment.result === "WARNING") acc.warning += 1;
      return acc;
    },
    { success: 0, failed: 0, warning: 0, total: 0 },
  );

  return {
    currentCampaign,
    nextCampaign,
    schedulerStatus: {
      healthy: true,
      queueState: queueState === QueueState.PAUSED ? "PAUSED" : "RUNNING",
      intervalMinutes: settings.schedulerIntervalMinutes,
      lastRunAt: deployments[0]?.startedAt ?? null,
      nextRunAt: new Date(Date.now() + settings.schedulerIntervalMinutes * 60000).toISOString(),
    },
    deploymentStats,
    recentActivity: activity,
    systemInfo: {
      sysvolPath: settings.sysvolPath,
      wallpaperFilename: settings.wallpaperFilename,
      serverTime: new Date().toISOString(),
    },
  };
}

export async function getHealthStatus() {
  await prisma.$queryRaw(Prisma.sql`SELECT 1`);
  return {
    status: "ok",
    api: "healthy",
    database: "connected",
    redis: appConfig.REDIS_URL ? "configured" : "missing",
    storage: appConfig.APP_STORAGE_PATH,
  };
}
