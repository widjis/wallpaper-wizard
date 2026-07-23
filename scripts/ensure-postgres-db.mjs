import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath });

const { Client } = pg;

function buildDatabaseUrl() {
  const rawUrl = process.env.POSTGRES_URL;
  const databaseName = process.env.POSTGRES_DATABASE;

  if (!rawUrl) {
    throw new Error("POSTGRES_URL is required");
  }

  if (!databaseName) {
    throw new Error("POSTGRES_DATABASE is required");
  }

  const url = new URL(rawUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function ensureDatabaseExists() {
  const rawUrl = process.env.POSTGRES_URL;
  const databaseName = process.env.POSTGRES_DATABASE;
  const createDatabase = String(process.env.POSTGRES_CREATE_DATABASE ?? "false").toLowerCase() === "true";

  if (!rawUrl || !databaseName) {
    throw new Error("POSTGRES_URL and POSTGRES_DATABASE are required");
  }

  if (!createDatabase) {
    process.env.POSTGRES_APP_URL = buildDatabaseUrl();
    return;
  }

  const adminUrl = new URL(rawUrl);
  const targetDatabase = databaseName.replace(/"/g, "\"\"");
  const client = new Client({
    connectionString: adminUrl.toString(),
    ssl:
      String(process.env.POSTGRES_SSL ?? "false").toLowerCase() === "true"
        ? {
            rejectUnauthorized:
              String(process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED ?? "false").toLowerCase() === "true",
          }
        : false,
  });

  await client.connect();
  const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (result.rowCount === 0) {
    await client.query(`CREATE DATABASE "${targetDatabase}"`);
  }
  await client.end();

  process.env.POSTGRES_APP_URL = buildDatabaseUrl();
}

async function writeRuntimeEnv() {
  await ensureDatabaseExists();
  const targetPath = path.resolve(process.cwd(), ".env.runtime");
  const content = `POSTGRES_APP_URL=${process.env.POSTGRES_APP_URL ?? ""}\n`;
  fs.writeFileSync(targetPath, content, "utf8");
}

writeRuntimeEnv().catch((error) => {
  console.error(error);
  process.exit(1);
});
