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
import { directory, InvalidLogin } from "./directory.js";
import { verifyAssignedCredentials } from "./assigned-auth.js";
import { randomBytes } from "node:crypto";
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

async function upsertSystemSetting(key: string, value: unknown, updatedById?: string) {
  await prisma.systemSetting.upsert({
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
  });
}

async function getSystemSetting<T>(key: string, fallback: T): Promise<T> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key },
  });

  return setting ? parseSetting<T>(setting.valueJson) : fallback;
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

function normalizeCampaignTimeZone(timeZone: string | null | undefined): string | null {
  if (!timeZone) {
    return null;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    throw new Error(`Unsupported campaign timezone "${timeZone}"`);
  }
}

function deriveCampaignStatus(options: {
  startDate: Date | null;
  endDate: Date | null;
  previousStatus?: CampaignStatus;
  referenceDate?: Date;
}): CampaignStatus {
  const referenceDate = options.referenceDate ?? new Date();

  if (!options.startDate || !options.endDate) {
    return options.previousStatus === CampaignStatus.ACTIVE
      ? CampaignStatus.ACTIVE
      : CampaignStatus.DRAFT;
  }

  if (options.startDate.getTime() > options.endDate.getTime()) {
    throw new Error("Campaign end date must be after start date");
  }

  if (options.endDate.getTime() < referenceDate.getTime()) {
    return CampaignStatus.COMPLETED;
  }

  if (options.previousStatus === CampaignStatus.ACTIVE) {
    return CampaignStatus.ACTIVE;
  }

  return CampaignStatus.SCHEDULED;
}

function buildCampaignResponse(
  campaign: Prisma.CampaignGetPayload<{
    include: {
      wallpaper: { select: { title: true } };
    };
  }>,
): CampaignSummary {
  return {
    id: campaign.id,
    name: campaign.name,
    wallpaperId: campaign.wallpaperId,
    wallpaperTitle: campaign.wallpaper.title,
    wallpaperImageUrl: buildWallpaperImageUrl(campaign.wallpaperId),
    description: campaign.description,
    startDate: campaign.startDate?.toISOString() ?? null,
    endDate: campaign.endDate?.toISOString() ?? null,
    timeZone: campaign.timeZone ?? null,
    priority: campaign.priority,
    status: mapCampaignStatus(campaign.status),
  };
}

function mapDeploymentSourceType(campaignId: string | null): DeploymentLogItem["sourceType"] {
  return campaignId ? "CAMPAIGN" : "DEFAULT_WALLPAPER";
}

function buildDeploymentResponse(
  item: Prisma.DeploymentLogGetPayload<{
    include: {
      campaign: true;
      wallpaper: { select: { title: true } };
    };
  }>,
  operatorOverride?: string,
): DeploymentLogItem {
  return {
    id: item.id,
    campaignId: item.campaignId,
    campaignName: item.campaign?.name ?? "Default wallpaper",
    wallpaperId: item.wallpaperId,
    wallpaperTitle: item.wallpaper.title,
    wallpaperImageUrl: buildWallpaperImageUrl(item.wallpaperId),
    startedAt: item.startedAt.toISOString(),
    finishedAt: item.finishedAt?.toISOString() ?? null,
    durationSeconds: item.durationMs ? Math.round(item.durationMs / 1000) : null,
    result: mapDeploymentResult(item.result),
    sourceType: mapDeploymentSourceType(item.campaignId),
    triggerSource: item.triggerSource,
    operator:
      operatorOverride ?? (item.triggerSource === TriggerSource.MANUAL ? "Widji" : "scheduler"),
    message: item.message,
    targetPath: item.targetPath,
    targetFilename: item.targetFilename,
    verifiedExists: item.verifiedExists,
    verifiedSizeBytes: item.verifiedSizeBytes,
    verifiedChecksumSha256: item.verifiedChecksumSha256,
  };
}

async function completeExpiredActiveCampaigns(now: Date, actor: string) {
  const expiredCampaigns = await prisma.campaign.findMany({
    where: {
      status: CampaignStatus.ACTIVE,
      endDate: { lt: now },
    },
  });

  if (!expiredCampaigns.length) {
    return;
  }

  const expiredIds = expiredCampaigns.map((campaign) => campaign.id);

  await prisma.$transaction([
    prisma.campaign.updateMany({
      where: {
        id: { in: expiredIds },
      },
      data: {
        status: CampaignStatus.COMPLETED,
        completedAt: now,
      },
    }),
    prisma.campaignQueueEntry.deleteMany({
      where: {
        campaignId: { in: expiredIds },
      },
    }),
    prisma.activityLog.createMany({
      data: expiredCampaigns.map((campaign) => ({
        actor,
        action: "campaign.completed",
        detail: campaign.name,
      })),
    }),
  ]);
}

