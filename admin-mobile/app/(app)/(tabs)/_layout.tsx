import { StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";

import { colors, typography } from "../../../src/theme/tokens";

const iconMap = {
  dashboard: "grid-outline",
  orders: "receipt-outline",
  catalog: "cube-outline",
  customers: "people-outline",
  more: "ellipsis-horizontal-circle-outline",
} as const;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          height: 74,
          left: 16,
          right: 16,
          bottom: 14,
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          position: "absolute",
          borderRadius: 28,
          overflow: "hidden",
        },
        sceneStyle: {
          backgroundColor: colors.background,
        },
        tabBarLabelStyle: {
          fontFamily: typography.bodyBold,
          fontSize: 11,
          marginTop: 1,
        },
        tabBarBackground: () => (
          <BlurView intensity={36} tint="dark" style={styles.tabBarBackground} />
        ),
        tabBarItemStyle: {
          paddingTop: 2,
        },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={iconMap[route.name as keyof typeof iconMap]} size={size} color={color} />
        ),
      })}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="orders" options={{ title: "Orders" }} />
      <Tabs.Screen name="catalog" options={{ title: "Catalog" }} />
      <Tabs.Screen name="customers" options={{ title: "Customers" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.tabBar,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    borderRadius: 28,
  },
});
