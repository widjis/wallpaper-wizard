import crypto from "node:crypto";
import sharp from "sharp";

export function buildChecksum(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

const FULL_HD_WIDTH = 1920;
const FULL_HD_HEIGHT = 1080;
const MAX_WALLPAPER_BYTES = 2 * 1024 * 1024;

export interface NormalizedWallpaper {
  buffer: Buffer;
  mimeType: "image/jpeg";
  filename: string;
  width: number;
  height: number;
  resolution: string;
  sizeBytes: number;
  checksumSha256: string;
}

export async function normalizeWallpaperImage(
  sourceBuffer: Buffer,
  originalFilename: string,
): Promise<NormalizedWallpaper> {
  const pipeline = sharp(sourceBuffer).rotate().resize(FULL_HD_WIDTH, FULL_HD_HEIGHT, {
    fit: "cover",
    position: "centre",
  });

  let quality = 90;
  let outputBuffer = await pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer();

  while (outputBuffer.byteLength > MAX_WALLPAPER_BYTES && quality > 10) {
    quality -= 5;
    outputBuffer = await pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
  }

  const normalizedFilename = `${originalFilename.replace(/\.[^.]+$/, "")}.jpg`;

  return {
    buffer: outputBuffer,
    mimeType: "image/jpeg",
    filename: normalizedFilename,
    width: FULL_HD_WIDTH,
    height: FULL_HD_HEIGHT,
    resolution: `${FULL_HD_WIDTH}x${FULL_HD_HEIGHT}`,
    sizeBytes: outputBuffer.byteLength,
    checksumSha256: buildChecksum(outputBuffer),
  };
}
