import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

import { PushRegistrationState, SessionUser, StoredAuthSession } from "../types/api";
import { clearPersistedSession, hydrateStoredSession, persistSession, subscribeToSession } from "../lib/session";
import { deactivateAdminPushDevice, idlePushState, syncAdminPushDevice } from "../lib/push";
import { loginAdmin, logoutUser } from "../lib/api";

type AuthContextValue = {
  session: StoredAuthSession | null;
  user: SessionUser | null;
  loading: boolean;
  pushState: PushRegistrationState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshPushRegistration: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<StoredAuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushState, setPushState] = useState<PushRegistrationState>(idlePushState);

  useEffect(() => {
    let mounted = true;

    hydrateStoredSession()
      .then(async (stored) => {
        if (stored && !stored.user.is_staff) {
          await clearPersistedSession();
          if (mounted) {
            setSession(null);
          }
          return;
        }
        if (mounted) {
          setSession(stored);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    const unsubscribe = subscribeToSession((nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const refreshPushRegistration = async () => {
    if (!session?.user.is_staff) {
      setPushState(idlePushState);
      return;
    }

    setPushState((current) => ({ ...current, status: "syncing", error: null }));
    try {
      const result = await syncAdminPushDevice();
      setPushState(result);
    } catch (error) {
      setPushState({
        status: "error",
        token: null,
        lastSyncedAt: null,
        error: error instanceof Error ? error.message : "Could not register this device for push notifications.",
      });
    }
  };

  useEffect(() => {
    if (!session?.user.is_staff) {
      setPushState(idlePushState);
      return;
    }

    refreshPushRegistration().catch(() => undefined);
  }, [session?.accessToken, session?.user.id, session?.user.is_staff]);

  const login = async (email: string, password: string) => {
    const data = await loginAdmin(email.trim(), password);
    if (!data.is_staff) {
      throw new Error("This mobile app is only for admin and staff accounts.");
    }

    const nextSession: StoredAuthSession = {
      accessToken: data.access,
      refreshToken: data.refresh,
      user: {
        id: data.id,
        name: data.name,
        email: data.email,
        is_staff: data.is_staff,
      },
    };

    await persistSession(nextSession);
  };

  const logout = async () => {
    try {
      await deactivateAdminPushDevice(pushState.token);
    } catch {
      // Best effort: logout should not block if push unregister fails.
    }

    try {
      if (session?.refreshToken) {
        await logoutUser(session.refreshToken);
      }
    } catch {
      // Even if refresh token is already invalid, local logout should continue.
    }

    await clearPersistedSession();
    setPushState(idlePushState);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user || null,
      loading,
      pushState,
      login,
      logout,
      refreshPushRegistration,
    }),
    [loading, pushState, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
};
