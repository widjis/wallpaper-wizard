import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  apiPost,
  apiGet,
  getStoredSession,
  storeSession,
  subscribeAuthChange,
  type AuthSession,
} from "./api";

interface AuthContextValue {
  session: AuthSession | null;
  isAuthenticated: boolean;
  isReady: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const storedSession = getStoredSession();
    let cancelled = false;

    const hydrateSession = async () => {
      if (!storedSession) {
        if (!cancelled) setIsReady(true);
        return;
      }

      try {
        const validated = await apiGet<Pick<AuthSession, "user" | "expiresAt">>("/auth/session");
        const refreshedSession = { ...storedSession, ...validated };
        storeSession(refreshedSession);
        if (!cancelled) setSession(refreshedSession);
      } catch {
        // A 401 clears storage centrally. Temporary server failures keep the
        // existing session so the UI can offer retry instead of forcing login.
        if (!cancelled) setSession(getStoredSession());
      } finally {
        if (!cancelled) setIsReady(true);
      }
    };

    void hydrateSession();

    const unsubscribe = subscribeAuthChange(() => {
      setSession(getStoredSession());
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session?.token),
      isReady,
      login: async (username: string, password: string) => {
        const result = await apiPost<AuthSession>("/auth/login", { username, password });
        storeSession(result);
        setSession(result);
      },
      logout: async () => {
        try {
          if (session?.token) {
            await apiPost<void>("/auth/logout");
          }
        } finally {
          storeSession(null);
          setSession(null);
        }
      },
    }),
    [isReady, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
