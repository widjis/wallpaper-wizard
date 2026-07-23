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
const filePath = env.UPLOAD_PATH ?? path.join(root, "Desktop BG 1.png");

const loginRes = await fetch(`${apiBase}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username, password }),
});
if (!loginRes.ok) {
  const txt = await loginRes.text().catch(() => "");
  throw new Error(`Login failed: ${loginRes.status} ${txt}`);
}
const session = await loginRes.json();
const token = session?.token;
if (!token) throw new Error("No token from login");

const buf = fs.readFileSync(filePath);
const form = new FormData();
form.append("file", new Blob([buf]), path.basename(filePath));

const uploadRes = await fetch(`${apiBase}/wallpapers`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}` },
  body: form,
});

const body = await uploadRes.json().catch(() => null);
process.stdout.write(
  JSON.stringify(
    {
      ok: uploadRes.ok,
      status: uploadRes.status,
      body,
      inputBytes: buf.byteLength,
    },
    null,
    2,
  ),
);
