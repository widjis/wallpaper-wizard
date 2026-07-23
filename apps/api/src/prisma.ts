import {
  PrismaClient,
  CampaignStatus,
  DeploymentResult,
  QueueState,
  TriggerSource,
  UserRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs/promises";
import path from "node:path";
import { appConfig } from "./config.js";
import { buildChecksum } from "./services.js";

export const prisma = new PrismaClient();

const defaultSettings = {
  sysvolPath: appConfig.SYSVOL_DISPLAY_PATH,
  wallpaperFilename: "Wallpaper.jpg",
  defaultWallpaperId: null,
  storageLocation: appConfig.APP_STORAGE_PATH,
  schedulerIntervalMinutes: 1,
  deploymentTimeoutSeconds: 60,
  retryAttempts: 3,
  maxUploadSizeMb: 20,
  allowedExtensions: [".jpg", ".jpeg", ".png"],
  overwriteExistingWallpaper: true,
  autoRetryFailedDeployments: true,
};

const seedWallpaperFiles = [
  {
    filename: "Safety_Awareness_2026.jpg",
    sourceAsset: "wallpaper-safety.jpg",
  },
  {
    filename: "Independence_Day_2026.jpg",
    sourceAsset: "wallpaper-independence.jpg",
  },
  {
    filename: "Anniversary_25.jpg",
    sourceAsset: "wallpaper-anniversary.jpg",
  },
] as const;

async function ensureSeedWallpaperFiles() {
  const storageDir = path.resolve(process.cwd(), appConfig.APP_STORAGE_PATH);
  const assetDir = path.resolve(process.cwd(), "../web/src/assets");

  await fs.mkdir(storageDir, { recursive: true });

  await Promise.all(
    seedWallpaperFiles.map(async ({ filename, sourceAsset }) => {
      const targetPath = path.join(storageDir, filename);

      try {
        await fs.access(targetPath);
      } catch {
        await fs.copyFile(path.join(assetDir, sourceAsset), targetPath);
      }
    }),
  );
}

async function buildSeedWallpaperPayload(sourceAsset: string, filename: string) {
  const assetPath = path.resolve(process.cwd(), "../web/src/assets", sourceAsset);
  const imageData = await fs.readFile(assetPath);

  return {
    filename,
    imageData,
    resolution: "1920x1080",
    width: 1920,
    height: 1080,
    sizeBytes: imageData.byteLength,
    checksumSha256: buildChecksum(imageData),
    mimeType: "image/jpeg",
  };
}

export async function ensureSeedData() {
  await ensureSeedWallpaperFiles();
  const adminPasswordHash = await bcrypt.hash(appConfig.AUTH_SEED_ADMIN_PASSWORD, 10);
  const operatorPasswordHash = await bcrypt.hash(
    appConfig.LDAP_PASS ?? appConfig.AUTH_SEED_ADMIN_PASSWORD,
    10,
  );

  const admin = await prisma.user.upsert({
    where: { username: appConfig.AUTH_SEED_ADMIN_USERNAME },
    update: {},
    create: {
      username: appConfig.AUTH_SEED_ADMIN_USERNAME,
      passwordHash: adminPasswordHash,
      role: UserRole.ADMINISTRATOR,
    },
  });

  const operator = await prisma.user.upsert({
    where: { username: appConfig.LDAP_USER ?? "Rian Pratama" },
    update: {},
    create: {
      username: appConfig.LDAP_USER ?? "Rian Pratama",
      passwordHash: operatorPasswordHash,
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
    const safetyWallpaper = await buildSeedWallpaperPayload(
      "wallpaper-safety.jpg",
      "Safety_Awareness_2026.jpg",
    );
    const independenceWallpaper = await buildSeedWallpaperPayload(
      "wallpaper-independence.jpg",
      "Independence_Day_2026.jpg",
    );
    const anniversaryWallpaper = await buildSeedWallpaperPayload(
      "wallpaper-anniversary.jpg",
      "Anniversary_25.jpg",
    );

    const wallpaper1 = await prisma.wallpaper.create({
      data: {
        title: "Safety Awareness 2026",
        filename: safetyWallpaper.filename,
        description: "Monthly safety campaign",
        tags: ["safety", "monthly"],
        resolution: safetyWallpaper.resolution,
        width: safetyWallpaper.width,
        height: safetyWallpaper.height,
        sizeBytes: safetyWallpaper.sizeBytes,
        checksumSha256: safetyWallpaper.checksumSha256,
        mimeType: safetyWallpaper.mimeType,
        imageData: safetyWallpaper.imageData,
        uploadedById: admin.id,
      },
    });

    const wallpaper2 = await prisma.wallpaper.create({
      data: {
        title: "Independence Day",
        filename: independenceWallpaper.filename,
        description: "National celebration wallpaper",
        tags: ["holiday"],
        resolution: independenceWallpaper.resolution,
        width: independenceWallpaper.width,
        height: independenceWallpaper.height,
        sizeBytes: independenceWallpaper.sizeBytes,
        checksumSha256: independenceWallpaper.checksumSha256,
        mimeType: independenceWallpaper.mimeType,
        imageData: independenceWallpaper.imageData,
        uploadedById: admin.id,
      },
    });

    const wallpaper3 = await prisma.wallpaper.create({
      data: {
        title: "Company Anniversary 25",
        filename: anniversaryWallpaper.filename,
        description: "Company celebration wallpaper",
        tags: ["anniversary"],
        resolution: anniversaryWallpaper.resolution,
        width: anniversaryWallpaper.width,
        height: anniversaryWallpaper.height,
        sizeBytes: anniversaryWallpaper.sizeBytes,
        checksumSha256: anniversaryWallpaper.checksumSha256,
        mimeType: anniversaryWallpaper.mimeType,
        imageData: anniversaryWallpaper.imageData,
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
        verifiedSizeBytes: safetyWallpaper.sizeBytes,
        verifiedChecksumSha256: safetyWallpaper.checksumSha256,
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

    await prisma.systemSetting.update({
      where: { key: "defaultWallpaperId" },
      data: {
        valueJson: JSON.stringify(wallpaper1.id),
        updatedById: admin.id,
      },
    });
  }

  const defaultWallpaperSetting = await prisma.systemSetting.findUnique({
    where: { key: "defaultWallpaperId" },
  });
  if (defaultWallpaperSetting) {
    const parsed = JSON.parse(defaultWallpaperSetting.valueJson) as string | null;
    if (!parsed) {
      const firstWallpaper = await prisma.wallpaper.findFirst({
        where: { deletedAt: null },
        orderBy: { uploadedAt: "asc" },
      });
      if (firstWallpaper) {
        await prisma.systemSetting.update({
          where: { key: "defaultWallpaperId" },
          data: {
            valueJson: JSON.stringify(firstWallpaper.id),
            updatedById: admin.id,
          },
        });
      }
    }
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
