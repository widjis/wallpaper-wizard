export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000/api";

const authStorageKey = "cwcm.auth";

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

export function storeSession(session: AuthSession | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(authStorageKey);
    return;
  }
  window.localStorage.setItem(authStorageKey, JSON.stringify(session));
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
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
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
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

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const session = getStoredSession();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: session?.token ? { Authorization: `Bearer ${session.token}` } : undefined,
    body: formData,
  });
  return parseResponse<T>(response);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
