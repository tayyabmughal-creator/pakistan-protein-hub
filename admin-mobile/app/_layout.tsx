import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import {
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from "@expo-google-fonts/manrope";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";

import { AppErrorBoundary } from "../src/components/AppErrorBoundary";
import { AuthProvider, useAuth } from "../src/providers/AuthProvider";
import { reportAppError } from "../src/lib/errors";
import { colors } from "../src/theme/tokens";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      reportAppError(error, "query", {
        queryKey: JSON.stringify(query.queryKey),
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      reportAppError(error, "mutation", {
        mutationKey: mutation.options.mutationKey ? JSON.stringify(mutation.options.mutationKey) : "unknown",
      });
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const NotificationEffects = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["payment-reviews"] });
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (!session) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (typeof data.orderId === "number") {
        router.push(`/(app)/orders/${data.orderId}`);
        return;
      }
      if (typeof data.orderId === "string") {
        router.push(`/(app)/orders/${data.orderId}`);
        return;
      }
      if (data.screen === "payment-review") {
        router.push("/(app)/payments");
        return;
      }
      router.push("/(app)/(tabs)/orders");
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [queryClient, router, session]);

  return null;
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_700Bold,
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppErrorBoundary>
            <AuthProvider>
              <StatusBar style="light" translucent={false} backgroundColor={colors.background} />
              <NotificationEffects />
              <Stack screenOptions={{ headerShown: false }} />
            </AuthProvider>
          </AppErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
