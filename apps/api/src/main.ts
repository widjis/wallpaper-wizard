import Fastify, { type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { QueueState, type UserRole } from "@prisma/client";
import { appConfig } from "./config.js";
import { ensureSeedData } from "./prisma.js";
import { DirectoryUnavailable, InvalidLogin } from "./directory.js";
import { getSessionByToken } from "./repository.js";
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
  deleteCampaignRecord,
  deleteUserRecord,
  duplicateCampaignRecord,
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
  loginWithAssignedAuth,
  logoutByToken,
  removeQueueItemRecord,
  reorderQueueItems,
  setQueueState,
  updateCampaignRecord,
  updateSettingsRecord,
  updateUserRecord,
} from "./repository.js";
import { publishWallpaperToSysvol } from "./smb.js";
import { registerWallpaperRoutes } from "./wallpaper-routes.js";
import { runManualDeploymentNow, runSchedulerCycle, startRuntimeScheduler } from "./scheduler.js";

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

function authenticationError(reply: FastifyReply, code: string, message: string) {
  return reply.status(401).send({ code, message });
}

const publicApiPaths = new Set(["/api/auth/login", "/api/health"]);

server.addHook("preHandler", async (request, reply) => {
  if (!request.url.startsWith("/api") || publicApiPaths.has(request.url)) {
    return;
  }

  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return authenticationError(reply, "AUTH_TOKEN_MISSING", "Authentication is required");
  }

  const token = authorization.replace("Bearer ", "");
  const session = await getSessionByToken(token);
  if (!session) {
    return authenticationError(reply, "SESSION_INVALID", "Your session has expired");
  }

  (request as typeof request & { currentUser: AuthenticatedRequestUser }).currentUser =
    session.user;

  const path = request.url.split("?")[0];
  if (
    (path === "/api/users" || path.startsWith("/api/users/")) &&
    session.user.role !== "ADMINISTRATOR"
  ) {
    return reply.status(403).send({ message: "Only an Administrator can manage user access." });
  }
  if (
    path === "/api/settings" &&
    request.method !== "GET" &&
    session.user.role !== "ADMINISTRATOR"
  ) {
    return reply.status(403).send({ message: "Only an Administrator can change settings." });
  }
  if (
    path.startsWith("/api/campaigns") &&
    request.method !== "GET" &&
    session.user.role === "VIEWER"
  ) {
    return reply
      .status(403)
      .send({ message: "Campaign changes require Operator or Administrator access." });
  }
});

server.get("/health", async () => {
  return getHealthStatus();
});

server.get("/api/health", async () => {
  return getHealthStatus();
});

server.post("/api/auth/login", async (request, reply) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success)
    return reply.status(401).send({
      code: "INVALID_CREDENTIALS",
      message: "Invalid username or password, or access has not been assigned.",
    });
  const payload = parsed.data;
  try {
    const session = await loginWithAssignedAuth(payload.username, payload.password);
    return session;
  } catch (error) {
    const unavailable = error instanceof DirectoryUnavailable || !(error instanceof InvalidLogin);
    return reply.status(unavailable ? 503 : 401).send({
      code: unavailable ? "AUTH_UNAVAILABLE" : "INVALID_CREDENTIALS",
      message: unavailable
        ? "Sign-in is temporarily unavailable. Please try again later."
        : "Invalid username or password, or access has not been assigned.",
    });
  }
});

server.get("/api/auth/session", async (request) => {
  const authorization = request.headers.authorization!;
  const session = await getSessionByToken(authorization.replace("Bearer ", ""));
  return session!;
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

await server.register(async (scope) => registerWallpaperRoutes(scope));

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

server.get("/api/deployments", async (request) => {
  const query = request.query as { page?: string; limit?: string } | undefined;
  const parsedPage = Number(query?.page);
  const parsedLimit = Number(query?.limit);

  return listDeployments({
    page: Number.isFinite(parsedPage) ? parsedPage : undefined,
    limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
  });
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
          ? published.written
            ? "SYSVOL wallpaper updated and checksum verification succeeded."
            : "SYSVOL wallpaper already matches the source checksum; write skipped."
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
  const parsed = userCreateSchema.safeParse(request.body);
  if (!parsed.success)
    return reply.status(400).send({
      message:
        "Check username, authentication source, role, status, and local password (minimum 6 characters).",
    });
  const payload = parsed.data;
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
    reply.status(error instanceof DirectoryUnavailable ? 503 : 400);
    return {
      message:
        error instanceof DirectoryUnavailable || error instanceof InvalidLogin
          ? error.message
          : "User could not be created. Check the account details or existing assignment.",
    };
  }
});

server.patch("/api/users/:userId", async (request, reply) => {
  const parsed = userUpdateSchema.safeParse(request.body);
  if (!parsed.success)
    return reply.status(400).send({
      message:
        "Check username, authentication source, role, status, and local password (minimum 6 characters).",
    });
  const payload = parsed.data;
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
    reply.status(error instanceof DirectoryUnavailable ? 503 : 400);
    return {
      message:
        error instanceof Error && !(error as { code?: string }).code
          ? error.message
          : "User could not be updated. Check the account details or existing assignment.",
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
      code: "USER_DELETE_REJECTED",
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

server.post("/api/deployments/force", async (request, reply) => {
  try {
    return await runManualDeploymentNow();
  } catch (error) {
    reply.status(400);
    return {
      message: error instanceof Error ? error.message : "Manual deployment failed",
    };
  }
});

server.post("/api/scheduler/run", async () => {
  return runSchedulerCycle({
    respectPause: true,
    logger: server.log,
  });
});

const runtimeScheduler = startRuntimeScheduler(server.log);

server.addHook("onClose", async () => {
  runtimeScheduler.stop();
});

await server.listen({
  host: "0.0.0.0",
  port: appConfig.PORT,
});
