import fs from "node:fs/promises";
import path from "node:path";
import SMB2 from "smb2";
import { buildChecksum } from "./services.js";
import { appConfig } from "./config.js";

function createSmbClient() {
  return new SMB2({
    share: appConfig.CIFS_SHARE_PATH,
    domain: appConfig.DOMAIN_NAME,
    username: appConfig.DOMAIN_USERNAME,
    password: appConfig.DOMAIN_PASSWORD,
    autoCloseTimeout: 0,
  });
}

function toRemotePath(filename: string) {
  const cleanPath = appConfig.SHARED_FOLDER_PATH.replace(/^\/+/, "").replace(/\//g, "\\");
  return path.win32.join(cleanPath, filename);
}

async function writeRemoteFile(remotePath: string, buffer: Buffer) {
  const client = createSmbClient();

  const exists = async (target: string) =>
    new Promise<boolean>((resolve) => {
      client.exists(target, (error: Error | null, result?: boolean) => {
        if (error) resolve(false);
        else resolve(Boolean(result));
      });
    });

  const mkdir = async (target: string) =>
    new Promise<void>((resolve, reject) => {
      client.mkdir(target, (error: Error | null) => {
        if (error && !String(error.message).includes("STATUS_OBJECT_NAME_COLLISION")) {
          reject(error);
          return;
        }
        resolve();
      });
    });

  const writeFile = async (target: string, data: Buffer) =>
    new Promise<void>((resolve, reject) => {
      client.writeFile(target, data, (error: Error | null) => {
        if (error) reject(error);
        else resolve();
      });
    });

  const readFile = async (target: string) =>
    new Promise<Buffer>((resolve, reject) => {
      client.readFile(target, (error: Error | null, data: Buffer) => {
        if (error) reject(error);
        else resolve(data);
      });
    });

  try {
    const directory = path.win32.dirname(remotePath);
    const segments = directory.split("\\").filter(Boolean);
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}\\${segment}` : segment;
      if (!(await exists(current))) {
        await mkdir(current);
      }
    }

    await writeFile(remotePath, buffer);
    return await readFile(remotePath);
  } finally {
    client.close();
  }
}

export async function publishWallpaperToSysvol(payload: {
  storagePath: string;
  targetFilename: string;
}) {
  const localBuffer = await fs.readFile(payload.storagePath);
  const remotePath = toRemotePath(payload.targetFilename);
  const remoteBuffer = await writeRemoteFile(remotePath, localBuffer);

  return {
    remotePath,
    exists: true,
    sizeBytes: remoteBuffer.byteLength,
    checksumSha256: buildChecksum(remoteBuffer),
  };
}
