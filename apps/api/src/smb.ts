import fs from "node:fs/promises";
import path from "node:path";
import { buildChecksum } from "./services.js";
import { appConfig } from "./config.js";

function toRemotePath(filename: string) {
  return path.resolve(appConfig.SHARED_FOLDER_PATH, filename);
}

export async function publishWallpaperToSysvol(payload: {
  imageData: Buffer;
  targetFilename: string;
}) {
  const remotePath = toRemotePath(payload.targetFilename);
  const sourceChecksumSha256 = buildChecksum(payload.imageData);

  await fs.mkdir(path.dirname(remotePath), { recursive: true });

  try {
    const existingBuffer = await fs.readFile(remotePath);
    const existingChecksumSha256 = buildChecksum(existingBuffer);

    if (existingChecksumSha256 === sourceChecksumSha256) {
      return {
        remotePath,
        exists: true,
        sizeBytes: existingBuffer.byteLength,
        checksumSha256: existingChecksumSha256,
        written: false,
      };
    }
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException).code;
    if (errorCode !== "ENOENT") {
      throw error;
    }
  }

  await fs.writeFile(remotePath, payload.imageData);
  const remoteBuffer = await fs.readFile(remotePath);

  return {
    remotePath,
    exists: true,
    sizeBytes: remoteBuffer.byteLength,
    checksumSha256: buildChecksum(remoteBuffer),
    written: true,
  };
}
