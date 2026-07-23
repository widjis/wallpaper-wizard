export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "/api";

const authStorageKey = "cwcm.auth";
const authChangeEventName = "cwcm:auth-changed";

export interface AuthSession {
  token: string;
  user: {
    id: string;
    username: string;
    role: string;
    isActive: boolean;
    lastLoginAt: string | null;
  };
}

export function getStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(authStorageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

function notifyAuthChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(authChangeEventName));
}

export function storeSession(session: AuthSession | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(authStorageKey);
    notifyAuthChange();
    return;
  }
  window.localStorage.setItem(authStorageKey, JSON.stringify(session));
  notifyAuthChange();
}

export function subscribeAuthChange(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = () => callback();
  window.addEventListener(authChangeEventName, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(authChangeEventName, handler);
    window.removeEventListener("storage", handler);
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;

    if (response.status === 401) {
      storeSession(null);
    }

    throw new Error(payload?.message ?? `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function buildApiUrl(path: string): string {
  return `${apiBaseUrl}${resolveApiPath(path)}`;
}

export function resolveApiPath(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    const parsed = new URL(pathOrUrl);
    return parsed.pathname.replace(/^\/api/, "");
  }

  return pathOrUrl.replace(/^\/api/, "");
}

export async function apiGet<T>(path: string): Promise<T> {
  const session = getStoredSession();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: session?.token ? { Authorization: `Bearer ${session.token}` } : undefined,
  });
  return parseResponse<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const session = getStoredSession();
  const hasBody = body !== undefined;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  return parseResponse<T>(response);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const session = getStoredSession();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const session = getStoredSession();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

export async function apiDelete(path: string): Promise<void> {
  const session = getStoredSession();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "DELETE",
    headers: session?.token ? { Authorization: `Bearer ${session.token}` } : undefined,
  });
  return parseResponse<void>(response);
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const session = getStoredSession();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: session?.token ? { Authorization: `Bearer ${session.token}` } : undefined,
    body: formData,
  });
  return parseResponse<T>(response);
}

export async function apiImageUrl(path: string): Promise<string> {
  const session = getStoredSession();
  const response = await fetch(buildApiUrl(path), {
    headers: session?.token ? { Authorization: `Bearer ${session.token}` } : undefined,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? `Image request failed with status ${response.status}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function downloadTextFile(filename: string, content: string, mimeType = "text/plain") {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export function formatDateTime(value: string | null | undefined, timeZone?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timeZone ?? undefined,
    timeZoneName: timeZone ? "short" : undefined,
  }).format(new Date(value));
}

export function formatDate(value: string | null | undefined, timeZone?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: timeZone ?? undefined,
  }).format(new Date(value));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
