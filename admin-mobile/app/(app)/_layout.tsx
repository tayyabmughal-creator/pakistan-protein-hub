import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack } from "expo-router";

import { useAuth } from "../../src/providers/AuthProvider";
import { colors } from "../../src/theme/tokens";

export default function AppLayout() {
  const { loading, session } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    />
  );
}
