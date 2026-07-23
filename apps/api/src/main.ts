import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { QueueState, TriggerSource, type UserRole } from "@prisma/client";
import { appConfig } from "./config.js";
import { ensureSeedData } from "./prisma.js";
import { getUserByToken } from "./repository.js";
import {
  userCreateSchema,
  userUpdateSchema,
  campaignCreateSchema,
  campaignUpdateSchema,
  loginSchema,
  queueReorderSchema,
  settingsUpdateSchema,
} from "./schemas.js";
import {
  activateCampaignRecord,
  buildDashboardSummary,
  cancelCampaignRecord,
  createCampaignRecord,
  createUserRecord,
  deleteWallpaperRecord,
  deleteCampaignRecord,
  deleteUserRecord,
  duplicateCampaignRecord,
  createDeploymentRecord,
  createWallpaperRecord,
  finalizeDeploymentRecord,
  getDeploymentDetail,
  getHealthStatus,
  getQueueState,
  getSettings,
  getWallpaperBinary,
  listActivityLogs,
  listCampaigns,
  listDeployments,
  listQueue,
  listUsers,
  listWallpapers,
  loginWithLocalAuth,
  logoutByToken,
  removeQueueItemRecord,
  reorderQueueItems,
  setQueueState,
  updateCampaignRecord,
  updateSettingsRecord,
  updateUserRecord,
} from "./repository.js";
import { publishWallpaperToSysvol } from "./smb.js";
import { normalizeWallpaperImage } from "./services.js";

const server = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
    },
  },
});

await server.register(cors, {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});
await server.register(multipart, {
  limits: {
    fileSize: 64 * 1024 * 1024,
  },
});
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

interface AuthenticatedRequestUser {
  id: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
}

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
  const user = await getUserByToken(token);
  if (!user) {
    reply.status(401);
    throw new Error("Invalid bearer token");
  }

  (request as typeof request & { currentUser: AuthenticatedRequestUser }).currentUser = user;
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
  if ((uploaded.file as unknown as { truncated?: boolean }).truncated) {
    reply.status(413);
    return { message: "Upload exceeded server file size limit" };
  }

  const normalized = await normalizeWallpaperImage(Buffer.concat(chunks), uploaded.filename);

  const currentUser = (request as typeof request & { currentUser: AuthenticatedRequestUser })
    .currentUser;

  const wallpaper = await createWallpaperRecord({
    title: normalized.filename.replace(/\.[^.]+$/, ""),
    filename: normalized.filename,
    mimeType: normalized.mimeType,
    imageData: normalized.buffer,
    width: normalized.width,
    height: normalized.height,
    resolution: normalized.resolution,
    sizeBytes: normalized.sizeBytes,
    checksumSha256: normalized.checksumSha256,
    uploadedById: currentUser.id,
  });

  reply.status(201);
  return wallpaper;
});

server.get("/api/wallpapers/:wallpaperId/image", async (request, reply) => {
  const wallpaper = await getWallpaperBinary(
    (request.params as { wallpaperId: string }).wallpaperId,
  );
  if (!wallpaper) {
    reply.status(404);
    return { message: "Wallpaper not found" };
  }

  reply.header("Content-Type", wallpaper.mimeType);
  reply.header("Content-Length", String(wallpaper.sizeBytes));
  reply.header("ETag", wallpaper.checksumSha256);
  reply.header("Cache-Control", "public, max-age=300");
  return reply.send(Buffer.from(wallpaper.imageData));
});

server.delete("/api/wallpapers/:wallpaperId", async (request, reply) => {
  try {
    const currentUser = (request as typeof request & { currentUser: AuthenticatedRequestUser })
      .currentUser;
    await deleteWallpaperRecord({
      wallpaperId: (request.params as { wallpaperId: string }).wallpaperId,
      deletedById: currentUser.id,
    });
    reply.status(204);
    return;
  } catch (error) {
    reply.status(400);
    return {
      message: error instanceof Error ? error.message : "Wallpaper delete failed",
    };
  }
});

server.get("/api/campaigns", async () => {
  return {
    items: await listCampaigns(),
  };
});

