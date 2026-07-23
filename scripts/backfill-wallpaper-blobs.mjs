import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

const repoRoot = path.resolve(import.meta.dirname, "..");

dotenv.config({ path: path.resolve(repoRoot, ".env") });
dotenv.config({ path: path.resolve(repoRoot, ".env.runtime"), override: true });

const prisma = new PrismaClient();

async function main() {
  const wallpapers = await prisma.wallpaper.findMany({
    where: {
      OR: [{ imageData: null }, { width: null }, { height: null }],
    },
  });

  for (const wallpaper of wallpapers) {
    if (!wallpaper.storagePath) {
      throw new Error(`Wallpaper ${wallpaper.id} is missing legacy storagePath for final backfill`);
    }

    const absolutePath = path.resolve(repoRoot, "apps/api", wallpaper.storagePath);
    const imageData = await fs.readFile(absolutePath);

    await prisma.wallpaper.update({
      where: { id: wallpaper.id },
      data: {
        imageData: new Uint8Array(imageData),
        width: wallpaper.width ?? 1920,
        height: wallpaper.height ?? 1080,
        resolution: wallpaper.resolution || "1920x1080",
        mimeType: wallpaper.mimeType || "image/jpeg",
        sizeBytes: imageData.byteLength,
      },
    });
  }

  const remaining = await prisma.wallpaper.count({
    where: {
      OR: [{ imageData: null }, { width: null }, { height: null }],
    },
  });

  if (remaining > 0) {
    throw new Error(`Backfill incomplete. Remaining wallpapers without blob metadata: ${remaining}`);
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
