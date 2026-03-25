import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { colors } from "../theme/tokens";
import { PushRegistrationState } from "../types/api";
import { ANDROID_PUSH_CONFIGURED, EAS_PROJECT_ID } from "./config";
import { deactivateAdminDevice, registerAdminDevice } from "./api";
import { ensureInstallationId } from "./session";

export const idlePushState: PushRegistrationState = {
  status: "idle",
  token: null,
  lastSyncedAt: null,
  error: null,
};

const ensureAndroidChannel = async () => {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("orders", {
    name: "Orders",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 200, 250],
    lightColor: colors.primary,
    sound: "default",
  });
};

export const syncAdminPushDevice = async (): Promise<PushRegistrationState> => {
  if (!Device.isDevice) {
    return {
      status: "unsupported",
      token: null,
      lastSyncedAt: null,
      error: "Push notifications need a real device build.",
    };
  }

  if (!EAS_PROJECT_ID) {
    return {
      status: "error",
      token: null,
      lastSyncedAt: null,
      error: "Expo project ID is missing, so push notifications cannot be registered in this build.",
    };
  }

  if (Platform.OS === "android" && !ANDROID_PUSH_CONFIGURED) {
    return {
      status: "error",
      token: null,
      lastSyncedAt: null,
      error: "Android push is not configured in this build yet. Add google-services.json and rebuild the app.",
    };
  }

  await ensureAndroidChannel();
  const existingPermissions = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermissions.status;
  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== "granted") {
    return {
      status: "denied",
      token: null,
      lastSyncedAt: null,
      error: "Notification permission was not granted.",
    };
  }

  const projectId = EAS_PROJECT_ID || Constants.expoConfig?.extra?.eas?.projectId;
  let pushToken = "";
  try {
    pushToken = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (Platform.OS === "android" && /FirebaseApp is not initialized/i.test(message)) {
      return {
        status: "error",
        token: null,
        lastSyncedAt: null,
        error: "Android Firebase push setup is missing in this build. Add google-services.json and rebuild the app.",
      };
    }
    throw error;
  }
  const installationId = await ensureInstallationId();

  await registerAdminDevice({
    installation_id: installationId,
    expo_push_token: pushToken,
    device_name: Device.deviceName || "",
    platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "unknown",
    app_version: Constants.expoConfig?.version || "",
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error || "");
    if (/not found|record could not be found/i.test(message)) {
      throw new Error(
        "Push registration endpoint live server par abhi deploy nahi hui. Backend ko latest mobile-push update ke saath deploy karke phir Refresh dabao.",
      );
    }
    throw error;
  });

  return {
    status: "ready",
    token: pushToken,
    lastSyncedAt: new Date().toISOString(),
    error: null,
  };
};

export const deactivateAdminPushDevice = async (token?: string | null) => {
  const installationId = await ensureInstallationId();
  await deactivateAdminDevice({
    installation_id: installationId,
    expo_push_token: token || undefined,
  });
};
