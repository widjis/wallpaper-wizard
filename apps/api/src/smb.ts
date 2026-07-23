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
  await fs.mkdir(path.dirname(remotePath), { recursive: true });
  await fs.writeFile(remotePath, payload.imageData);
  const remoteBuffer = await fs.readFile(remotePath);

  return {
    remotePath,
    exists: true,
    sizeBytes: remoteBuffer.byteLength,
    checksumSha256: buildChecksum(remoteBuffer),
  };
}
