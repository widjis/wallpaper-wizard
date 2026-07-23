import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const repoRoot = path.resolve(import.meta.dirname, "..");

dotenv.config({ path: path.resolve(repoRoot, ".env") });
dotenv.config({ path: path.resolve(repoRoot, ".env.runtime"), override: true });

if (!process.env.POSTGRES_APP_URL) {
  throw new Error("POSTGRES_APP_URL is required. Run `npm run db:prepare` first.");
}

const result = spawnSync(`npx prisma db push --schema ../../prisma/schema.prisma`, [], {
  cwd: path.resolve(repoRoot, "apps/api"),
  stdio: "inherit",
  env: process.env,
  shell: true,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(path.resolve(repoRoot, ".env.runtime"))) {
  throw new Error(".env.runtime was not created");
}
