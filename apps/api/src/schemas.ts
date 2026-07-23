import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const campaignCreateSchema = z.object({
  name: z.string().min(1),
  wallpaperId: z.string().min(1),
  description: z.string().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  timeZone: z.string().min(1).nullable().optional(),
  priority: z.number().int().min(0),
});

export const campaignUpdateSchema = z.object({
  name: z.string().min(1),
  wallpaperId: z.string().min(1),
  description: z.string().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  timeZone: z.string().min(1).nullable().optional(),
  priority: z.number().int().min(0),
});

export const queueReorderSchema = z.object({
  campaignIds: z.array(z.string()).min(1),
});

export const settingsUpdateSchema = z.object({
  sysvolPath: z.string().min(1),
  wallpaperFilename: z.string().min(1),
  defaultWallpaperId: z.string().uuid().nullable(),
  storageLocation: z.string().min(1),
  schedulerIntervalMinutes: z.number().int().min(1),
  deploymentTimeoutSeconds: z.number().int().min(1),
  retryAttempts: z.number().int().min(0),
  maxUploadSizeMb: z.number().int().min(1),
  allowedExtensions: z.array(z.string()).min(1),
  overwriteExistingWallpaper: z.boolean(),
  autoRetryFailedDeployments: z.boolean(),
});

export const userCreateSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(["ADMINISTRATOR", "OPERATOR", "VIEWER"]),
  isActive: z.boolean().default(true),
});

export const userUpdateSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6).optional(),
  role: z.enum(["ADMINISTRATOR", "OPERATOR", "VIEWER"]),
  isActive: z.boolean(),
});
