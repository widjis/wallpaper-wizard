import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: new URL("../../../.env", import.meta.url) });
dotenv.config({ path: new URL("../../../.env.runtime", import.meta.url), override: true });

const configSchema = z
  .object({
    PORT: z.coerce.number().default(3000),
    APP_STORAGE_PATH: z.string().default("storage/wallpapers"),
    POSTGRES_URL: z.string().min(1),
    POSTGRES_APP_URL: z.string().optional(),
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
    AUTH_SEED_ADMIN_USERNAME: z.string().default("widji"),
    AUTH_SEED_ADMIN_PASSWORD: z.string().default("admin123"),
  })
  .transform((env) => {
    const appUrl = env.POSTGRES_APP_URL
      ? env.POSTGRES_APP_URL
      : (() => {
          const url = new URL(env.POSTGRES_URL);
          url.pathname = `/${env.POSTGRES_DATABASE}`;
          return url.toString();
        })();

    return {
      ...env,
      POSTGRES_APP_URL: appUrl,
    };
  });

export const appConfig = configSchema.parse(process.env);
