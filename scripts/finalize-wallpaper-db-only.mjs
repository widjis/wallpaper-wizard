import dotenv from "dotenv";
import path from "node:path";
import { Client } from "pg";

const repoRoot = path.resolve(import.meta.dirname, "..");

dotenv.config({ path: path.resolve(repoRoot, ".env") });
dotenv.config({ path: path.resolve(repoRoot, ".env.runtime"), override: true });

if (!process.env.POSTGRES_APP_URL) {
  throw new Error("POSTGRES_APP_URL is required. Run `npm run db:prepare` first.");
}

const client = new Client({
  connectionString: process.env.POSTGRES_APP_URL,
});

async function main() {
  await client.connect();

  const pendingBackfill = await client.query(`
    SELECT COUNT(*)::int AS remaining
    FROM "Wallpaper"
    WHERE "imageData" IS NULL
      OR "width" IS NULL
      OR "height" IS NULL
  `);

  const remaining = pendingBackfill.rows[0]?.remaining ?? 0;
  if (remaining > 0) {
    throw new Error(`Cannot finalize database-only storage. Remaining wallpapers without blob metadata: ${remaining}`);
  }

  await client.query(`
    ALTER TABLE "Wallpaper"
    DROP COLUMN IF EXISTS "storagePath"
  `);

  console.log("Wallpaper storage finalized to database-only mode.");
}

try {
  await main();
} finally {
  await client.end();
}
