import axios from "axios";

import { API_BASE_URL } from "./config";
import { reportAppError, toAppError } from "./errors";
import {
  clearPersistedSession,
  getSessionSnapshot,
  hydrateStoredSession,
  replaceStoredAccessToken,
} from "./session";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: {
    "Content-Type": "application/json",
    "X-Client-App": "paknutrition-admin-mobile",
  },
});

let refreshPromise: Promise<string | null> | null = null;

const AUTH_EXCLUDED_PATHS = new Set([
  "/users/login/",
  "/users/register/",
  "/users/password-reset/",
  "/users/password-reset-confirm/",
  "/users/token/refresh/",
]);

apiClient.interceptors.request.use(async (config) => {
  const activeSession = getSessionSnapshot() || (await hydrateStoredSession());
  if (activeSession?.accessToken) {
    config.headers.Authorization = `Bearer ${activeSession.accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const requestPath = originalRequest.url || "";
    const shouldSkipAuthFlow = AUTH_EXCLUDED_PATHS.has(requestPath);

    if (error.response?.status !== 401 || originalRequest._retry || shouldSkipAuthFlow) {
      return Promise.reject(
        reportAppError(error, "api-response", {
          path: requestPath,
          status: error.response?.status || null,
        }),
      );
    }

    const currentSession = getSessionSnapshot() || (await hydrateStoredSession());
    if (!currentSession?.refreshToken) {
      await clearPersistedSession();
      return Promise.reject(toAppError(error));
    }

    originalRequest._retry = true;

    if (!refreshPromise) {
      refreshPromise = axios
        .post(`${API_BASE_URL}/users/token/refresh/`, {
          refresh: currentSession.refreshToken,
        })
        .then(async (response) => {
          const nextSession = await replaceStoredAccessToken(
            response.data.access,
            response.data.refresh || currentSession.refreshToken,
          );
          return nextSession?.accessToken || null;
        })
        .catch(async () => {
          await clearPersistedSession();
          return null;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }

    const accessToken = await refreshPromise;
    if (!accessToken) {
      return Promise.reject(new Error("Your session expired. Please sign in again."));
    }

    originalRequest.headers = originalRequest.headers || {};
    originalRequest.headers.Authorization = `Bearer ${accessToken}`;
    return apiClient(originalRequest);
  },
);

export default apiClient;
