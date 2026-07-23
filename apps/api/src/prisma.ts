import {
  PrismaClient,
  CampaignStatus,
  DeploymentResult,
  QueueState,
  TriggerSource,
  UserRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { appConfig } from "./config.js";

export const prisma = new PrismaClient();

const defaultSettings = {
  sysvolPath: `${appConfig.CIFS_SHARE_PATH}${appConfig.SHARED_FOLDER_PATH.startsWith("/") ? appConfig.SHARED_FOLDER_PATH : `/${appConfig.SHARED_FOLDER_PATH}`}`,
  wallpaperFilename: "Wallpaper.jpg",
  storageLocation: appConfig.APP_STORAGE_PATH,
  schedulerIntervalMinutes: 1,
  deploymentTimeoutSeconds: 60,
  retryAttempts: 3,
  maxUploadSizeMb: 20,
  allowedExtensions: [".jpg", ".jpeg", ".png"],
  overwriteExistingWallpaper: true,
  autoRetryFailedDeployments: true,
};

export async function ensureSeedData() {
  const adminPasswordHash = await bcrypt.hash(appConfig.AUTH_SEED_ADMIN_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { username: "Widji" },
    update: {},
    create: {
      username: "Widji",
      passwordHash: adminPasswordHash,
      role: UserRole.ADMINISTRATOR,
    },
  });

  const operator = await prisma.user.upsert({
    where: { username: "Rian Pratama" },
    update: {},
    create: {
      username: "Rian Pratama",
      passwordHash: adminPasswordHash,
      role: UserRole.OPERATOR,
    },
  });

  const viewer = await prisma.user.upsert({
    where: { username: "Dewi Lestari" },
    update: {},
    create: {
      username: "Dewi Lestari",
      passwordHash: adminPasswordHash,
      role: UserRole.VIEWER,
    },
  });

  const settingsEntries = Object.entries(defaultSettings);
  await Promise.all(
    settingsEntries.map(([key, value]) =>
      prisma.systemSetting.upsert({
        where: { key },
        update: {},
        create: {
          key,
          valueJson: JSON.stringify(value),
          updatedById: admin.id,
        },
      }),
    ),
  );

  const existingWallpaper = await prisma.wallpaper.findFirst({
    where: { filename: "Safety_Awareness_2026.jpg" },
  });

  if (!existingWallpaper) {
    const wallpaper1 = await prisma.wallpaper.create({
      data: {
        title: "Safety Awareness 2026",
        filename: "Safety_Awareness_2026.jpg",
        storagePath: `${appConfig.APP_STORAGE_PATH}/Safety_Awareness_2026.jpg`,
        description: "Monthly safety campaign",
        tags: ["safety", "monthly"],
        resolution: "1920x1080",
        sizeBytes: 2400000,
        checksumSha256: "a1b2c3d4e5f6",
        mimeType: "image/jpeg",
        uploadedById: admin.id,
      },
    });

    const wallpaper2 = await prisma.wallpaper.create({
      data: {
        title: "Independence Day",
        filename: "Independence_Day_2026.jpg",
        storagePath: `${appConfig.APP_STORAGE_PATH}/Independence_Day_2026.jpg`,
        description: "National celebration wallpaper",
        tags: ["holiday"],
        resolution: "1920x1080",
        sizeBytes: 1800000,
        checksumSha256: "b1c2d3e4f5g6",
        mimeType: "image/jpeg",
        uploadedById: admin.id,
      },
    });

    const wallpaper3 = await prisma.wallpaper.create({
      data: {
        title: "Company Anniversary 25",
        filename: "Anniversary_25.jpg",
        storagePath: `${appConfig.APP_STORAGE_PATH}/Anniversary_25.jpg`,
        description: "Company celebration wallpaper",
        tags: ["anniversary"],
        resolution: "1920x1080",
        sizeBytes: 2100000,
        checksumSha256: "c1d2e3f4g5h6",
        mimeType: "image/jpeg",
        uploadedById: admin.id,
      },
    });

    const campaign1 = await prisma.campaign.create({
      data: {
        name: "Safety Awareness 2026",
        wallpaperId: wallpaper1.id,
        description: "Monthly safety campaign",
        startDate: new Date("2026-07-23T00:00:00.000Z"),
        endDate: new Date("2026-07-31T23:59:59.000Z"),
        priority: 10,
        status: CampaignStatus.ACTIVE,
        createdById: admin.id,
      },
    });

    const campaign2 = await prisma.campaign.create({
      data: {
        name: "Independence Day",
        wallpaperId: wallpaper2.id,
        description: "National day wallpaper",
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-08-17T23:59:59.000Z"),
        priority: 7,
        status: CampaignStatus.SCHEDULED,
        createdById: operator.id,
      },
    });

    const campaign3 = await prisma.campaign.create({
      data: {
        name: "Company Anniversary",
        wallpaperId: wallpaper3.id,
        description: "Anniversary wallpaper",
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        endDate: new Date("2026-09-07T23:59:59.000Z"),
        priority: 8,
        status: CampaignStatus.SCHEDULED,
        createdById: admin.id,
      },
    });

    await prisma.campaignQueueEntry.createMany({
      data: [
        { campaignId: campaign1.id, orderIndex: 0 },
        { campaignId: campaign2.id, orderIndex: 1 },
        { campaignId: campaign3.id, orderIndex: 2 },
      ],
    });

    await prisma.deploymentLog.create({
      data: {
        campaignId: campaign1.id,
        wallpaperId: wallpaper1.id,
        triggerSource: TriggerSource.SCHEDULER,
        startedAt: new Date("2026-07-23T08:00:00.000Z"),
        finishedAt: new Date("2026-07-23T08:00:15.000Z"),
        durationMs: 15000,
        result: DeploymentResult.SUCCESS,
        message: "Published wallpaper to SYSVOL and verified checksum.",
        targetPath: defaultSettings.sysvolPath,
        targetFilename: defaultSettings.wallpaperFilename,
        verifiedExists: true,
        verifiedSizeBytes: 2400000,
        verifiedChecksumSha256: "a1b2c3d4e5f6",
      },
    });

    await prisma.activityLog.createMany({
      data: [
        {
          actor: admin.username,
          action: "wallpaper.uploaded",
          detail: "Independence_Day_2026.jpg",
        },
        {
          actor: admin.username,
          action: "campaign.scheduled",
          detail: "Independence Day",
        },
        {
          actor: "scheduler",
          action: "deployment.completed",
          detail: "Safety Awareness 2026",
        },
      ],
    });
  }

  await prisma.systemSetting.upsert({
    where: { key: "queueState" },
    update: {},
    create: {
      key: "queueState",
      valueJson: JSON.stringify(QueueState.RUNNING),
      updatedById: admin.id,
    },
  });

  void viewer;
}
