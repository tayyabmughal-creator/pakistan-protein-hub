import { existsSync } from "fs";
import { resolve } from "path";
import type { ExpoConfig } from "expo/config";

const appName = "PakNutrition Admin";
const defaultApiBaseUrl = "https://www.paknutrition.com/api";
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || defaultApiBaseUrl;
const defaultProjectId = "1ade5cf9-e71d-4ca7-95f2-5c3ec9f43138";
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || process.env.EAS_PROJECT_ID || defaultProjectId;
const owner = process.env.EXPO_PUBLIC_EXPO_OWNER || process.env.EXPO_OWNER || "alitayyab";
const scheme = "paknutrition-admin";
const backgroundColor = "#040705";
const primaryColor = "#84cc16";
const androidGoogleServicesPath = process.env.GOOGLE_SERVICES_JSON || "./google-services.json";

const resolveOptionalFile = (candidatePath: string) => {
  const absolutePath = resolve(process.cwd(), candidatePath);
  return existsSync(absolutePath) ? candidatePath : undefined;
};

const androidGoogleServicesFile = resolveOptionalFile(androidGoogleServicesPath);

const config: ExpoConfig = {
  name: appName,
  slug: "paknutritionadmin",
  description: "PakNutrition mobile control room for orders, catalog, customers, payments, and storefront ops.",
  owner,
  scheme,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.paknutrition.adminmobile",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ["remote-notification"],
    },
  },
  android: {
    ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {}),
    adaptiveIcon: {
      backgroundColor,
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    package: "com.paknutrition.adminmobile",
    permissions: ["NOTIFICATIONS"],
  },
  plugins: [
    "expo-router",
    "expo-sharing",
    "expo-font",
    "@react-native-community/datetimepicker",
    [
      "expo-notifications",
      {
        icon: "./assets/android-icon-monochrome.png",
        color: primaryColor,
        defaultChannel: "orders",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Allow PakNutrition Admin to pick product and category photos.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiBaseUrl,
    owner,
    eas: {
      projectId,
    },
    pushConfig: {
      androidConfigured: Boolean(androidGoogleServicesFile),
    },
    scheme,
  },
};

export default config;
