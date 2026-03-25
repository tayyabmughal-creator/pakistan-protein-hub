import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { EmptyState } from "../../../src/components/EmptyState";
import { GlassPanel } from "../../../src/components/GlassPanel";
import { MoneyText } from "../../../src/components/MoneyText";
import { ScreenShell } from "../../../src/components/ScreenShell";
import { SearchInput } from "../../../src/components/SearchInput";
import { StatusPill } from "../../../src/components/StatusPill";
import { fetchAdminUsers } from "../../../src/lib/api";
import { formatNumber } from "../../../src/lib/format";
import { colors, radii, spacing, typography } from "../../../src/theme/tokens";

export default function CustomersScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["users"],
    queryFn: fetchAdminUsers,
  });

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data || []).filter((user) => {
      if (!query) return true;
      return (
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        (user.phone_number || "").toLowerCase().includes(query)
      );
    });
  }, [data, search]);

  return (
    <ScreenShell
      title="Customers"
      subtitle={`${formatNumber((data || []).filter((item) => !item.is_staff).length)} customer accounts in the store CRM.`}
      rightAction={
        <Pressable onPress={() => refetch()} style={styles.refreshButton}>
          {isRefetching ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Ionicons name="refresh" size={18} color={colors.text} />
          )}
        </Pressable>
      }
    >
      <GlassPanel style={styles.toolbar}>
        <SearchInput value={search} onChangeText={setSearch} placeholder="Search name, email, or phone" />
      </GlassPanel>

      {isLoading ? (
        <GlassPanel style={styles.loadingPanel}>
          <ActivityIndicator color={colors.primary} />
        </GlassPanel>
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          title="No customers found"
          description="Try searching with a different email, phone number, or name."
          icon={<Ionicons name="people-outline" size={28} color={colors.textMuted} />}
        />
      ) : (
        <View style={styles.stack}>
          {filteredUsers.map((user) => (
            <Pressable key={user.id} onPress={() => router.push(`/(app)/users/${user.id}`)}>
              <GlassPanel style={styles.userCard}>
                <View style={styles.userHeader}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(user.name || user.email).charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{user.name || "No name"}</Text>
                    <Text style={styles.userEmail}>{user.email}</Text>
                  </View>
                  <StatusPill value={user.account_type} />
                </View>

                <View style={styles.userMeta}>
                  <Text style={styles.metaLabel}>{user.phone_number || "No phone"}</Text>
                  <Text style={styles.metaLabel}>{user.order_count} orders</Text>
                  <MoneyText style={styles.metaValue} value={user.total_spent} />
                </View>
              </GlassPanel>
            </Pressable>
          ))}
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.fieldStrong,
    borderWidth: 1,
    borderColor: colors.panelBorder,
  },
  toolbar: {
    padding: spacing.md,
  },
  loadingPanel: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  stack: {
    gap: spacing.md,
  },
  userCard: {
    padding: spacing.md,
    gap: spacing.md,
  },
  userHeader: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.panelBorderStrong,
  },
  avatarText: {
    color: colors.primary,
    fontFamily: typography.display,
    fontSize: 20,
  },
  userName: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
  },
  userEmail: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    marginTop: 4,
  },
  userMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  metaLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  metaValue: {
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    maxWidth: "44%",
    textAlign: "right",
  },
});
