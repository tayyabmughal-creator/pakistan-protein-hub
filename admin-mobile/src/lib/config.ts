import Constants from "expo-constants";

type ExtraConfig = {
  apiBaseUrl?: string;
  scheme?: string;
  eas?: {
    projectId?: string;
  };
  pushConfig?: {
    androidConfigured?: boolean;
  };
};

const extra = (Constants.expoConfig?.extra || {}) as ExtraConfig;

const DEFAULT_API_BASE_URL = "https://www.paknutrition.com/api";
const FALLBACK_API_BASE_URL = extra.apiBaseUrl || process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;

const isLoopbackHost = (hostname: string) => hostname === "127.0.0.1" || hostname === "localhost";

const isPrivateIpv4 = (hostname: string) =>
  /^10\./.test(hostname) ||
  /^192\.168\./.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

const resolveApiBaseUrl = (value: string) => {
  const normalized = value.replace(/\/+$/, "");

  if (typeof window === "undefined") {
    return normalized;
  }

  try {
    const apiUrl = new URL(normalized);
    const pageUrl = new URL(window.location.href);
    const pageIsLocalPreview = isLoopbackHost(pageUrl.hostname);
    const apiIsLocalNetwork = isLoopbackHost(apiUrl.hostname) || isPrivateIpv4(apiUrl.hostname);

    // When we preview the mobile app in a browser on the same machine,
    // localhost is more reliable than the phone-facing LAN IP.
    if (pageIsLocalPreview && apiIsLocalNetwork) {
      apiUrl.hostname = pageUrl.hostname;
      return apiUrl.toString().replace(/\/+$/, "");
    }
  } catch {
    return normalized;
  }

  return normalized;
};

export const API_BASE_URL = resolveApiBaseUrl(FALLBACK_API_BASE_URL);
export const API_ROOT_URL = API_BASE_URL.replace(/\/api$/, "");
export const APP_SCHEME = extra.scheme || "paknutrition-admin";
export const EAS_PROJECT_ID = extra.eas?.projectId || process.env.EXPO_PUBLIC_EAS_PROJECT_ID || "";
export const ANDROID_PUSH_CONFIGURED = Boolean(extra.pushConfig?.androidConfigured);
