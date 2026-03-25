import AsyncStorage from "@react-native-async-storage/async-storage";

import { StoredAuthSession } from "../types/api";

const AUTH_STORAGE_KEY = "paknutrition.admin.auth";
const INSTALLATION_ID_KEY = "paknutrition.admin.installation";

let memorySession: StoredAuthSession | null = null;
const listeners = new Set<(session: StoredAuthSession | null) => void>();

const notify = () => {
  listeners.forEach((listener) => listener(memorySession));
};

export const getSessionSnapshot = () => memorySession;

export const subscribeToSession = (listener: (session: StoredAuthSession | null) => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const hydrateStoredSession = async () => {
  if (memorySession) return memorySession;

  const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    memorySession = null;
    return null;
  }

  try {
    memorySession = JSON.parse(raw) as StoredAuthSession;
    return memorySession;
  } catch {
    memorySession = null;
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
};

export const persistSession = async (session: StoredAuthSession) => {
  memorySession = session;
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  notify();
};

export const clearPersistedSession = async () => {
  memorySession = null;
  await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  notify();
};

export const replaceStoredAccessToken = async (accessToken: string, refreshToken?: string) => {
  const current = await hydrateStoredSession();
  if (!current) return null;

  const next: StoredAuthSession = {
    ...current,
    accessToken,
    refreshToken: refreshToken || current.refreshToken,
  };

  await persistSession(next);
  return next;
};

export const ensureInstallationId = async () => {
  const existing = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
  if (existing) return existing;

  const generated = `install-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(INSTALLATION_ID_KEY, generated);
  return generated;
};