server.post("/api/campaigns", async (request, reply) => {
  const payload = campaignCreateSchema.parse(request.body);
  try {
    const currentUser = (request as typeof request & { currentUser: AuthenticatedRequestUser })
      .currentUser;
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

server.patch("/api/campaigns/:campaignId", async (request, reply) => {
  const payload = campaignUpdateSchema.parse(request.body);
  try {
    const currentUser = (request as typeof request & { currentUser: AuthenticatedRequestUser })
      .currentUser;
    const campaign = await updateCampaignRecord({
      campaignId: (request.params as { campaignId: string }).campaignId,
      ...payload,
      updatedById: currentUser.id,
    });
    return campaign;
  } catch (error) {
    reply.status(400);
    return {
      message: error instanceof Error ? error.message : "Campaign update failed",
    };
  }
});

server.delete("/api/campaigns/:campaignId", async (request, reply) => {
  try {
    const currentUser = (request as typeof request & { currentUser: AuthenticatedRequestUser })
      .currentUser;
    await deleteCampaignRecord({
      campaignId: (request.params as { campaignId: string }).campaignId,
      deletedById: currentUser.id,
    });
    reply.status(204);
    return;
  } catch (error) {
    reply.status(400);
    return {
      message: error instanceof Error ? error.message : "Campaign delete failed",
    };
  }
});

server.post("/api/campaigns/:campaignId/duplicate", async (request, reply) => {
  try {
    const currentUser = (request as typeof request & { currentUser: AuthenticatedRequestUser })
      .currentUser;
    const campaign = await duplicateCampaignRecord({
      campaignId: (request.params as { campaignId: string }).campaignId,
      createdById: currentUser.id,
    });
    reply.status(201);
    return campaign;
  } catch (error) {
    reply.status(400);
    return {
      message: error instanceof Error ? error.message : "Campaign duplicate failed",
    };
  }
});

server.post("/api/campaigns/:campaignId/activate", async (request, reply) => {
  try {
    const currentUser = (request as typeof request & { currentUser: AuthenticatedRequestUser })
      .currentUser;
    return await activateCampaignRecord({
      campaignId: (request.params as { campaignId: string }).campaignId,
      updatedById: currentUser.id,
    });
  } catch (error) {
    reply.status(400);
    return {
      message: error instanceof Error ? error.message : "Campaign activation failed",
    };
  }
});

server.post("/api/campaigns/:campaignId/cancel", async (request, reply) => {
  try {
    const currentUser = (request as typeof request & { currentUser: AuthenticatedRequestUser })
      .currentUser;
    return await cancelCampaignRecord({
      campaignId: (request.params as { campaignId: string }).campaignId,
      updatedById: currentUser.id,
    });
  } catch (error) {
    reply.status(400);
    return {
      message: error instanceof Error ? error.message : "Campaign cancellation failed",
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

server.delete("/api/queue/:campaignId", async (request, reply) => {
  try {
    const currentUser = (request as typeof request & { currentUser: AuthenticatedRequestUser })
      .currentUser;
    return {
      items: await removeQueueItemRecord({
        campaignId: (request.params as { campaignId: string }).campaignId,
        updatedById: currentUser.id,
      }),
    };
  } catch (error) {
    reply.status(400);
    return {
      message: error instanceof Error ? error.message : "Queue removal failed",
    };
  }
});

server.post("/api/queue/pause", async (request) => {
  const currentUser = (request as typeof request & { currentUser: AuthenticatedRequestUser })
    .currentUser;
  await setQueueState(QueueState.PAUSED, currentUser.id);
  return { state: "PAUSED" };
});

server.post("/api/queue/resume", async (request) => {
  const currentUser = (request as typeof request & { currentUser: AuthenticatedRequestUser })
    .currentUser;
  await setQueueState(QueueState.RUNNING, currentUser.id);
  return { state: "RUNNING" };
});

server.get("/api/deployments", async () => {
  return {
    items: await listDeployments(),
  };
});

server.post("/api/deployments/:deploymentId/verify", async (request, reply) => {
  const deploymentId = (request.params as { deploymentId: string }).deploymentId;

  try {
    const deployment = await getDeploymentDetail(deploymentId);
    if (!deployment) {
      throw new Error("Deployment not found");
    }

    const published = await publishWallpaperToSysvol({
      imageData: Buffer.from(deployment.wallpaper.imageData),
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
    const message = error instanceof Error ? error.message : "Deployment verification failed";

    if (message === "Deployment not found") {
      reply.status(404);
      return { message };
    }

    return finalizeDeploymentRecord({
      deploymentId,
      result: "FAILED",
      message: `SYSVOL verification failed: ${message}`,
      verifiedExists: false,
      verifiedSizeBytes: 0,
      verifiedChecksumSha256: "",
    });
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

server.post("/api/users", async (request, reply) => {
  const payload = userCreateSchema.parse(request.body);
  try {
    const currentUser = (request as typeof request & { currentUser: AuthenticatedRequestUser })
      .currentUser;
    const user = await createUserRecord({
      ...payload,
      role: payload.role as UserRole,
      createdById: currentUser.id,
    });
    reply.status(201);
    return user;
  } catch (error) {
    reply.status(400);
    return {
      message: error instanceof Error ? error.message : "User creation failed",
    };
  }
});

server.patch("/api/users/:userId", async (request, reply) => {
  const payload = userUpdateSchema.parse(request.body);
  try {
    const currentUser = (request as typeof request & { currentUser: AuthenticatedRequestUser })
      .currentUser;
    return await updateUserRecord({
      userId: (request.params as { userId: string }).userId,
      ...payload,
      role: payload.role as UserRole,
      updatedById: currentUser.id,
    });
  } catch (error) {
    reply.status(400);
    return {
      message: error instanceof Error ? error.message : "User update failed",
    };
  }
});

server.delete("/api/users/:userId", async (request, reply) => {
  try {
    const currentUser = (request as typeof request & { currentUser: AuthenticatedRequestUser })
      .currentUser;
    await deleteUserRecord({
      userId: (request.params as { userId: string }).userId,
      deletedById: currentUser.id,
    });
    reply.status(204);
    return;
  } catch (error) {
    reply.status(400);
    return {
      message: error instanceof Error ? error.message : "User delete failed",
    };
  }
});

server.get("/api/settings", async () => getSettings());

server.put("/api/settings", async (request) => {
  const payload = settingsUpdateSchema.parse(request.body);
  const currentUser = (request as typeof request & { currentUser: AuthenticatedRequestUser })
    .currentUser;
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
