import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fs from "node:fs/promises";
import path from "node:path";
import { QueueState, TriggerSource } from "@prisma/client";
import { appConfig } from "./config.js";
import { ensureSeedData } from "./prisma.js";
import { getUserByToken } from "./repository.js";
import {
  campaignCreateSchema,
  loginSchema,
  queueReorderSchema,
  settingsUpdateSchema,
} from "./schemas.js";
import {
  buildDashboardSummary,
  createCampaignRecord,
  createDeploymentRecord,
  createWallpaperRecord,
  finalizeDeploymentRecord,
  getDeploymentDetail,
  getHealthStatus,
  getQueueState,
  getSettings,
  listActivityLogs,
  listCampaigns,
  listDeployments,
  listQueue,
  listUsers,
  listWallpapers,
  loginWithLocalAuth,
  logoutByToken,
  reorderQueueItems,
  setQueueState,
  updateSettingsRecord,
} from "./repository.js";
import { publishWallpaperToSysvol } from "./smb.js";
import { buildChecksum } from "./services.js";

const server = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
    },
  },
});

await server.register(cors, { origin: true, credentials: true });
await server.register(multipart);
await server.register(swagger, {
  openapi: {
    info: {
      title: "CWCM API",
      version: "0.1.0",
    },
  },
});
await server.register(swaggerUi, {
  routePrefix: "/docs",
});

await ensureSeedData();

server.addHook("preHandler", async (request, reply) => {
  if (!request.url.startsWith("/api") || request.url.startsWith("/api/auth/login")) {
    return;
  }

  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    reply.status(401);
    throw new Error("Missing bearer token");
  }

  const token = authorization.replace("Bearer ", "");
  const user = getUserByToken(token);
  if (!user) {
    reply.status(401);
    throw new Error("Invalid bearer token");
  }

  (request as typeof request & { currentUser: typeof user }).currentUser = user;
});

server.get("/health", async () => {
  return getHealthStatus();
});

server.post("/api/auth/login", async (request, reply) => {
  const payload = loginSchema.parse(request.body);
  try {
    const session = await loginWithLocalAuth(payload.username, payload.password);
    return session;
  } catch (error) {
    reply.status(401);
    return {
      message: error instanceof Error ? error.message : "Authentication failed",
    };
  }
});

server.post("/api/auth/logout", async (request, reply) => {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    await logoutByToken(authorization.replace("Bearer ", ""));
  }
  reply.status(204);
});

server.get("/api/dashboard/summary", async () => {
  return buildDashboardSummary();
});

server.get("/api/wallpapers", async () => {
  return {
    items: await listWallpapers(),
  };
});

server.post("/api/wallpapers", async (request, reply) => {
  const uploaded = await request.file();
  if (!uploaded) {
    reply.status(400);
    return { message: "Wallpaper file is required" };
  }

  const chunks: Buffer[] = [];
  for await (const chunk of uploaded.file) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  const storageDir = path.resolve(process.cwd(), appConfig.APP_STORAGE_PATH);
  await fs.mkdir(storageDir, { recursive: true });
  const filePath = path.join(storageDir, uploaded.filename);
  await fs.writeFile(filePath, buffer);

  const currentUser = (request as typeof request & { currentUser: { id: string } }).currentUser;

  const wallpaper = await createWallpaperRecord({
    title: uploaded.filename.replace(/\.[^.]+$/, ""),
    filename: uploaded.filename,
    storagePath: filePath,
    mimeType: uploaded.mimetype,
    sizeBytes: buffer.byteLength,
    checksumSha256: buildChecksum(buffer),
    uploadedById: currentUser.id,
  });

  reply.status(201);
  return wallpaper;
});

server.get("/api/campaigns", async () => {
  return {
    items: await listCampaigns(),
  };
});

server.post("/api/campaigns", async (request, reply) => {
  const payload = campaignCreateSchema.parse(request.body);
  try {
    const currentUser = (request as typeof request & { currentUser: { id: string } }).currentUser;
    const campaign = await createCampaignRecord({
      ...payload,
      createdById: currentUser.id,
    });
    reply.status(201);
    return campaign;
  } catch (error) {
    reply.status(400);
    return {
      message: error instanceof Error ? error.message : "Campaign creation failed",
    };
  }
});

server.get("/api/queue", async () => {
  const [items, queueState] = await Promise.all([listQueue(), getQueueState()]);
  return {
    items,
    state: queueState,
  };
});

server.post("/api/queue/reorder", async (request) => {
  const payload = queueReorderSchema.parse(request.body);
  return {
    items: await reorderQueueItems(payload.campaignIds),
  };
});

server.post("/api/queue/pause", async (request) => {
  const currentUser = (request as typeof request & { currentUser: { id: string } }).currentUser;
  await setQueueState(QueueState.PAUSED, currentUser.id);
  return { state: "PAUSED" };
});

server.post("/api/queue/resume", async (request) => {
  const currentUser = (request as typeof request & { currentUser: { id: string } }).currentUser;
  await setQueueState(QueueState.RUNNING, currentUser.id);
  return { state: "RUNNING" };
});

server.get("/api/deployments", async () => {
  return {
    items: await listDeployments(),
  };
});

server.post("/api/deployments/:deploymentId/verify", async (request, reply) => {
  try {
    const deploymentId = (request.params as { deploymentId: string }).deploymentId;
    const deployment = await getDeploymentDetail(deploymentId);
    if (!deployment) {
      throw new Error("Deployment not found");
    }

    const published = await publishWallpaperToSysvol({
      storagePath: deployment.wallpaper.storagePath,
      targetFilename: deployment.targetFilename,
    });

    return await finalizeDeploymentRecord({
      deploymentId,
      result:
        published.checksumSha256 === deployment.wallpaper.checksumSha256 ? "SUCCESS" : "WARNING",
      message:
        published.checksumSha256 === deployment.wallpaper.checksumSha256
          ? "SYSVOL publish and checksum verification succeeded."
          : "SYSVOL publish completed but checksum differs from source file.",
      verifiedExists: published.exists,
      verifiedSizeBytes: published.sizeBytes,
      verifiedChecksumSha256: published.checksumSha256,
    });
  } catch (error) {
    reply.status(404);
    return {
      message: error instanceof Error ? error.message : "Deployment not found",
    };
  }
});

server.get("/api/activity", async () => {
  return {
    items: await listActivityLogs(),
  };
});

server.get("/api/users", async () => {
  return {
    items: await listUsers(),
  };
});

server.get("/api/settings", async () => getSettings());

server.put("/api/settings", async (request) => {
  const payload = settingsUpdateSchema.parse(request.body);
  const currentUser = (request as typeof request & { currentUser: { id: string } }).currentUser;
  return updateSettingsRecord(payload, currentUser.id);
});

server.post("/api/deployments/force", async () => {
  const created = await createDeploymentRecord({
    triggerSource: TriggerSource.MANUAL,
    operator: "Widji",
  });
  return created;
});

server.post("/api/scheduler/run", async () => {
  const deployment = await createDeploymentRecord({
    triggerSource: TriggerSource.SCHEDULER,
    operator: "scheduler",
  });
  const queueState = await getQueueState();
  return {
    accepted: true,
    queueState,
    deployment,
  };
});

await server.listen({
  host: "0.0.0.0",
  port: appConfig.PORT,
});
