import fs from "node:fs";
import path from "node:path";

function loadDotenv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const out = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const root = path.resolve(import.meta.dirname, "..");
const env = { ...loadDotenv(path.join(root, ".env")), ...process.env };

const username = env.LOCAL_ADMIN;
const password = env.LOCAL_PASS;
if (!username || !password) {
  throw new Error("Missing LOCAL_ADMIN/LOCAL_PASS");
}

const apiBase = (env.API_BASE_URL ?? "http://localhost:3000/api").replace(/\/$/, "");

const loginRes = await fetch(`${apiBase}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username, password }),
});

if (!loginRes.ok) {
  throw new Error(`Login failed: ${loginRes.status}`);
}

const session = await loginRes.json();
const token = session?.token;
if (!token) {
  throw new Error("No token in login response");
}

const listRes = await fetch(`${apiBase}/wallpapers`, {
  headers: { authorization: `Bearer ${token}` },
});
if (!listRes.ok) {
  throw new Error(`List wallpapers failed: ${listRes.status}`);
}

const payload = await listRes.json();
const items = Array.isArray(payload?.items) ? payload.items : [];
const last = items[0] ?? null;

const settingsRes = await fetch(`${apiBase}/settings`, {
  headers: { authorization: `Bearer ${token}` },
});
const settings = settingsRes.ok ? await settingsRes.json() : null;

process.stdout.write(
  JSON.stringify(
    {
      count: items.length,
      latest: last
        ? {
            id: last.id,
            title: last.title,
            filename: last.filename,
            sizeBytes: last.sizeBytes,
            resolution: `${last.width}x${last.height}`,
            uploadedAt: last.uploadedAt,
          }
        : null,
      settings: settings
        ? {
            maxUploadSizeMb: settings.maxUploadSizeMb,
            allowedExtensions: settings.allowedExtensions,
          }
        : null,
    },
    null,
    2,
  ),
);
