import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: new URL("../../../.env", import.meta.url) });
dotenv.config({ path: new URL("../../../.env.runtime", import.meta.url), override: true });

function normalizeLocalPath(value: string) {
  return value.replace(/\/+$/, "");
}

function toSysvolDisplayPath(cifsSharePath: string, sharedFolderPath: string) {
  const normalizedShareRoot = cifsSharePath.replace(/\/+$/, "");
  const normalizedTarget = normalizeLocalPath(sharedFolderPath);

  if (!normalizedTarget.startsWith("/")) {
    return `${normalizedShareRoot}/${normalizedTarget.replace(/^\/+/, "")}`;
  }

  const mountPrefix = "/app/sysvol";
  if (normalizedTarget === mountPrefix) {
    return normalizedShareRoot;
  }

  if (normalizedTarget.startsWith(`${mountPrefix}/`)) {
    return `${normalizedShareRoot}${normalizedTarget.slice(mountPrefix.length)}`;
  }

  return normalizedTarget;
}

const configSchema = z
  .object({
    PORT: z.coerce.number().default(3000),
    APP_STORAGE_PATH: z.string().default("storage/wallpapers"),
    POSTGRES_URL: z.string().min(1),
    POSTGRES_APP_URL: z.string().optional(),
    POSTGRES_USERNAME: z.string().optional(),
    POSTGRES_PASSWORD: z.string().optional(),
    POSTGRES_DATABASE: z.string().min(1).default("wallpaperWizardDB"),
    DOMAIN_NAME: z.string().min(1),
    DOMAIN_USERNAME: z.string().min(1),
    DOMAIN_PASSWORD: z.string().min(1),
    SHARED_FOLDER_PATH: z.string().min(1),
    CIFS_SHARE_PATH: z.string().min(1),
    CIFS_VERS: z.string().default("3.0"),
    LDAP_URL: z.string().optional(),
    LDAP_BIND_DN: z.string().optional(),
    LDAP_BIND_PASSWORD: z.string().optional(),
    LDAP_BASE_DN: z.string().optional(),
    REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
    LDAP_USER: z.string().optional(),
    LDAP_PASS: z.string().optional(),
    LOCAL_ADMIN: z.string().optional(),
    LOCAL_PASS: z.string().optional(),
    AUTH_SEED_ADMIN_USERNAME: z.string().default("widji"),
    AUTH_SEED_ADMIN_PASSWORD: z.string().default("admin123"),
  })
  .transform((env) => {
    const appUrl = env.POSTGRES_APP_URL
      ? env.POSTGRES_APP_URL
      : (() => {
          const url = new URL(env.POSTGRES_URL);
          if (env.POSTGRES_USERNAME) {
            url.username = env.POSTGRES_USERNAME;
          }
          if (env.POSTGRES_PASSWORD) {
            url.password = env.POSTGRES_PASSWORD;
          }
          url.pathname = `/${env.POSTGRES_DATABASE}`;
          return url.toString();
        })();

    const sharedFolderPath = normalizeLocalPath(env.SHARED_FOLDER_PATH);

    return {
      ...env,
      POSTGRES_APP_URL: appUrl,
      SHARED_FOLDER_PATH: sharedFolderPath,
      SYSVOL_DISPLAY_PATH: toSysvolDisplayPath(env.CIFS_SHARE_PATH, sharedFolderPath),
      AUTH_SEED_ADMIN_USERNAME: env.LOCAL_ADMIN?.trim() || env.AUTH_SEED_ADMIN_USERNAME,
      AUTH_SEED_ADMIN_PASSWORD: env.LOCAL_PASS?.trim() || env.AUTH_SEED_ADMIN_PASSWORD,
    };
  });

export const appConfig = configSchema.parse(process.env);