export async function resolveDeploymentSource(actor: string) {
  const now = new Date();

  await completeExpiredActiveCampaigns(now, actor);

  const activeCampaign = await prisma.campaign.findFirst({
    where: {
      status: CampaignStatus.ACTIVE,
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    include: { wallpaper: true },
    orderBy: [{ priority: "desc" }, { startDate: "asc" }],
  });

  if (activeCampaign) {
    return {
      campaignId: activeCampaign.id,
      campaignName: activeCampaign.name,
      wallpaper: activeCampaign.wallpaper,
      activityDetail: activeCampaign.name,
    };
  }

  const scheduledCampaign = await prisma.campaign.findFirst({
    where: {
      status: CampaignStatus.SCHEDULED,
      AND: [
        {
          OR: [{ startDate: null }, { startDate: { lte: now } }],
        },
        {
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
      ],
    },
    include: { wallpaper: true },
    orderBy: [{ priority: "desc" }, { startDate: "asc" }],
  });

  if (scheduledCampaign) {
    const activated = await prisma.campaign.update({
      where: { id: scheduledCampaign.id },
      data: {
        status: CampaignStatus.ACTIVE,
        activatedAt: now,
      },
      include: { wallpaper: true },
    });

    await prisma.activityLog.create({
      data: {
        actor,
        action: "campaign.activated",
        detail: activated.name,
      },
    });

    return {
      campaignId: activated.id,
      campaignName: activated.name,
      wallpaper: activated.wallpaper,
      activityDetail: activated.name,
    };
  }

  const settings = await getSettings();
  if (!settings.defaultWallpaperId) {
    throw new Error("No active campaign and no default wallpaper configured");
  }

  const defaultWallpaper = await prisma.wallpaper.findFirst({
    where: {
      id: settings.defaultWallpaperId,
      deletedAt: null,
    },
  });

  if (!defaultWallpaper) {
    throw new Error("Configured default wallpaper not found");
  }

  return {
    campaignId: null,
    campaignName: "Default wallpaper",
    wallpaper: defaultWallpaper,
    activityDetail: `Default wallpaper: ${defaultWallpaper.title}`,
  };
}

export interface SchedulerRuntimeState {
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastHeartbeatAt: string | null;
  lastOutcome: "SUCCESS" | "FAILED" | "SKIPPED" | null;
  lastError: string | null;
}

export async function getSchedulerRuntimeState(): Promise<SchedulerRuntimeState> {
  const [lastRunAt, nextRunAt, lastHeartbeatAt, lastOutcome, lastError] = await Promise.all([
    getSystemSetting<string | null>("schedulerLastRunAt", null),
    getSystemSetting<string | null>("schedulerNextRunAt", null),
    getSystemSetting<string | null>("schedulerLastHeartbeatAt", null),
    getSystemSetting<SchedulerRuntimeState["lastOutcome"]>("schedulerLastOutcome", null),
    getSystemSetting<string | null>("schedulerLastError", null),
  ]);

  return {
    lastRunAt,
    nextRunAt,
    lastHeartbeatAt,
    lastOutcome,
    lastError,
  };
}

export async function updateSchedulerRuntimeState(
  payload: Partial<SchedulerRuntimeState>,
  updatedById?: string,
) {
  await Promise.all(
    Object.entries(payload).map(([key, value]) =>
      upsertSystemSetting(
        `scheduler${key.charAt(0).toUpperCase()}${key.slice(1)}`,
        value ?? null,
        updatedById,
      ),
    ),
  );
}

export async function markSchedulerHeartbeat() {
  await updateSchedulerRuntimeState({
    lastHeartbeatAt: new Date().toISOString(),
  });
}

export async function scheduleNextSchedulerRun(referenceDate = new Date()) {
  const settings = await getSettings();
  const queueState = await getQueueState();

  await updateSchedulerRuntimeState({
    nextRunAt:
      queueState === QueueState.PAUSED
        ? null
        : new Date(
            referenceDate.getTime() + settings.schedulerIntervalMinutes * 60_000,
          ).toISOString(),
  });
}

export async function loginWithAssignedAuth(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const matches = await prisma.user.findMany({
    where: { username: { equals: username.trim(), mode: "insensitive" } },
    take: 2,
  });
  const user = matches.length === 1 ? matches[0] : null;
  await verifyAssignedCredentials(user, password);
  if (!user) throw new InvalidLogin();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const lastLoginAt = new Date();
  try {
    await prisma.$transaction(
      async (tx) => {
        const current = await tx.user.findUnique({ where: { id: user.id } });
        if (
          !current ||
          !current.isActive ||
          current.deletedAt ||
          current.updatedAt.getTime() !== user.updatedAt.getTime()
        )
          throw new InvalidLogin();
        // PostgreSQL serializes this write and session INSERT against the Users
        // update + revocation transaction, including across API processes.
        await tx.user.update({
          where: { id: user.id },
          data: { lastLoginAt, updatedAt: current.updatedAt },
        });
        await tx.session.create({ data: { userId: user.id, token, expiresAt } });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    // Do not retry already-verified credentials against a changed account.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      throw new InvalidLogin();
    throw error;
  }

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    user: {
      id: user.id,
      username: user.username,
      authSource: user.authSource as "LOCAL" | "AD",
      role: mapRole(user.role),
      isActive: user.isActive,
      lastLoginAt: lastLoginAt.toISOString(),
    },
  };
}

export async function getSessionByToken(
  token: string,
): Promise<{ user: UserSummary; expiresAt: string } | null> {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt < new Date() ||
    !session.user.isActive ||
    session.user.deletedAt
  ) {
    return null;
  }

  return {
    expiresAt: session.expiresAt.toISOString(),
    user: {
      id: session.user.id,
      username: session.user.username,
      authSource: session.user.authSource as "LOCAL" | "AD",
      role: mapRole(session.user.role),
      isActive: session.user.isActive,
      lastLoginAt: session.user.lastLoginAt?.toISOString() ?? null,
    },
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
    where: { deletedAt: null },
    orderBy: { username: "asc" },
  });

  return users.map((user) => ({
    id: user.id,
    username: user.username,
    authSource: user.authSource as "LOCAL" | "AD",
    role: mapRole(user.role),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  }));
}

export async function createUserRecord(payload: {
  username: string;
  password?: string;
  authSource?: "LOCAL" | "AD";
  role: UserRole;
  isActive: boolean;
  createdById: string;
}): Promise<UserSummary> {
  const authSource = payload.authSource ?? "LOCAL";
  const username = payload.username.trim();
  if (authSource === "LOCAL" && (!payload.password || payload.password.length < 6))
    throw new Error("Local accounts require a password of at least 6 characters.");
  if (authSource === "AD" && payload.password)
    throw new Error("AD passwords must not be entered in Users.");
  const identity = authSource === "AD" ? await directory.lookup(username) : null;
  const passwordHash = await bcrypt.hash(
    authSource === "AD" ? randomBytes(48).toString("base64url") : payload.password!,
    10,
  );
  const user = await prisma.$transaction(
    async (tx) => {
      if (
        await tx.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } } })
      )
        throw new Error("An account with this username already exists.");
      const user = await tx.user.create({
        data: {
          username,
          passwordHash,
          authSource,
          adObjectId: identity?.objectId ?? null,
          role: payload.role,
          isActive: payload.isActive,
        },
      });
      await tx.activityLog.create({
        data: {
          actor: payload.createdById,
          action: "user.created",
          detail: `${username} (${authSource})`,
        },
      });
      return user;
    },
    { isolationLevel: "Serializable" },
  );
  return {
    id: user.id,
    username: user.username,
    authSource,
    role: mapRole(user.role),
    isActive: user.isActive,
    lastLoginAt: null,
  };
}

