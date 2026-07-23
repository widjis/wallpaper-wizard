import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiPost, getStoredSession, storeSession, type AuthSession } from "./api";

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
    setSession(getStoredSession());
    setIsReady(true);
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
        if (session?.token) {
          await apiPost<void>("/auth/logout");
        }
        storeSession(null);
        setSession(null);
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
