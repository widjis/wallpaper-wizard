import type { FastifyBaseLogger } from "fastify";
import { QueueState, TriggerSource } from "@prisma/client";
import type { DeploymentLogItem } from "@cwcm/types";
import { publishWallpaperToSysvol } from "./smb.js";
import {
  createDeploymentRecord,
  finalizeDeploymentRecord,
  getDeploymentDetail,
  getQueueState,
  getSchedulerRuntimeState,
  getSettings,
  markSchedulerHeartbeat,
  scheduleNextSchedulerRun,
  updateSchedulerRuntimeState,
} from "./repository.js";

const SCHEDULER_TICK_MS = 10_000;

export interface SchedulerCycleResult {
  accepted: boolean;
  queueState: QueueState;
  deployment: DeploymentLogItem | null;
  reason?: string;
}

async function executeDeployment(triggerSource: TriggerSource, operator: string) {
  const created = await createDeploymentRecord({
    triggerSource,
    operator,
  });

  try {
    const deployment = await getDeploymentDetail(created.id);
    if (!deployment) {
      throw new Error("Deployment not found after creation");
    }

    const published = await publishWallpaperToSysvol({
      imageData: Buffer.from(deployment.wallpaper.imageData),
      targetFilename: deployment.targetFilename,
    });

    return await finalizeDeploymentRecord({
      deploymentId: created.id,
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
    const message = error instanceof Error ? error.message : "Deployment failed";
    return await finalizeDeploymentRecord({
      deploymentId: created.id,
      result: "FAILED",
      message: `Deployment failed: ${message}`,
      verifiedExists: false,
      verifiedSizeBytes: 0,
      verifiedChecksumSha256: "",
    });
  }
}

export async function runSchedulerCycle(options?: {
  respectPause?: boolean;
  logger?: FastifyBaseLogger;
}): Promise<SchedulerCycleResult> {
  const respectPause = options?.respectPause ?? true;
  const logger = options?.logger;
  const queueState = await getQueueState();

  await markSchedulerHeartbeat();

  if (respectPause && queueState === QueueState.PAUSED) {
    await updateSchedulerRuntimeState({
      lastOutcome: "SKIPPED",
      lastError: null,
      nextRunAt: null,
    });
    logger?.info("Scheduler cycle skipped because queue is paused");
    return {
      accepted: false,
      queueState,
      deployment: null,
      reason: "Queue is paused",
    };
  }

  try {
    const deployment = await executeDeployment(TriggerSource.SCHEDULER, "scheduler");
    await updateSchedulerRuntimeState({
      lastRunAt: deployment.startedAt,
      lastOutcome: deployment.result === "FAILED" ? "FAILED" : "SUCCESS",
      lastError:
        deployment.result === "FAILED" ? (deployment.message ?? "Deployment failed") : null,
    });
    await scheduleNextSchedulerRun(new Date());
    logger?.info(
      {
        deploymentId: deployment.id,
        result: deployment.result,
        sourceType: deployment.sourceType,
      },
      "Scheduler cycle completed",
    );
    return {
      accepted: true,
      queueState,
      deployment,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduler cycle failed";
    await updateSchedulerRuntimeState({
      lastRunAt: new Date().toISOString(),
      lastOutcome: "FAILED",
      lastError: message,
    });
    await scheduleNextSchedulerRun(new Date());
    logger?.error({ error: message }, "Scheduler cycle failed");
    return {
      accepted: false,
      queueState,
      deployment: null,
      reason: message,
    };
  }
}

export async function runManualDeploymentNow() {
  return executeDeployment(TriggerSource.MANUAL, "Widji");
}

export function startRuntimeScheduler(logger: FastifyBaseLogger) {
  let disposed = false;
  let running = false;

  const tick = async () => {
    if (disposed || running) {
      return;
    }

    running = true;
    try {
      await markSchedulerHeartbeat();

      const [settings, queueState, runtime] = await Promise.all([
        getSettings(),
        getQueueState(),
        getSchedulerRuntimeState(),
      ]);

      if (queueState === QueueState.PAUSED) {
        if (runtime.nextRunAt !== null) {
          await updateSchedulerRuntimeState({
            nextRunAt: null,
          });
        }
        return;
      }

      if (!runtime.nextRunAt) {
        await scheduleNextSchedulerRun(new Date());
        return;
      }

      const nextRunAt = new Date(runtime.nextRunAt);
      if (Number.isNaN(nextRunAt.getTime())) {
        await scheduleNextSchedulerRun(new Date());
        return;
      }

      const now = Date.now();
      if (now < nextRunAt.getTime()) {
        return;
      }

      await runSchedulerCycle({
        respectPause: true,
        logger,
      });

      const latestSettings = await getSettings();
      if (latestSettings.schedulerIntervalMinutes !== settings.schedulerIntervalMinutes) {
        await scheduleNextSchedulerRun(new Date());
      }
    } finally {
      running = false;
    }
  };

  void scheduleNextSchedulerRun(new Date());
  void markSchedulerHeartbeat();

  const interval = setInterval(() => {
    void tick();
  }, SCHEDULER_TICK_MS);

  void tick();

  return {
    stop() {
      disposed = true;
      clearInterval(interval);
    },
  };
}