export async function updateUserRecord(payload: {
  userId: string;
  username: string;
  password?: string;
  authSource?: "LOCAL" | "AD";
  role: UserRole;
  isActive: boolean;
  updatedById: string;
}): Promise<UserSummary> {
  const existing = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!existing || existing.deletedAt) throw new Error("User not found");
  const authSource = payload.authSource ?? existing.authSource;
  const username = payload.username.trim();
  if (authSource === "AD" && payload.password)
    throw new Error("AD passwords must not be entered in Users.");
  if (authSource === "LOCAL" && existing.authSource !== "LOCAL" && !payload.password)
    throw new Error("Set a new local password when switching from AD.");
  // Role/status-only changes remain possible during an AD outage, particularly access revocation.
  const reassignment =
    authSource === "AD" &&
    (existing.authSource !== "AD" || username.toLowerCase() !== existing.username.toLowerCase());
  const identity = reassignment ? await directory.lookup(username) : null;
  const adObjectId = authSource === "AD" ? (identity?.objectId ?? existing.adObjectId) : null;
  if (authSource === "AD" && !adObjectId)
    throw new Error("Reassign this AD account before enabling access.");
  const passwordHash =
    authSource === "AD" && existing.authSource !== "AD"
      ? await bcrypt.hash(randomBytes(48).toString("base64url"), 10)
      : payload.password
        ? await bcrypt.hash(payload.password, 10)
        : existing.passwordHash;
  const user = await prisma.$transaction(
    async (tx) => {
      const latest = await tx.user.findUnique({ where: { id: existing.id } });
      if (
        !latest ||
        latest.deletedAt ||
        latest.updatedAt.getTime() !== existing.updatedAt.getTime()
      )
        throw new Error("This account changed. Reload Users and try again.");
      if (
        await tx.user.findFirst({
          where: { id: { not: existing.id }, username: { equals: username, mode: "insensitive" } },
        })
      )
        throw new Error("An account with this username already exists.");
      if (
        existing.role === "ADMINISTRATOR" &&
        existing.isActive &&
        (payload.role !== "ADMINISTRATOR" ||
          !payload.isActive ||
          (existing.authSource === "LOCAL" && authSource !== "LOCAL"))
      ) {
        const count = await tx.user.count({
          where: {
            id: { not: existing.id },
            role: "ADMINISTRATOR",
            isActive: true,
            deletedAt: null,
            ...(existing.authSource === "LOCAL" ? { authSource: "LOCAL" } : {}),
          },
        });
        if (!count) throw new Error("Keep at least one active local Administrator for recovery.");
      }
      const result = await tx.user.update({
        where: { id: existing.id },
        data: {
          username,
          authSource,
          adObjectId,
          passwordHash,
          role: payload.role,
          isActive: payload.isActive,
          // updatedAt is the authentication revision, not merely wall-clock time.
          // Advance even for no-op access saves and same-millisecond updates.
          updatedAt: new Date(Math.max(Date.now(), latest.updatedAt.getTime() + 1)),
        },
      });
      await tx.session.updateMany({
        where: { userId: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.activityLog.create({
        data: {
          actor: payload.updatedById,
          action: "user.updated",
          detail: `${username} (${authSource}); sessions revoked`,
        },
      });
      return result;
    },
    { isolationLevel: "Serializable" },
  );
  return {
    id: user.id,
    username: user.username,
    authSource: user.authSource as "LOCAL" | "AD",
    role: mapRole(user.role),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

export async function deleteUserRecord(payload: {
  userId: string;
  deletedById: string;
}): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.user.findUnique({ where: { id: payload.userId } });
      if (!existing) throw new Error("User not found");
      if (existing.deletedAt) return;
      if (existing.id === payload.deletedById)
        throw new Error("You cannot delete your own account");
      if (existing.role === "ADMINISTRATOR" && existing.isActive) {
        const others = await tx.user.count({
          where: {
            id: { not: existing.id },
            role: "ADMINISTRATOR",
            isActive: true,
            deletedAt: null,
            ...(existing.authSource === "LOCAL" ? { authSource: "LOCAL" } : {}),
          },
        });
        if (!others) throw new Error("Keep at least one active local Administrator for recovery.");
      }
      const deletedAt = new Date();
      await tx.session.updateMany({
        where: { userId: existing.id, revokedAt: null },
        data: { revokedAt: deletedAt },
      });
      await tx.user.update({ where: { id: existing.id }, data: { isActive: false, deletedAt } });
      await tx.activityLog.create({
        data: { actor: payload.deletedById, action: "user.deleted", detail: existing.username },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

export async function listWallpapers(): Promise<WallpaperSummary[]> {
  const settings = await getSettings();
  const wallpapers = await prisma.wallpaper.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      title: true,
      filename: true,
      description: true,
      tags: true,
      resolution: true,
      width: true,
      height: true,
      sizeBytes: true,
      checksumSha256: true,
      mimeType: true,
      uploadedAt: true,
      uploadedBy: { select: { username: true } },
      campaigns: {
        select: { id: true, name: true, status: true, startDate: true, endDate: true },
      },
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
    uploadedBy: wallpaper.uploadedBy.username,
    campaigns: wallpaper.campaigns.map((c) => ({
      ...c,
      startDate: c.startDate?.toISOString() ?? null,
      endDate: c.endDate?.toISOString() ?? null,
    })),
    isDefault: settings.defaultWallpaperId === wallpaper.id,
    usageStatus: wallpaper.campaigns.some((campaign) => campaign.status === CampaignStatus.ACTIVE)
      ? "IN_USE"
      : wallpaper.campaigns.some((campaign) => campaign.status === CampaignStatus.SCHEDULED)
        ? "SCHEDULED"
        : "DRAFT",
  }));
}

export async function createWallpaperRecord(payload: {
  title: string;
  description?: string | null;
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
      description: payload.description ?? null,
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
    isDefault: false,
    usageStatus: "DRAFT",
  };
}

export async function deleteWallpaperRecord(payload: {
  wallpaperId: string;
  deletedById: string;
}): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const wallpaper = await tx.wallpaper.findFirst({
        where: { id: payload.wallpaperId, deletedAt: null },
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
      if (!wallpaper) throw new Error("Wallpaper not found");
      const setting = await tx.systemSetting.findUnique({ where: { key: "defaultWallpaperId" } });
      if (setting && JSON.parse(setting.valueJson) === wallpaper.id)
        throw new Error(
          "This is the default wallpaper. Choose a different default before deleting it.",
        );
      if (wallpaper.campaigns.length)
        throw new Error(
          "Wallpaper is used by a draft, scheduled, or active campaign. Review its campaigns before deleting.",
        );
      await tx.wallpaper.update({ where: { id: wallpaper.id }, data: { deletedAt: new Date() } });
      await tx.activityLog.create({
        data: {
          actor: payload.deletedById,
          action: "wallpaper.deleted",
          detail: wallpaper.filename,
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

export async function listCampaigns(): Promise<CampaignSummary[]> {
  const campaigns = await prisma.campaign.findMany({
    include: {
      wallpaper: {
        select: { title: true },
      },
    },
    orderBy: [{ startDate: "asc" }, { priority: "desc" }],
  });

  return campaigns.map((campaign) => buildCampaignResponse(campaign));
}

export async function createCampaignRecord(payload: {
  name: string;
  wallpaperId: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  timeZone?: string | null;
  priority: number;
  createdById: string;
}): Promise<CampaignSummary> {
  const wallpaper = await prisma.wallpaper.findUnique({
    where: { id: payload.wallpaperId },
  });
  if (!wallpaper || wallpaper.deletedAt) {
    throw new Error("Wallpaper not found");
  }

  const startDate = payload.startDate ? new Date(payload.startDate) : null;
  const endDate = payload.endDate ? new Date(payload.endDate) : null;
  const timeZone = normalizeCampaignTimeZone(payload.timeZone);
  const status = deriveCampaignStatus({ startDate, endDate });

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
      timeZone,
      priority: payload.priority,
      status,
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

  return buildCampaignResponse(campaign);
}

export async function updateCampaignRecord(payload: {
  campaignId: string;
  name: string;
  wallpaperId: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  timeZone?: string | null;
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

  if (!wallpaper || wallpaper.deletedAt) {
    throw new Error("Wallpaper not found");
  }

  const startDate = payload.startDate ? new Date(payload.startDate) : null;
  const endDate = payload.endDate ? new Date(payload.endDate) : null;
  const timeZone = normalizeCampaignTimeZone(payload.timeZone);
  const status = deriveCampaignStatus({
    startDate,
    endDate,
    previousStatus: existingCampaign.status,
  });

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
      timeZone,
      priority: payload.priority,
      status,
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

  return buildCampaignResponse(campaign);
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
      timeZone: existingCampaign.timeZone,
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

  return buildCampaignResponse(duplicated);
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

  return buildCampaignResponse(activated);
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

  return buildCampaignResponse(cancelled);
}

export async function getQueueState(): Promise<QueueState> {
  return getSystemSetting<QueueState>("queueState", QueueState.RUNNING);
}

export async function setQueueState(nextState: QueueState, updatedById?: string) {
  await upsertSystemSetting("queueState", nextState, updatedById);
  if (nextState === QueueState.PAUSED) {
    await updateSchedulerRuntimeState({
      nextRunAt: null,
    });
    return;
  }

  await scheduleNextSchedulerRun();
}

export async function listQueue(): Promise<QueueItem[]> {
  const entries = await prisma.campaignQueueEntry.findMany({
    include: {
      campaign: true,
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

export async function listDeployments(options?: { page?: number; limit?: number }): Promise<{
  items: DeploymentLogItem[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}> {
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(250, Math.max(1, options?.limit ?? 100));
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    prisma.deploymentLog.count(),
    prisma.deploymentLog.findMany({
      include: {
        campaign: true,
        wallpaper: {
          select: { title: true },
        },
      },
      orderBy: { startedAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    items: items.map((item) => buildDeploymentResponse(item)),
    total,
    page,
    limit,
    pageCount: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function createDeploymentRecord(payload: {
  triggerSource: TriggerSource;
  operator: string;
}): Promise<DeploymentLogItem> {
  const source = await resolveDeploymentSource(payload.operator);
  const settings = await getSettings();

  const startedAt = new Date();

  const deployment = await prisma.deploymentLog.create({
    data: {
      campaignId: source.campaignId,
      wallpaperId: source.wallpaper.id,
      triggerSource: payload.triggerSource,
      startedAt,
      finishedAt: null,
      durationMs: null,
      result: DeploymentResult.WARNING,
      message:
        source.campaignId === null
          ? `Deployment started through ${payload.triggerSource.toLowerCase()} trigger using default wallpaper.`
          : `Deployment started through ${payload.triggerSource.toLowerCase()} trigger.`,
      targetPath: settings.sysvolPath,
      targetFilename: settings.wallpaperFilename,
      verifiedExists: null,
      verifiedSizeBytes: null,
      verifiedChecksumSha256: null,
    },
    include: {
      campaign: true,
      wallpaper: true,
    },
  });

  await prisma.activityLog.create({
    data: {
      actor: payload.operator,
      action: "deployment.triggered",
      detail: source.activityDetail,
    },
  });

  return buildDeploymentResponse(deployment, payload.operator);
}

export async function verifyDeploymentRecord(deploymentId: string): Promise<DeploymentLogItem> {
  const deployment = await prisma.deploymentLog.update({
    where: { id: deploymentId },
    data: {
      message: "Verification re-run requested.",
    },
    include: { campaign: true, wallpaper: true },
  });

  return buildDeploymentResponse(deployment);
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
      wallpaper: true,
    },
  });

  return buildDeploymentResponse(deployment);
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
  return {
    sysvolPath: await getSystemSetting<string>("sysvolPath", ""),
    wallpaperFilename: await getSystemSetting<string>("wallpaperFilename", "Wallpaper.jpg"),
    defaultWallpaperId: await getSystemSetting<string | null>("defaultWallpaperId", null),
    storageLocation: await getSystemSetting<string>("storageLocation", appConfig.APP_STORAGE_PATH),
    schedulerIntervalMinutes: await getSystemSetting<number>("schedulerIntervalMinutes", 1),
    deploymentTimeoutSeconds: await getSystemSetting<number>("deploymentTimeoutSeconds", 60),
    retryAttempts: await getSystemSetting<number>("retryAttempts", 3),
    maxUploadSizeMb: await getSystemSetting<number>("maxUploadSizeMb", 20),
    allowedExtensions: await getSystemSetting<string[]>("allowedExtensions", [
      ".jpg",
      ".jpeg",
      ".png",
    ]),
    overwriteExistingWallpaper: await getSystemSetting<boolean>("overwriteExistingWallpaper", true),
    autoRetryFailedDeployments: await getSystemSetting<boolean>("autoRetryFailedDeployments", true),
  };
}

export async function updateSettingsRecord(
  payload: AppSettings,
  updatedById?: string,
): Promise<AppSettings> {
  if (payload.defaultWallpaperId) {
    const wallpaper = await prisma.wallpaper.findFirst({
      where: {
        id: payload.defaultWallpaperId,
        deletedAt: null,
      },
    });

    if (!wallpaper) {
      throw new Error("Default wallpaper not found");
    }
  }

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

  await scheduleNextSchedulerRun();

  return getSettings();
}

export async function buildDashboardSummary(): Promise<DashboardSummary> {
  const [campaigns, deploymentCounts, activity, settings, queueState, schedulerRuntime] =
    await Promise.all([
      listCampaigns(),
      prisma.deploymentLog.groupBy({
        by: ["result"],
        _count: { _all: true },
      }),
      listActivityLogs(),
      getSettings(),
      getQueueState(),
      getSchedulerRuntimeState(),
    ]);
  const defaultWallpaper = settings.defaultWallpaperId
    ? await prisma.wallpaper.findFirst({
        where: {
          id: settings.defaultWallpaperId,
          deletedAt: null,
        },
      })
    : null;

  const currentCampaign = campaigns.find((campaign) => campaign.status === "ACTIVE") ?? null;
  const nextCampaign = campaigns.find((campaign) => campaign.status === "SCHEDULED") ?? null;

  const deploymentStats = deploymentCounts.reduce(
    (acc, deployment) => {
      const count = deployment._count._all;
      acc.total += count;
      if (deployment.result === "SUCCESS") acc.success += count;
      if (deployment.result === "FAILED") acc.failed += count;
      if (deployment.result === "WARNING") acc.warning += count;
      return acc;
    },
    { success: 0, failed: 0, warning: 0, total: 0 },
  );

  return {
    currentCampaign,
    nextCampaign,
    schedulerStatus: {
      healthy: Boolean(
        schedulerRuntime.lastHeartbeatAt &&
        Date.now() - new Date(schedulerRuntime.lastHeartbeatAt).getTime() <=
          Math.max(settings.schedulerIntervalMinutes * 120_000, 90_000),
      ),
      queueState: queueState === QueueState.PAUSED ? "PAUSED" : "RUNNING",
      intervalMinutes: settings.schedulerIntervalMinutes,
      lastRunAt: schedulerRuntime.lastRunAt,
      nextRunAt: schedulerRuntime.nextRunAt,
    },
    deploymentStats,
    recentActivity: activity,
    systemInfo: {
      sysvolPath: settings.sysvolPath,
      wallpaperFilename: settings.wallpaperFilename,
      serverTime: new Date().toISOString(),
      defaultWallpaperId: settings.defaultWallpaperId,
      defaultWallpaperTitle: defaultWallpaper?.title ?? null,
    },
  };
}

export async function getHealthStatus() {
  await prisma.$queryRaw(Prisma.sql`SELECT 1`);
  const schedulerRuntime = await getSchedulerRuntimeState();
  return {
    status: "ok",
    api: "healthy",
    database: "connected",
    redis: appConfig.REDIS_URL ? "configured" : "missing",
    storage: appConfig.APP_STORAGE_PATH,
    scheduler:
      schedulerRuntime.lastHeartbeatAt &&
      Date.now() - new Date(schedulerRuntime.lastHeartbeatAt).getTime() <= 90_000
        ? "running"
        : "stale",
  };
}

export async function updateWallpaperDetails(
  wallpaperId: string,
  details: { title: string; description?: string | null },
  actor: string,
) {
  const result = await prisma.$transaction(async (tx) => {
    const changed = await tx.wallpaper.updateMany({
      where: { id: wallpaperId, deletedAt: null },
      data: details,
    });
    if (!changed.count) return false;
    await tx.activityLog.create({
      data: { actor, action: "wallpaper.updated", detail: details.title },
    });
    return true;
  });
  return result ? (await listWallpapers()).find((w) => w.id === wallpaperId) : null;
}

export async function setDefaultWallpaper(wallpaperId: string, actor: string) {
  const result = await prisma.$transaction(
    async (tx) => {
      const wallpaper = await tx.wallpaper.findFirst({
        where: { id: wallpaperId, deletedAt: null },
      });
      if (!wallpaper) return false;
      await tx.systemSetting.upsert({
        where: { key: "defaultWallpaperId" },
        create: {
          key: "defaultWallpaperId",
          valueJson: JSON.stringify(wallpaperId),
          updatedById: actor,
        },
        update: { valueJson: JSON.stringify(wallpaperId), updatedById: actor },
      });
      await tx.activityLog.create({
        data: { actor, action: "wallpaper.default_changed", detail: wallpaper.title },
      });
      return true;
    },
    { isolationLevel: "Serializable" },
  );
  return result ? { defaultWallpaperId: wallpaperId } : null;
}
