import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const root = new URL("../", import.meta.url);
dotenv.config({ path: fileURLToPath(new URL(".env", root)), quiet: true });
dotenv.config({ path: fileURLToPath(new URL(".env.runtime", root)), override: true, quiet: true });
const env = process.env;
const url = new URL(env.POSTGRES_APP_URL || env.POSTGRES_URL);
if (!env.POSTGRES_APP_URL) {
  if (env.POSTGRES_USERNAME) url.username = env.POSTGRES_USERNAME;
  if (env.POSTGRES_PASSWORD) url.password = env.POSTGRES_PASSWORD;
  url.pathname = `/${env.POSTGRES_DATABASE || "wallpaperWizardDB"}`;
}
const client = new pg.Client({
  connectionString: url.toString(),
  connectionTimeoutMillis: 10000,
  ssl:
    env.POSTGRES_SSL === "true"
      ? { rejectUnauthorized: env.POSTGRES_SSL_REJECT_UNAUTHORIZED === "true" }
      : undefined,
});
try {
  await client.connect();
  await client.query(
    fs.readFileSync(new URL("prisma/changes/20260927-ad-login.sql", root), "utf8"),
  );
  console.log("AD account columns and identity index are ready. Existing accounts remain LOCAL.");
} catch (error) {
  console.error("AD schema update failed. Database error code:", error.code || "UNKNOWN");
  process.exitCode = 1;
} finally {
  await client.end();
}
