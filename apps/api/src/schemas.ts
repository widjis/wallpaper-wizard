import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(200),
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

export const userCreateSchema = z
  .object({
    username: z.string().trim().min(1).max(200),
    authSource: z.enum(["LOCAL", "AD"]).default("LOCAL"),
    password: z.string().min(6).optional(),
    role: z.enum(["ADMINISTRATOR", "OPERATOR", "VIEWER"]),
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.authSource === "LOCAL" && !data.password)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Local accounts require a password.",
      });
    if (data.authSource === "AD" && data.password)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Do not submit AD passwords in Users.",
      });
  });

export const userUpdateSchema = z.object({
  authSource: z.enum(["LOCAL", "AD"]).optional(),
  username: z.string().trim().min(1).max(200),
  password: z.string().min(6).optional(),
  role: z.enum(["ADMINISTRATOR", "OPERATOR", "VIEWER"]),
  isActive: z.boolean(),
});
